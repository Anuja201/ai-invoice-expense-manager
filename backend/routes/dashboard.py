"""
routes/dashboard.py - Dashboard analytics endpoints
Provides summary stats, chart data, and recent transactions.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from datetime import datetime, timedelta

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/summary", methods=["GET"])
@jwt_required()
def get_summary():
    """Return summary cards: totals, counts, and growth metrics."""
    user_id = get_jwt_identity()
    now = datetime.now()
    current_month_start = now.replace(day=1).strftime("%Y-%m-%d")
    last_month_start = (now.replace(day=1) - timedelta(days=1)).replace(day=1).strftime("%Y-%m-%d")
    last_month_end = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Total expenses
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s",
                (user_id,)
            )
            total_expenses = float(cursor.fetchone()["total"])

            # Total invoices amount
            cursor.execute(
                "SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM invoices WHERE user_id = %s",
                (user_id,)
            )
            inv_row = cursor.fetchone()
            total_invoices = float(inv_row["total"])
            invoice_count = inv_row["count"]

            # Paid invoices
            cursor.execute(
                "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE user_id = %s AND status = 'paid'",
                (user_id,)
            )
            paid_invoices = float(cursor.fetchone()["total"])

            # Current month expenses
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND receipt_date >= %s",
                (user_id, current_month_start)
            )
            current_month_expenses = float(cursor.fetchone()["total"])

            # Last month expenses
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND receipt_date >= %s AND receipt_date <= %s",
                (user_id, last_month_start, last_month_end)
            )
            last_month_expenses = float(cursor.fetchone()["total"])

            # Month-over-month growth
            if last_month_expenses > 0:
                growth = ((current_month_expenses - last_month_expenses) / last_month_expenses) * 100
            else:
                growth = 100.0 if current_month_expenses > 0 else 0.0

            # Pending invoices count
            cursor.execute(
                "SELECT COUNT(*) as count FROM invoices WHERE user_id = %s AND status IN ('draft','sent')",
                (user_id,)
            )
            pending_invoices = cursor.fetchone()["count"]

            # Expense count
            cursor.execute(
                "SELECT COUNT(*) as count FROM expenses WHERE user_id = %s",
                (user_id,)
            )
            expense_count = cursor.fetchone()["count"]

        return jsonify({
            "total_expenses": total_expenses,
            "total_invoices": total_invoices,
            "paid_invoices": paid_invoices,
            "invoice_count": invoice_count,
            "expense_count": expense_count,
            "current_month_expenses": current_month_expenses,
            "last_month_expenses": last_month_expenses,
            "monthly_growth": round(growth, 1),
            "pending_invoices": pending_invoices
        }), 200
    finally:
        conn.close()


@dashboard_bp.route("/chart/monthly", methods=["GET"])
@jwt_required()
def monthly_chart():
    """Return last 6 months of expenses and invoice revenue for charts."""
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Monthly expenses - last 6 months
            cursor.execute("""
                SELECT DATE_FORMAT(receipt_date, '%Y-%m') as month,
                       SUM(amount) as total
                FROM expenses
                WHERE user_id = %s
                  AND receipt_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY month
                ORDER BY month ASC
            """, (user_id,))
            expense_data = cursor.fetchall()

            # Monthly invoice revenue - last 6 months
            cursor.execute("""
                SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                       SUM(total_amount) as total
                FROM invoices
                WHERE user_id = %s
                  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY month
                ORDER BY month ASC
            """, (user_id,))
            invoice_data = cursor.fetchall()

        return jsonify({
            "expenses": [{"month": r["month"], "total": float(r["total"])} for r in expense_data],
            "invoices": [{"month": r["month"], "total": float(r["total"])} for r in invoice_data]
        }), 200
    finally:
        conn.close()


@dashboard_bp.route("/chart/categories", methods=["GET"])
@jwt_required()
def category_chart():
    """Return expense breakdown by category for pie chart."""
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT c.name as category, c.color, SUM(e.amount) as total
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
                GROUP BY e.category_id, c.name, c.color
                ORDER BY total DESC
                LIMIT 8
            """, (user_id,))
            rows = cursor.fetchall()

        return jsonify({
            "categories": [
                {"category": r["category"] or "Uncategorized",
                 "color": r["color"] or "#6B7280",
                 "total": float(r["total"])}
                for r in rows
            ]
        }), 200
    finally:
        conn.close()


@dashboard_bp.route("/recent", methods=["GET"])
@jwt_required()
def recent_transactions():
    """Return last 10 transactions mixing invoices and expenses."""
    user_id = get_jwt_identity()
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Recent invoices
            cursor.execute("""
                SELECT i.id, 'invoice' as type, i.client_name as name,
                       i.total_amount as amount, i.status,
                       c.name as category, c.color as category_color,
                       i.created_at
                FROM invoices i
                LEFT JOIN categories c ON i.category_id = c.id
                WHERE i.user_id = %s
                ORDER BY i.created_at DESC LIMIT 5
            """, (user_id,))
            invoices = cursor.fetchall()

            # Recent expenses
            cursor.execute("""
                SELECT e.id, 'expense' as type, e.title as name,
                       e.amount, e.status,
                       c.name as category, c.color as category_color,
                       e.created_at
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
                ORDER BY e.created_at DESC LIMIT 5
            """, (user_id,))
            expenses = cursor.fetchall()

        # Merge and sort by date
        all_transactions = []
        for t in list(invoices) + list(expenses):
            t["created_at"] = t["created_at"].isoformat() if t.get("created_at") else ""
            all_transactions.append(t)

        all_transactions.sort(key=lambda x: x["created_at"], reverse=True)

        return jsonify({"transactions": all_transactions[:10]}), 200
    finally:
        conn.close()
