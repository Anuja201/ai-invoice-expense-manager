import os
import re
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.ai_categorizer import categorize
from routes.ocr import process_document_extraction

logger = logging.getLogger("expenses_route")

expenses_bp = Blueprint("expenses", __name__)

UPLOAD_FOLDER = "uploads/receipts"
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

VALID_PAYMENT_METHODS = {"cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"}


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


def sanitize_payment_method(pm):
    """Ensure payment_method matches MySQL ENUM values."""
    if not pm:
        return "upi"
    p = str(pm).lower().strip().replace("-", "_").replace(" ", "_")
    if p in VALID_PAYMENT_METHODS:
        return p
    if "card" in p:
        return "credit_card" if "credit" in p else "debit_card"
    if "bank" in p or "transfer" in p:
        return "bank_transfer"
    if "upi" in p or "gpay" in p or "phonepe" in p or "paytm" in p:
        return "upi"
    if "cash" in p:
        return "cash"
    return "other"


def serialize_expense(exp):
    """Serialize datetime fields and convert decimal types for frontend."""
    if not exp:
        return None
    for field in ["created_at", "updated_at"]:
        if exp.get(field):
            exp[field] = exp[field].isoformat()
    if exp.get("receipt_date"):
        exp["receipt_date"] = str(exp["receipt_date"])
    if exp.get("ai_confidence") is not None:
        exp["ai_confidence"] = int(exp["ai_confidence"])
    return exp


@expenses_bp.route("/", methods=["GET"])
@jwt_required()
def list_expenses():
    """List all expenses with optional category and date filters."""
    user_id = get_jwt_identity()
    category_id = request.args.get("category_id")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    search = request.args.get("search", "")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            query = """
                SELECT e.*, c.name as category_name, c.color as category_color
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
            """
            params = [user_id]

            if category_id:
                query += " AND e.category_id = %s"
                params.append(category_id)
            if start_date:
                query += " AND e.receipt_date >= %s"
                params.append(start_date)
            if end_date:
                query += " AND e.receipt_date <= %s"
                params.append(end_date)
            if search:
                query += " AND (e.title LIKE %s OR e.vendor LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            query += " ORDER BY e.receipt_date DESC, e.created_at DESC"
            cursor.execute(query, params)
            expenses = cursor.fetchall()

        return jsonify({"expenses": [serialize_expense(e) for e in expenses]}), 200
    except Exception as e:
        logger.error(f"Error listing expenses: {e}", exc_info=True)
        return jsonify({"error": f"Failed to list expenses: {str(e)}"}), 500
    finally:
        conn.close()


@expenses_bp.route("/", methods=["POST"])
@jwt_required()
def create_expense():
    """Create a new expense with AI categorization."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    vendor = data.get("vendor", "").strip()
    title = (data.get("title") or f"Expense - {vendor or 'General'}").strip()
    amount = float(data.get("amount", 0))
    description = data.get("description", "")
    
    clean_date = parse_clean_date(data.get("receipt_date"))
    receipt_date = clean_date if clean_date else datetime.now().strftime("%Y-%m-%d")
    
    payment_method = sanitize_payment_method(data.get("payment_method"))
    receipt_file = data.get("receipt_file") or data.get("file_name") or None

    if not title or amount <= 0:
        return jsonify({"error": "Title and a valid amount greater than 0 are required"}), 400

    # AI categorize based on title + vendor + description
    ai_result = categorize(f"{title} {vendor} {description}")
    ai_cat_name = data.get("ai_category") or ai_result["category"]
    ai_conf = data.get("ai_confidence") or ai_result["confidence"]

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Resolve category id
            cursor.execute(
                "SELECT id FROM categories WHERE name = %s LIMIT 1",
                (ai_cat_name,)
            )
            cat = cursor.fetchone()
            category_id = cat["id"] if cat else None

            cursor.execute("""
                INSERT INTO expenses
                (user_id, title, amount, category_id, ai_category, ai_confidence,
                 description, vendor, receipt_date, payment_method, receipt_file)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id, title, amount, category_id,
                ai_cat_name, ai_conf,
                description, vendor, receipt_date, payment_method, receipt_file
            ))
            conn.commit()
            new_id = cursor.lastrowid

            cursor.execute("""
                SELECT e.*, c.name as category_name, c.color as category_color
                FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.id = %s
            """, (new_id,))
            expense = cursor.fetchone()

        return jsonify({
            "message": "Expense added successfully",
            "expense": serialize_expense(expense),
            "ai_category": ai_result
        }), 201
    except Exception as e:
        conn.rollback()
        logger.error(f"Error creating expense: {e}", exc_info=True)
        return jsonify({"error": f"Failed to save expense: {str(e)}"}), 500
    finally:
        conn.close()


@expenses_bp.route("/<int:expense_id>", methods=["GET"])
@jwt_required()
def get_expense(expense_id):
    """Get single expense by ID."""
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT e.*, c.name as category_name, c.color as category_color
                FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.id = %s AND e.user_id = %s
            """, (expense_id, user_id))
            expense = cursor.fetchone()

        if not expense:
            return jsonify({"error": "Expense not found"}), 404

        return jsonify({"expense": serialize_expense(expense)}), 200
    finally:
        conn.close()


@expenses_bp.route("/<int:expense_id>", methods=["PUT"])
@jwt_required()
def update_expense(expense_id):
    """Update expense fields; re-categorize if title/vendor changes."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM expenses WHERE id = %s AND user_id = %s",
                (expense_id, user_id)
            )
            existing = cursor.fetchone()
            if not existing:
                return jsonify({"error": "Expense not found"}), 404

            allowed = ["title", "amount", "vendor", "description", "receipt_date", "payment_method", "status", "receipt_file"]
            updates = {k: v for k, v in data.items() if k in allowed}

            if "payment_method" in updates:
                updates["payment_method"] = sanitize_payment_method(updates["payment_method"])

            if "receipt_date" in updates:
                clean_d = parse_clean_date(updates["receipt_date"])
                updates["receipt_date"] = clean_d if clean_d else datetime.now().strftime("%Y-%m-%d")

            # Re-run AI if title/vendor changed
            if "title" in updates or "vendor" in updates:
                title = updates.get("title", existing["title"])
                vendor = updates.get("vendor", existing["vendor"] or "")
                desc = updates.get("description", existing["description"] or "")
                ai_result = categorize(f"{title} {vendor} {desc}")
                updates["ai_category"] = ai_result["category"]
                updates["ai_confidence"] = ai_result["confidence"]

                cursor.execute(
                    "SELECT id FROM categories WHERE name = %s LIMIT 1",
                    (ai_result["category"],)
                )
                cat = cursor.fetchone()
                updates["category_id"] = cat["id"] if cat else None

            if updates:
                if "amount" in updates:
                    try:
                        amt_val = float(updates["amount"])
                        if amt_val <= 0:
                            return jsonify({"error": "Amount must be greater than zero"}), 400
                        updates["amount"] = amt_val
                    except (ValueError, TypeError):
                        return jsonify({"error": "Invalid amount"}), 400

                set_clause = ", ".join(f"{k} = %s" for k in updates)
                cursor.execute(
                    f"UPDATE expenses SET {set_clause} WHERE id = %s AND user_id = %s",
                    (*updates.values(), expense_id, user_id)
                )
                conn.commit()

            cursor.execute("""
                SELECT e.*, c.name as category_name, c.color as category_color
                FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.id = %s AND e.user_id = %s
            """, (expense_id, user_id))
            expense = cursor.fetchone()

        return jsonify({"message": "Expense updated", "expense": serialize_expense(expense)}), 200
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating expense: {e}", exc_info=True)
        return jsonify({"error": f"Failed to update expense: {str(e)}"}), 500
    finally:
        conn.close()


@expenses_bp.route("/<int:expense_id>", methods=["DELETE"])
@jwt_required()
def delete_expense(expense_id):
    """Delete an expense."""
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM expenses WHERE id = %s AND user_id = %s",
                (expense_id, user_id)
            )
            if not cursor.fetchone():
                return jsonify({"error": "Expense not found"}), 404

            cursor.execute("DELETE FROM expenses WHERE id = %s AND user_id = %s", (expense_id, user_id))
            conn.commit()

        return jsonify({"message": "Expense deleted"}), 200
    except Exception as e:
        conn.rollback()
        logger.error(f"Error deleting expense: {e}", exc_info=True)
        return jsonify({"error": f"Failed to delete expense: {str(e)}"}), 500
    finally:
        conn.close()


ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp", "webp", "doc", "docx"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@expenses_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_expense():
    """
    Upload receipt image or PDF, store the file, run OCR & AI pipeline,
    and return structured OCR data for user review and editing before saving.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part. Use field name 'file'"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "error": "Invalid file type. Allowed: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP, DOC, DOCX"
        }), 400

    from werkzeug.utils import secure_filename

    filename = secure_filename(file.filename)
    unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{filename}"
    permanent_path = os.path.join(UPLOAD_FOLDER, unique_filename)

    try:
        file.save(permanent_path)
    except Exception as e:
        return jsonify({"error": "Could not save uploaded file", "details": str(e)}), 500

    try:
        user_id = get_jwt_identity()
        res = process_document_extraction(permanent_path, filename, user_id=user_id)

        raw_ocr_text = res.get("extracted_text", "")
        invoice_data = res.get("invoice", {})
        extraction_method = res.get("extraction_method", "ocr")

        vendor_val = invoice_data.get("vendor")
        if isinstance(vendor_val, dict):
            vendor = vendor_val.get("name")
        else:
            vendor = vendor_val

        if vendor in ("Not detected", "No readable text found in PDF", "No readable text found", "None", None):
            vendor = ""

        amount = invoice_data.get("total_amount")
        if amount is None or amount == 0:
            amount = invoice_data.get("subtotal")

        raw_date = invoice_data.get("invoice_date") or invoice_data.get("due_date")
        clean_date = parse_clean_date(raw_date)
        receipt_date = clean_date if clean_date else datetime.now().strftime("%Y-%m-%d")

        title = f"Expense - {vendor}" if vendor else f"Receipt Expense ({filename})"

        # Describe items if extracted
        items = invoice_data.get("items", [])
        items_str = ", ".join([f"{it.get('description')}" for it in items if it.get('description')])
        desc_parts = []
        if vendor:
            desc_parts.append(f"Vendor: {vendor}")
        if items_str:
            desc_parts.append(f"Items: {items_str[:120]}")
        description = " | ".join(desc_parts) if desc_parts else ""

        # AI Categorization
        ai_result = categorize(f"{title} {vendor} {description} {raw_ocr_text[:300]}")

        extracted_expense = {
            "title": title,
            "vendor": vendor,
            "amount": float(amount) if amount is not None else 0.0,
            "receipt_date": receipt_date,
            "payment_method": "upi",
            "description": description,
            "raw_text": raw_ocr_text,
            "ai_category": ai_result["category"],
            "ai_confidence": ai_result["confidence"],
            "file_name": unique_filename,
            "file_url": f"/api/uploads/receipts/{unique_filename}",
            "insights": res.get("insights", []),
            "validations": res.get("validations", [])
        }

        print(f"\n[EXPENSE UPLOAD LOG] File: {filename} | Method: {extraction_method}", flush=True)
        print(f"[EXPENSE UPLOAD LOG] Raw Text Characters: {len(raw_ocr_text)}", flush=True)
        print(f"[EXPENSE UPLOAD LOG] Extracted Expense: {extracted_expense}\n", flush=True)

        return jsonify({
            "message": "Receipt uploaded and extracted successfully",
            "extracted_data": extracted_expense,
            "extraction_method": extraction_method,
            "file_name": unique_filename,
            "file_url": f"/api/uploads/receipts/{unique_filename}"
        }), 200

    except Exception as e:
        logger.error(f"Error extracting expense receipt: {e}", exc_info=True)
        if os.path.exists(permanent_path):
            try:
                os.remove(permanent_path)
            except Exception:
                pass
        return jsonify({"error": "Receipt extraction failed", "details": str(e)}), 500


