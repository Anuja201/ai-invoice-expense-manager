"""
routes/invoices.py - Invoice CRUD endpoints
Supports create, list, get, update, delete, and PDF upload + AI categorization.
PDF upload uses the OCR pipeline from routes/ocr.py to extract structured data.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.ai_categorizer import categorize
import random
import string
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import tempfile

invoices_bp = Blueprint("invoices", __name__)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


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
    data = request.get_json()

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

            if "amount" in updates or "tax" in updates:
                cursor.execute("SELECT amount, tax FROM invoices WHERE id=%s", (invoice_id,))
                current = cursor.fetchone()
                amt = float(updates.get("amount", current["amount"]))
                tax = float(updates.get("tax", current["tax"]))
                updates["total_amount"] = amt + tax

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                cursor.execute(
                    f"UPDATE invoices SET {set_clause} WHERE id=%s",
                    (*updates.values(), invoice_id)
                )
                conn.commit()

            cursor.execute("""
                SELECT i.*, c.name as category_name, c.color as category_color
                FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.id=%s
            """, (invoice_id,))
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

            cursor.execute("DELETE FROM invoices WHERE id=%s", (invoice_id,))
            conn.commit()

        return jsonify({"message": "Invoice deleted"}), 200
    finally:
        conn.close()


# ────────────────── Upload + OCR + Create Endpoint ────────────── #

@invoices_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_invoice():
    """
    Accept a PDF invoice upload, run the OCR pipeline to extract
    structured fields, then persist the invoice to the database.

    Returns:
        { "message": "...", "invoice_number": "...", "amount": ... }
    """
    user_id = get_jwt_identity()

    # ── Validate uploaded file ────────────────────────────────────
    if "file" not in request.files:
        return jsonify({"error": "No file part. Use field name 'file'"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type. Only PDF allowed."}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[1].lower()

    # ── Save to a temp file so OCR can read it ────────────────────
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        # ── Run OCR pipeline (imported from ocr.py) ───────────────
        from routes.ocr import extract_invoice_data_from_file
        extracted, extraction_method = extract_invoice_data_from_file(tmp_path, filename)


        # ── Map OCR output to invoice fields ──────────────────────
        client_name = extracted.get("vendor") or "Unknown Vendor"
        amount = float(extracted.get("subtotal") or extracted.get("total_amount") or 0)
        tax = float(extracted.get("tax") or 0)
        total_amount = float(extracted.get("total_amount") or (amount + tax))
        description = f"Uploaded PDF: {filename}"

        # Use OCR-extracted invoice number, fall back to generated one
        invoice_number = extracted.get("invoice_number") or generate_invoice_number()

        # AI categorisation (already done inside OCR pipeline, reuse result)
        ai_category = extracted.get("ai_category")
        ai_confidence = extracted.get("ai_confidence")

        # If OCR did not run AI categorisation, do it now
        if not ai_category:
            ai_result = categorize(f"{description} {client_name}")
            ai_category = ai_result["category"]
            ai_confidence = ai_result["confidence"]

        # ── Persist to database ───────────────────────────────────
        conn = get_db()
        try:
            with conn.cursor() as cursor:
                # Resolve category_id from category name
                cursor.execute(
                    "SELECT id FROM categories WHERE name = %s LIMIT 1",
                    (ai_category,)
                )
                cat = cursor.fetchone()
                category_id = cat["id"] if cat else None

                # Ensure invoice_number uniqueness (retry with generated if needed)
                cursor.execute(
                    "SELECT id FROM invoices WHERE invoice_number = %s LIMIT 1",
                    (invoice_number,)
                )
                if cursor.fetchone():
                    invoice_number = generate_invoice_number()

                cursor.execute("""
                    INSERT INTO invoices
                    (user_id, invoice_number, client_name, client_email, amount, tax,
                     total_amount, status, category_id, description, due_date, file_name,
                     ai_category, ai_confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    user_id, invoice_number, client_name, "",
                    amount, tax, total_amount,
                    "draft", category_id, description, due_date, filename,
                    ai_category, ai_confidence
                ))
                conn.commit()
                new_id = cursor.lastrowid

                cursor.execute("""
                    SELECT i.*, c.name as category_name, c.color as category_color
                    FROM invoices i LEFT JOIN categories c ON i.category_id = c.id
                    WHERE i.id = %s
                """, (new_id,))
                invoice = cursor.fetchone()

        finally:
            conn.close()

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    return jsonify({
        "message": "Invoice uploaded successfully",
        "invoice_number": invoice_number,
        "amount": total_amount,
        "invoice": serialize_invoice(invoice),
    }), 201