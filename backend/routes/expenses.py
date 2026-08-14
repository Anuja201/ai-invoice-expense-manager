"""
routes/expenses.py - Expense CRUD endpoints
Full CRUD with AI auto-categorization on create/update.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.ai_categorizer import categorize
import os

expenses_bp = Blueprint("expenses", __name__)

UPLOAD_FOLDER = "uploads/receipts"

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


def serialize_expense(exp):
    """Serialize datetime fields and convert decimal types for frontend."""
    for field in ["created_at", "updated_at"]:
        if exp.get(field):
            exp[field] = exp[field].isoformat()
    if exp.get("receipt_date"):
        exp["receipt_date"] = str(exp["receipt_date"])
    # Convert ai_confidence to integer for frontend display (e.g., "85" instead of "85.50")
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
    finally:
        conn.close()


@expenses_bp.route("/", methods=["POST"])
@jwt_required()
def create_expense():
    """Create a new expense with AI categorization."""
    user_id = get_jwt_identity()
    data = request.get_json()

    title = data.get("title", "").strip()
    amount = float(data.get("amount", 0))
    vendor = data.get("vendor", "").strip()
    description = data.get("description", "")
    receipt_date = data.get("receipt_date")
    payment_method = data.get("payment_method", "other")
    receipt_file = data.get("receipt_file") or data.get("file_name") or None

    if not title or amount <= 0:
        return jsonify({"error": "Title and valid amount are required"}), 400

    if not receipt_date:
        return jsonify({"error": "Receipt date is required"}), 400

    # AI categorize based on title + vendor + description
    ai_result = categorize(f"{title} {vendor} {description}")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Resolve category id
            cursor.execute(
                "SELECT id FROM categories WHERE name = %s LIMIT 1",
                (ai_result["category"],)
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
                ai_result["category"], ai_result["confidence"],
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
            "message": "Expense added",
            "expense": serialize_expense(expense),
            "ai_category": ai_result
        }), 201
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
    data = request.get_json()

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
    finally:
        conn.close()


ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp", "webp"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@expenses_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_expense():
    """
    Upload receipt image or PDF, store the file, run OCR,
    and return structured OCR data for user review and editing before saving.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part. Use field name 'file'"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "error": "Invalid file type. Allowed: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP"
        }), 400

    from werkzeug.utils import secure_filename
    from datetime import datetime

    filename = secure_filename(file.filename)
    unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{filename}"
    permanent_path = os.path.join(UPLOAD_FOLDER, unique_filename)

    try:
        file.save(permanent_path)
    except Exception as e:
        return jsonify({"error": "Could not save uploaded file", "details": str(e)}), 500

    try:
        from routes.ocr import extract_invoice_data_from_file
        extracted, extraction_method = extract_invoice_data_from_file(permanent_path, filename)

        # Prepare expense OCR fields (preserve None if undetected)
        vendor = extracted.get("vendor") or None
        amount = extracted.get("total_amount") if extracted.get("total_amount") is not None else extracted.get("subtotal")
        receipt_date = extracted.get("date") or extracted.get("due_date") or None

        # Format title & description
        title = f"Expense - {vendor}" if vendor else ""
        raw_ocr_text = extracted.get("raw_text", "")

        desc_parts = []
        if vendor:
            desc_parts.append(f"Vendor: {vendor}")
        if extracted.get("line_items"):
            items_str = ", ".join([f"{item.get('description', '')}" for item in extracted["line_items"] if item.get('description')])
            if items_str:
                desc_parts.append(f"Items: {items_str}")
        description = " | ".join(desc_parts) if desc_parts else ""

        # AI category
        ai_category = extracted.get("ai_category") or "Uncategorized"
        ai_confidence = extracted.get("ai_confidence", 0)

        missing_expense_fields = []
        if not vendor:
            missing_expense_fields.append("vendor name")
        if amount is None:
            missing_expense_fields.append("amount")
        if not receipt_date:
            missing_expense_fields.append("receipt date")

        requires_review = extracted.get("requires_review", False) or len(missing_expense_fields) > 0
        review_reason = extracted.get("manual_review_reason") or (f"Could not detect: {', '.join(missing_expense_fields)}" if missing_expense_fields else None)

        extracted_expense = {
            "title": title,
            "vendor": vendor,
            "amount": float(amount) if amount is not None else None,
            "receipt_date": receipt_date,
            "payment_method": "upi",
            "description": description,
            "raw_text": raw_ocr_text,
            "ai_category": ai_category,
            "ai_confidence": int(ai_confidence) if ai_confidence else 0,
            "file_name": unique_filename,
            "file_url": f"/api/uploads/receipts/{unique_filename}",
            "needs_manual_review": requires_review,
            "requires_review": requires_review,
            "manual_review_reason": review_reason
        }

        print(f"\n[EXPENSE UPLOAD LOG] File: {filename} | Method: {extraction_method}", flush=True)
        print(f"[EXPENSE UPLOAD LOG] Raw Text: {raw_ocr_text[:500]}", flush=True)
        print(f"[EXPENSE UPLOAD LOG] Parsed Fields: {extracted_expense}\n", flush=True)

        return jsonify({
            "message": "Receipt uploaded and extracted successfully",
            "extracted_data": extracted_expense,
            "extraction_method": extraction_method,
            "file_name": unique_filename,
            "file_url": f"/api/uploads/receipts/{unique_filename}"
        }), 200

    except Exception as e:
        if os.path.exists(permanent_path):
            try:
                os.remove(permanent_path)
            except Exception:
                pass
        return jsonify({"error": "OCR extraction failed", "details": str(e)}), 500

