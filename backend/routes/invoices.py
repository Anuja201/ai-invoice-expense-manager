"""
routes/invoices.py - Invoice CRUD endpoints
Supports create, list, get, update, delete, and PDF upload + AI categorization.
PDF upload uses the OCR pipeline from routes/ocr.py to extract structured data.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.ai_categorizer import categorize
from config import Config
import random
import string
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import tempfile

invoices_bp = Blueprint("invoices", __name__)

UPLOAD_FOLDER = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    Config.UPLOAD_FOLDER
)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = Config.ALLOWED_EXTENSIONS

# Ensure upload folder exists


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_invoice_number():
    """Generate unique invoice number like INV-2024-XXXX"""
    year = datetime.now().year
    suffix = "".join(random.choices(string.digits, k=4))
    return f"INV-{year}-{suffix}"


def serialize_invoice(inv):
    """Convert datetime fields to ISO strings for JSON serialization."""
    for field in ["created_at", "updated_at"]:
        if inv.get(field):
            inv[field] = inv[field].isoformat()
    if inv.get("due_date"):
        inv["due_date"] = str(inv["due_date"])
    # Convert ai_confidence to integer for frontend display (e.g., "85" instead of "85.50")
    if inv.get("ai_confidence") is not None:
        inv["ai_confidence"] = int(inv["ai_confidence"])
    return inv


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
                params.append(status_filter)

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
    data = request.get_json()

    client_name = data.get("client_name", "").strip()
    amount = float(data.get("amount", 0))
    tax = float(data.get("tax", 0))
    description = data.get("description", "")
    due_date = data.get("due_date")
    status = data.get("status", "draft")

    if not client_name or amount <= 0:
        return jsonify({"error": "Client name and valid amount are required"}), 400

    total_amount = amount + tax

    ai_result = categorize(f"{description} {client_name}")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM categories WHERE name = %s LIMIT 1",
                (ai_result["category"],)
            )
            cat = cursor.fetchone()
            category_id = cat["id"] if cat else None

            invoice_number = generate_invoice_number()
            cursor.execute("""
                INSERT INTO invoices
                (user_id, invoice_number, client_name, client_email, amount, tax, total_amount,
                status, category_id, description, due_date, ai_category, ai_confidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id, invoice_number, client_name,
                data.get("client_email", ""),
                amount, tax, total_amount,
                status, category_id, description, due_date,
                ai_result["category"], ai_result["confidence"]
            ))
            conn.commit()
            new_id = cursor.lastrowid

            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id = %s
            """, (new_id,))
            invoice = cursor.fetchone()

        return jsonify({"message": "Invoice created", "invoice": serialize_invoice(invoice)}), 201
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
            cursor.execute(
                "SELECT id FROM invoices WHERE id=%s AND user_id=%s",
                (invoice_id, user_id)
            )
            if not cursor.fetchone():
                return jsonify({"error": "Invoice not found"}), 404

            allowed = ["client_name", "client_email", "amount", "tax", "status", "description", "due_date"]
            updates = {k: v for k, v in data.items() if k in allowed}

            if "status" in updates and updates["status"] not in ['draft', 'sent', 'paid', 'overdue', 'cancelled']:
                return jsonify({"error": "Invalid status value"}), 400

            if "amount" in updates:
                try:
                    amt_val = float(updates["amount"])
                    if amt_val <= 0:
                        return jsonify({"error": "Amount must be greater than zero"}), 400
                    updates["amount"] = amt_val
                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid amount value"}), 400

            if "amount" in updates or "tax" in updates:
                cursor.execute("SELECT amount, tax FROM invoices WHERE id=%s AND user_id=%s", (invoice_id, user_id))
                current = cursor.fetchone()
                amt = float(updates.get("amount", current["amount"]))
                tax = float(updates.get("tax", current["tax"]))
                updates["total_amount"] = amt + tax

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                cursor.execute(
                    f"UPDATE invoices SET {set_clause} WHERE id=%s AND user_id=%s",
                    (*updates.values(), invoice_id, user_id)
                )
                conn.commit()

            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id=%s AND i.user_id=%s
            """, (invoice_id, user_id))
            invoice = cursor.fetchone()

        return jsonify({"message": "Invoice updated", "invoice": serialize_invoice(invoice)}), 200
    finally:
        conn.close()


@invoices_bp.route("/<int:invoice_id>", methods=["DELETE"])
@jwt_required()
def delete_invoice(invoice_id):
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM invoices WHERE id=%s AND user_id=%s",
                (invoice_id, user_id)
            )
            if not cursor.fetchone():
                return jsonify({"error": "Invoice not found"}), 404

            cursor.execute("DELETE FROM invoices WHERE id=%s AND user_id=%s", (invoice_id, user_id))
            conn.commit()

        return jsonify({"message": "Invoice deleted"}), 200
    finally:
        conn.close()


@invoices_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_invoice():
    """
    Upload invoice image/PDF, permanently store the file,
    run OCR, and save only verified OCR data.
    """

    user_id = get_jwt_identity()

    # ============================================================
    # 1. CHECK FILE
    # ============================================================

    if "file" not in request.files:
        return jsonify({
            "error": "No file part. Use field name 'file'"
        }), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({
            "error": "No file selected"
        }), 400

    if not allowed_file(file.filename):
        return jsonify({
            "error": "Invalid file type. Allowed: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP"
        }), 400

    filename = secure_filename(file.filename)

    ext = filename.rsplit(".", 1)[1].lower()

    # ============================================================
    # 2. CREATE UNIQUE PERMANENT FILE NAME
    # ============================================================

    unique_filename = (
        f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_"
        f"{filename}"
    )

    permanent_path = os.path.join(
        UPLOAD_FOLDER,
        unique_filename
    )

    # ============================================================
    # 3. SAVE UPLOADED FILE PERMANENTLY
    # ============================================================

    try:

        file.save(permanent_path)

    except Exception as e:

        return jsonify({
            "error": "Could not save uploaded file",
            "details": str(e)
        }), 500

    try:

        # ========================================================
        # 4. RUN OCR
        # ========================================================

        from routes.ocr import (
            extract_invoice_data_from_file
        )

        extracted, extraction_method = (
            extract_invoice_data_from_file(
                permanent_path,
                filename
            )
        )

        # ========================================================
        # 5. OCR REVIEW CHECK
        # ========================================================

        if (
            extracted.get("requires_review")
            or extracted.get("needs_manual_review")
            or extraction_method == "failed"
        ):

            extracted["requires_review"] = True
            extracted["needs_manual_review"] = True

            return jsonify({
                "message": (
                    "Invoice uploaded, but OCR requires "
                    "manual verification."
                ),
                "requires_review": True,
                "needs_manual_review": True,
                "extracted_data": extracted,
                "file_name": unique_filename,
                "file_url": f"/api/uploads/{unique_filename}",
                "extraction_method": extraction_method
            }), 422

        # ========================================================
        # 6. GET EXACT OCR VALUES
        # ========================================================

        vendor = extracted.get("vendor")
        invoice_number = extracted.get(
            "invoice_number"
        )
        amount = extracted.get("subtotal")
        tax = extracted.get("tax")
        total_amount = extracted.get(
            "total_amount"
        )
        due_date = extracted.get(
            "due_date"
        )

        # ========================================================
        # 7. REQUIRED FIELD CHECK
        # ========================================================

        missing_fields = []

        if not vendor:
            missing_fields.append("vendor")

        if not invoice_number:
            missing_fields.append("invoice_number")

        if amount is None:
            missing_fields.append("subtotal")

        if total_amount is None:
            missing_fields.append("total_amount")

        if missing_fields:

            extracted["requires_review"] = True
            extracted["needs_manual_review"] = True

            extracted["manual_review_reason"] = (
                "Missing required fields: "
                + ", ".join(missing_fields)
            )

            return jsonify({
                "message": (
                    "OCR could not extract all required "
                    "invoice fields."
                ),
                "requires_review": True,
                "needs_manual_review": True,
                "extracted_data": extracted,
                "file_name": unique_filename,
                "file_url": f"/api/uploads/{unique_filename}",
                "extraction_method": extraction_method
            }), 422

        # ========================================================
        # 8. DO NOT GENERATE OR CALCULATE VALUES
        # ========================================================

        client_name = vendor

        description = (
            f"Uploaded invoice: {filename}"
        )

        # ========================================================
        # 9. AI CATEGORY
        # ========================================================

        ai_category = extracted.get(
            "ai_category"
        )

        ai_confidence = extracted.get(
            "ai_confidence"
        )

        if not ai_category:

            ai_result = categorize(
                f"{description} {client_name}"
            )

            ai_category = ai_result[
                "category"
            ]

            ai_confidence = ai_result[
                "confidence"
            ]

        # ========================================================
        # 10. DATABASE
        # ========================================================

        conn = get_db()

        try:

            with conn.cursor() as cursor:

                # ----------------------------------------------
                # Duplicate invoice number
                # ----------------------------------------------

                cursor.execute(
                    """
                    SELECT id
                    FROM invoices
                    WHERE invoice_number = %s
                    LIMIT 1
                    """,
                    (invoice_number,)
                )

                if cursor.fetchone():

                    extracted[
                        "requires_review"
                    ] = True

                    extracted[
                        "needs_manual_review"
                    ] = True

                    extracted[
                        "manual_review_reason"
                    ] = (
                        f"Invoice number "
                        f"'{invoice_number}' "
                        f"already exists."
                    )

                    return jsonify({
                        "message": (
                            "Duplicate invoice number. "
                            "Manual review required."
                        ),
                        "requires_review": True,
                        "needs_manual_review": True,
                        "extracted_data": extracted,
                        "file_name": unique_filename,
                        "file_url": f"/api/uploads/{unique_filename}",
                        "extraction_method": extraction_method
                    }), 422

                cursor.execute(
                    """
                    SELECT id
                    FROM categories
                    WHERE name = %s
                    LIMIT 1
                    """,
                    (ai_category,)
                )

                category = cursor.fetchone()

                category_id = (
                    category["id"]
                    if category
                    else None
                )

                # ----------------------------------------------
                # INSERT
                # ----------------------------------------------

                cursor.execute(
                    """
                    INSERT INTO invoices
                    (
                        user_id,
                        invoice_number,
                        client_name,
                        client_email,
                        amount,
                        tax,
                        total_amount,
                        status,
                        category_id,
                        description,
                        due_date,
                        file_name,
                        ai_category,
                        ai_confidence
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        user_id,
                        invoice_number,
                        client_name,
                        "",
                        amount,
                        tax,
                        total_amount,
                        "draft",
                        category_id,
                        description,
                        due_date,
                        unique_filename,
                        ai_category,
                        ai_confidence
                    )
                )

                conn.commit()

                new_id = cursor.lastrowid

                # ----------------------------------------------
                # Fetch saved invoice
                # ----------------------------------------------

                cursor.execute(
                    """
                    SELECT
                        i.*,
                        c.name AS category_name,
                        c.color AS category_color
                    FROM invoices i
                    LEFT JOIN categories c
                        ON i.category_id = c.id
                    WHERE i.id = %s
                    AND i.user_id = %s
                    """,
                    (
                        new_id,
                        user_id
                    )
                )

                invoice = cursor.fetchone()

        finally:

            conn.close()

        # ========================================================
        # 11. RETURN
        # ========================================================

        return jsonify({
            "message": (
                "Invoice uploaded and processed successfully"
            ),
            "invoice": serialize_invoice(
                invoice
            ),
            "extracted_data": extracted,
            "requires_review": False,
            "needs_manual_review": False,
            "file_name": unique_filename,
            "file_url": f"/api/uploads/{unique_filename}",
            "extraction_method": extraction_method
        }), 201

    except Exception as e:

        # If processing fails, remove the permanent file
        # so broken uploads are not left behind.

        try:
            if os.path.exists(
                permanent_path
            ):
                os.remove(
                    permanent_path
                )
        except Exception:
            pass

        return jsonify({
            "error": "Invoice processing failed",
            "details": str(e)
        }), 500