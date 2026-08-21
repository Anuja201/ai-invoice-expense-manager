"""
routes/invoices.py

CRUD operations for client invoices, including upload/OCR integration for PDF, Images, and Word DOC/DOCX documents,
line item database persistence, and validation checks.
"""

import os
import random
import string
import logging
from datetime import datetime
# pyrefly: ignore [missing-import]
from werkzeug.utils import secure_filename

# pyrefly: ignore [missing-import]
from flask import Blueprint, request, jsonify, send_from_directory
# pyrefly: ignore [missing-import]
from flask_jwt_extended import jwt_required, get_jwt_identity

from utils.db import get_db
from utils.ai_categorizer import categorize
from config import Config

logger = logging.getLogger("invoices_route")

invoices_bp = Blueprint("invoices", __name__)

UPLOAD_FOLDER = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    Config.UPLOAD_FOLDER
)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = Config.ALLOWED_EXTENSIONS


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_invoice_number():
    """Generate unique invoice number like INV-2026-XXXX"""
    year = datetime.now().year
    suffix = "".join(random.choices(string.digits, k=4))
    return f"INV-{year}-{suffix}"


def serialize_invoice(inv):
    """Convert datetime fields to ISO strings for JSON serialization."""
    if not inv:
        return None
    for field in ["created_at", "updated_at"]:
        if inv.get(field):
            inv[field] = inv[field].isoformat()
    if inv.get("due_date"):
        inv["due_date"] = str(inv["due_date"])
    if inv.get("ai_confidence") is not None:
        inv["ai_confidence"] = int(inv["ai_confidence"])
    return inv


import re

def parse_clean_date(date_val):
    """Safely parse date strings into YYYY-MM-DD or return None for MySQL DATE columns."""
    if not date_val or str(date_val).strip().lower() in ("", "none", "null", "not detected", "n/a", "unknown"):
        return None
    d_str = str(date_val).strip()
    patterns = [
        ("%Y-%m-%d", r"^\d{4}-\d{2}-\d{2}$"),
        ("%d/%m/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
        ("%d-%m-%Y", r"^\d{1,2}-\d{1,2}-\d{4}$"),
        ("%m/%d/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
        ("%Y/%m/%d", r"^\d{4}/\d{1,2}/\d{1,2}$"),
    ]
    for fmt_str, regex in patterns:
        if re.match(regex, d_str):
            try:
                dt = datetime.strptime(d_str, fmt_str)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
    m = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", d_str)
    if m:
        y, m_, d = m.groups()
        return f"{y}-{int(m_):02d}-{int(d):02d}"
    return None


VALID_STATUSES = {"draft", "sent", "paid", "unpaid", "overdue", "cancelled"}

def sanitize_status(status_val):
    """Sanitize status string to match MySQL ENUM('draft','sent','paid','unpaid','overdue','cancelled')."""
    if not status_val:
        return "draft"
    st = str(status_val).strip().lower()
    if st in VALID_STATUSES:
        return st
    if "paid" in st and "unpaid" not in st:
        return "paid"
    if "unpaid" in st or "pending" in st:
        return "unpaid"
    if "overdue" in st:
        return "overdue"
    if "cancel" in st:
        return "cancelled"
    if "sent" in st:
        return "sent"
    return "draft"


def safe_float(val, default=0.0):
    if val is None or val == "":
        return default
    try:
        if isinstance(val, str):
            val = re.sub(r'[^\d.-]', '', val)
        return float(val) if val else default
    except (ValueError, TypeError):
        return default


# ──────────────────────── CRUD Endpoints ──────────────────────── #

@invoices_bp.route("/", methods=["GET"])
@jwt_required()
def list_invoices():
    user_id = get_jwt_identity()
    status_filter = request.args.get("status")
    search = request.args.get("search", "")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            query = """
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i
                LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.user_id = %s
            """
            params = [user_id]

            if status_filter:
                query += " AND i.status = %s"
                params.append(sanitize_status(status_filter))

            if search:
                query += " AND (i.client_name LIKE %s OR i.invoice_number LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            query += " ORDER BY i.created_at DESC"
            cursor.execute(query, params)
            invoices = cursor.fetchall()

        return jsonify({"invoices": [serialize_invoice(i) for i in invoices]}), 200
    finally:
        conn.close()


@invoices_bp.route("/", methods=["POST"])
@jwt_required()
def create_invoice():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    client_name = (data.get("client_name") or data.get("vendor_name") or data.get("vendor") or "General Client").strip()
    amount = safe_float(data.get("amount") or data.get("subtotal"), 0.0)
    tax = safe_float(data.get("tax") or data.get("tax_amount"), 0.0)
    total_amount = safe_float(data.get("total_amount"), 0.0)

    if total_amount <= 0 and amount > 0:
        total_amount = amount + tax
    elif amount <= 0 and total_amount > 0:
        amount = max(0.0, total_amount - tax)

    description = data.get("description", "")
    due_date = parse_clean_date(data.get("due_date"))
    status = sanitize_status(data.get("status"))
    file_name = data.get("file_name")
    provided_inv_num = data.get("invoice_number")
    items = data.get("items") or data.get("line_items") or []

    if not client_name or total_amount <= 0:
        return jsonify({"error": "Client/Vendor name and a valid total amount are required"}), 400

    ai_result = categorize(f"{description} {client_name}")
    ai_cat_name = data.get("ai_category") or ai_result["category"]
    ai_conf = data.get("ai_confidence") or ai_result["confidence"]

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM categories WHERE name = %s LIMIT 1",
                (ai_cat_name,)
            )
            cat = cursor.fetchone()
            category_id = cat["id"] if cat else None

            invoice_number = provided_inv_num if (provided_inv_num and str(provided_inv_num).strip().lower() not in ("not detected", "none", "null", "")) else generate_invoice_number()

            # Duplicate check
            cursor.execute(
                "SELECT id FROM invoices WHERE invoice_number = %s AND user_id = %s LIMIT 1",
                (invoice_number, user_id)
            )
            if cursor.fetchone():
                if provided_inv_num:
                    invoice_number = f"{invoice_number}-{random.randint(100, 999)}"
                else:
                    invoice_number = generate_invoice_number()

            cursor.execute("""
                INSERT INTO invoices
                (user_id, invoice_number, client_name, client_email, amount, tax, total_amount,
                status, category_id, description, due_date, file_name, ai_category, ai_confidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id, invoice_number, client_name,
                data.get("client_email", ""),
                amount, tax, total_amount,
                status, category_id, description, due_date,
                file_name, ai_cat_name, ai_conf
            ))
            new_id = cursor.lastrowid

            # Insert line items if present
            for item in items:
                desc = str(item.get("description") or "Line item").strip()
                qty = safe_float(item.get("quantity"), 1.0)
                u_price = safe_float(item.get("unit_price"), 0.0)
                tot = safe_float(item.get("total") or item.get("total_price"), qty * u_price)
                cursor.execute("""
                    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price)
                    VALUES (%s, %s, %s, %s, %s)
                """, (new_id, desc, qty, u_price, tot))

            conn.commit()

            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id = %s
            """, (new_id,))
            invoice = cursor.fetchone()

            if invoice:
                cursor.execute("SELECT * FROM invoice_items WHERE invoice_id = %s", (new_id,))
                invoice["items"] = cursor.fetchall()

        return jsonify({"message": "Invoice saved successfully", "invoice": serialize_invoice(invoice)}), 201
    except Exception as e:
        conn.rollback()
        logger.error(f"Error saving invoice: {e}", exc_info=True)
        return jsonify({"error": f"Failed to save invoice record: {str(e)}"}), 500
    finally:
        conn.close()


@invoices_bp.route("/<int:invoice_id>", methods=["GET"])
@jwt_required()
def get_invoice(invoice_id):
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id = %s AND i.user_id = %s
            """, (invoice_id, user_id))
            invoice = cursor.fetchone()

            if not invoice:
                return jsonify({"error": "Invoice not found"}), 404

            cursor.execute("SELECT * FROM invoice_items WHERE invoice_id = %s", (invoice_id,))
            invoice["items"] = cursor.fetchall()

        return jsonify({"invoice": serialize_invoice(invoice)}), 200
    finally:
        conn.close()


@invoices_bp.route("/<int:invoice_id>", methods=["PUT"])
@jwt_required()
def update_invoice(invoice_id):
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
            if not cursor.fetchone():
                return jsonify({"error": "Invoice not found"}), 404

            fields = []
            params = []
            for col in ["client_name", "client_email", "description", "ai_category"]:
                if col in data:
                    fields.append(f"{col} = %s")
                    params.append(data[col])

            if "status" in data:
                fields.append("status = %s")
                params.append(sanitize_status(data["status"]))

            if "due_date" in data:
                fields.append("due_date = %s")
                params.append(parse_clean_date(data["due_date"]))

            if "amount" in data:
                fields.append("amount = %s")
                params.append(safe_float(data["amount"]))
            if "tax" in data:
                fields.append("tax = %s")
                params.append(safe_float(data["tax"]))
            if "total_amount" in data:
                fields.append("total_amount = %s")
                params.append(safe_float(data["total_amount"]))

            if fields:
                params.extend([invoice_id, user_id])
                cursor.execute(f"UPDATE invoices SET {', '.join(fields)} WHERE id = %s AND user_id = %s", params)

            if "items" in data and isinstance(data["items"], list):
                cursor.execute("DELETE FROM invoice_items WHERE invoice_id = %s", (invoice_id,))
                for item in data["items"]:
                    desc = str(item.get("description") or "Line item").strip()
                    qty = safe_float(item.get("quantity"), 1.0)
                    u_price = safe_float(item.get("unit_price"), 0.0)
                    tot = safe_float(item.get("total") or item.get("total_price"), qty * u_price)
                    cursor.execute("""
                        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (invoice_id, desc, qty, u_price, tot))

            conn.commit()

            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id = %s
            """, (invoice_id,))
            invoice = cursor.fetchone()

            if invoice:
                cursor.execute("SELECT * FROM invoice_items WHERE invoice_id = %s", (invoice_id,))
                invoice["items"] = cursor.fetchall()

        return jsonify({"message": "Invoice updated", "invoice": serialize_invoice(invoice)}), 200
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating invoice: {e}", exc_info=True)
        return jsonify({"error": f"Failed to update invoice: {str(e)}"}), 500
    finally:
        conn.close()


@invoices_bp.route("/<int:invoice_id>", methods=["DELETE"])
@jwt_required()
def delete_invoice(invoice_id):
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT file_name FROM invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
            invoice = cursor.fetchone()
            if not invoice:
                return jsonify({"error": "Invoice not found"}), 404

            if invoice.get("file_name"):
                f_path = os.path.join(UPLOAD_FOLDER, invoice["file_name"])
                if os.path.exists(f_path):
                    try:
                        os.remove(f_path)
                    except Exception:
                        pass

            cursor.execute("DELETE FROM invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
            conn.commit()

        return jsonify({"message": "Invoice deleted"}), 200
    finally:
        conn.close()


@invoices_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_invoice():
    """
    Upload invoice image, PDF, or Word (DOC/DOCX) file, store permanently,
    run OCR & AI extraction pipeline, validate, generate insights, and return structured payload.
    """
    user_id = get_jwt_identity()

    if "file" not in request.files:
        return jsonify({"error": "No file part in request. Use form field name 'file'"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "error": "Invalid file format. Supported formats: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP, DOC, DOCX"
        }), 400

    filename = secure_filename(file.filename)
    
    from utils.storage import temp_file, store_file
    
    try:
        with temp_file(file.stream, filename) as tmp_path:
            from routes.ocr import process_document_extraction

            result = process_document_extraction(
                tmp_path,
                filename,
                user_id=user_id
            )
            
            file.stream.seek(0)
            storage_result = store_file(tmp_path, filename, subfolder="invoices")

        extracted_text = result.get("extracted_text", "")
        invoice_obj = result.get("invoice", {})
        insights_obj = result.get("insights", {})
        validations_list = result.get("validations", [])
        method = result.get("extraction_method", "unknown")

        logger.info(f"[INVOICE UPLOAD LOG] File: {filename} | Method: {method} | Characters Extracted: {len(extracted_text)}")

        # Build comprehensive output compatible with Requirement 7 and existing UI components
        extracted_data_compat = {
            "vendor": invoice_obj.get("vendor", {}).get("name"),
            "vendor_address": invoice_obj.get("vendor", {}).get("address"),
            "vendor_tax_id": invoice_obj.get("vendor", {}).get("tax_id"),
            "customer": invoice_obj.get("customer", {}).get("name"),
            "customer_address": invoice_obj.get("customer", {}).get("address"),
            "customer_tax_id": invoice_obj.get("customer", {}).get("tax_id"),
            "invoice_number": invoice_obj.get("invoice_number"),
            "date": invoice_obj.get("invoice_date"),
            "due_date": invoice_obj.get("due_date"),
            "subtotal": invoice_obj.get("subtotal"),
            "tax": invoice_obj.get("tax_amount"),
            "discount": invoice_obj.get("discount_amount", 0.0),
            "total_amount": invoice_obj.get("total_amount"),
            "currency": invoice_obj.get("currency", "INR"),
            "payment_status": invoice_obj.get("payment_status", "Unknown"),
            "line_items": invoice_obj.get("items", []),
            "raw_text": extracted_text,
            "structured_data": invoice_obj,
            "validations": validations_list,
            "insights": insights_obj
        }

        return jsonify({
            "success": True,
            "filename": filename,
            "extracted_text": extracted_text,
            "invoice": invoice_obj,
            "insights": insights_obj,
            "validations": validations_list,
            "file_name": storage_result.storage_key,
            "file_url": storage_result.file_url,
            "extraction_method": method,
            "extracted_data": extracted_data_compat,
            "structured_data": invoice_obj
        }), 200

    except Exception as e:
        logger.error(f"Invoice processing error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "OCR failed: Unable to process image or document",
            "details": str(e)
        }), 500