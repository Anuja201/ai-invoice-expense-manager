"""
routes/reports.py
Provides the /api/reports/data endpoint for the Reports page.
Supports filtering by report_type, date range, category_id, and payment_method.
Returns a single JSON payload with summary stats, breakdowns, trend data, and
a full transaction list — all derived from the existing expenses and invoices
tables without any schema changes.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db

logger = logging.getLogger("reports_route")

reports_bp = Blueprint("reports", __name__)

VALID_PAYMENT_METHODS = {"cash", "credit_card", "debit_card", "bank_transfer", "upi", "other"}
VALID_REPORT_TYPES = {"expenses", "invoices", "both"}


# ─────────────────────────────────────────────────────────────────
# Helper: build the WHERE clause + params for the expenses query
# ─────────────────────────────────────────────────────────────────
def _expense_conditions(user_id, start_date, end_date, category_id, payment_method):
    conds = ["e.user_id = %s"]
    params = [user_id]
    if start_date:
        conds.append("e.receipt_date >= %s")
        params.append(start_date)
    if end_date:
        conds.append("e.receipt_date <= %s")
        params.append(end_date)
    if category_id:
        conds.append("e.category_id = %s")
        params.append(category_id)
    if payment_method and payment_method in VALID_PAYMENT_METHODS:
        conds.append("e.payment_method = %s")
        params.append(payment_method)
    return " AND ".join(conds), params


# ─────────────────────────────────────────────────────────────────
# Helper: build WHERE clause + params for the invoices query
# category_id is supported; payment_method is not an invoice field
# ─────────────────────────────────────────────────────────────────
def _invoice_conditions(user_id, start_date, end_date, category_id):
    conds = ["i.user_id = %s"]
    params = [user_id]
    if start_date:
        conds.append("DATE(i.created_at) >= %s")
        params.append(start_date)
    if end_date:
        conds.append("DATE(i.created_at) <= %s")
        params.append(end_date)
    if category_id:
        conds.append("i.category_id = %s")
        params.append(category_id)
    return " AND ".join(conds), params


# ─────────────────────────────────────────────────────────────────
# GET /api/reports/data
# ─────────────────────────────────────────────────────────────────
@reports_bp.route("/data", methods=["GET"])
@jwt_required()
def get_report_data():
    """
    Fetch all report data for the given filters.

    Query params:
        report_type   – 'expenses' | 'invoices' | 'both'  (default: 'expenses')
        start_date    – YYYY-MM-DD
        end_date      – YYYY-MM-DD
        category_id   – integer
        payment_method – expense payment method enum value
    """
    user_id = get_jwt_identity()

    report_type    = request.args.get("report_type", "expenses")
    start_date     = request.args.get("start_date") or None
    end_date       = request.args.get("end_date") or None
    category_id    = request.args.get("category_id") or None
    payment_method = request.args.get("payment_method") or None

    if report_type not in VALID_REPORT_TYPES:
        report_type = "expenses"
    if category_id:
        try:
            category_id = int(category_id)
        except (ValueError, TypeError):
            category_id = None
    if payment_method and payment_method not in VALID_PAYMENT_METHODS:
        payment_method = None

    conn = get_db()
    try:
        with conn.cursor() as cursor:

            # ── 1. EXPENSES section ──────────────────────────────────────────
            expense_rows = []
            if report_type in ("expenses", "both"):
                where_e, params_e = _expense_conditions(
                    user_id, start_date, end_date, category_id, payment_method
                )
                cursor.execute(f"""
                    SELECT
                        e.id,
                        e.receipt_date  AS date,
                        e.vendor,
                        COALESCE(c.name, e.ai_category, 'Uncategorized') AS category,
                        c.color         AS category_color,
                        e.payment_method,
                        e.amount,
                        e.description,
                        e.title
                    FROM expenses e
                    LEFT JOIN categories c ON e.category_id = c.id
                    WHERE {where_e}
                    ORDER BY e.receipt_date DESC, e.created_at DESC
                """, params_e)
                expense_rows = cursor.fetchall()

            # ── 2. INVOICES section ──────────────────────────────────────────
            invoice_rows = []
            if report_type in ("invoices", "both"):
                # Skip payment_method filter for invoices (not applicable)
                where_i, params_i = _invoice_conditions(
                    user_id, start_date, end_date,
                    None if payment_method else category_id
                )
                cursor.execute(f"""
                    SELECT
                        i.id,
                        DATE(i.created_at)  AS date,
                        i.client_name       AS vendor,
                        COALESCE(c.name, i.ai_category, 'Uncategorized') AS category,
                        c.color             AS category_color,
                        'invoice'           AS payment_method,
                        i.total_amount      AS amount,
                        i.description,
                        i.invoice_number    AS title
                    FROM invoices i
                    LEFT JOIN categories c ON i.category_id = c.id
                    WHERE {where_i}
                    ORDER BY i.created_at DESC
                """, params_i)
                invoice_rows = cursor.fetchall()

        # ── 3. Merge, serialise ─────────────────────────────────────────────
        all_transactions = []
        for r in expense_rows:
            all_transactions.append({
                "id":             r["id"],
                "type":           "expense",
                "date":           str(r["date"]) if r["date"] else "",
                "vendor":         r["vendor"] or "",
                "category":       r["category"] or "Uncategorized",
                "category_color": r["category_color"] or "#94A3B8",
                "payment_method": r["payment_method"] or "other",
                "amount":         float(r["amount"] or 0),
                "description":    r["description"] or "",
                "title":          r["title"] or "",
            })
        for r in invoice_rows:
            all_transactions.append({
                "id":             r["id"],
                "type":           "invoice",
                "date":           str(r["date"]) if r["date"] else "",
                "vendor":         r["vendor"] or "",
                "category":       r["category"] or "Uncategorized",
                "category_color": r["category_color"] or "#94A3B8",
                "payment_method": "invoice",
                "amount":         float(r["amount"] or 0),
                "description":    r["description"] or "",
                "title":          r["title"] or "",
            })

        # Sort merged list by date desc
        all_transactions.sort(key=lambda x: x["date"], reverse=True)

        # ── 4. Summary KPIs ──────────────────────────────────────────────────
        amounts = [t["amount"] for t in all_transactions]
        total_expenses    = sum(amounts)
        total_transactions = len(amounts)
        avg_expense        = (total_expenses / total_transactions) if total_transactions else 0
        highest_expense    = max(amounts) if amounts else 0

        # ── 5. By Category ───────────────────────────────────────────────────
        cat_map = {}
        for t in all_transactions:
            cat = t["category"]
            if cat not in cat_map:
                cat_map[cat] = {
                    "category": cat,
                    "color":    t["category_color"],
                    "total":    0.0,
                    "count":    0,
                }
            cat_map[cat]["total"] += t["amount"]
            cat_map[cat]["count"] += 1
        by_category = sorted(cat_map.values(), key=lambda x: x["total"], reverse=True)

        # ── 6. Monthly Trend ─────────────────────────────────────────────────
        month_map = {}
        for t in all_transactions:
            d = t["date"]
            if d and len(d) >= 7:
                key = d[:7]   # "YYYY-MM"
                if key not in month_map:
                    month_map[key] = {"month": key, "total": 0.0, "count": 0}
                month_map[key]["total"] += t["amount"]
                month_map[key]["count"] += 1
        monthly_trend = sorted(month_map.values(), key=lambda x: x["month"])

        # ── 7. By Payment Method ─────────────────────────────────────────────
        pm_map = {}
        for t in all_transactions:
            pm = t["payment_method"]
            if pm not in pm_map:
                pm_map[pm] = {"method": pm, "total": 0.0, "count": 0}
            pm_map[pm]["total"] += t["amount"]
            pm_map[pm]["count"] += 1
        by_payment_method = sorted(pm_map.values(), key=lambda x: x["total"], reverse=True)

        return jsonify({
            "summary": {
                "total_expenses":     round(total_expenses, 2),
                "total_transactions": total_transactions,
                "avg_expense":        round(avg_expense, 2),
                "highest_expense":    round(highest_expense, 2),
            },
            "by_category":      by_category,
            "monthly_trend":    monthly_trend,
            "by_payment_method": by_payment_method,
            "transactions":     all_transactions,
        }), 200

    except Exception as exc:
        logger.error(f"Reports data error: {exc}", exc_info=True)
        return jsonify({"error": f"Failed to generate report: {str(exc)}"}), 500
    finally:
        conn.close()
