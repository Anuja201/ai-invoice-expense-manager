"""
routes/dashboard.py - Dashboard statistics endpoints
Provides summary data, charts, and recent transactions for the dashboard.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from datetime import datetime, timedelta

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/summary", methods=["GET"])
@jwt_required()
def get_summary():
    """Get overall financial summary for the user."""
    user_id = get_jwt_identity()
    
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Get total expenses
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s",
                (user_id,)
            )
            total_expenses = cursor.fetchone()["total"] or 0

            # Get total invoiced amount
            cursor.execute(
                "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE user_id = %s",
                (user_id,)
            )
            total_invoices = cursor.fetchone()["total"] or 0

            # Get paid invoices
            cursor.execute(
                "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE user_id = %s AND status = 'paid'",
                (user_id,)
            )
            paid_invoices = cursor.fetchone()["total"] or 0

            # Get pending invoices count
            cursor.execute(
                "SELECT COUNT(*) as count FROM invoices WHERE user_id = %s AND status IN ('draft', 'sent')",
                (user_id,)
            )
            pending_invoices = cursor.fetchone()["count"] or 0

            # Get invoice count
            cursor.execute(
                "SELECT COUNT(*) as count FROM invoices WHERE user_id = %s",
                (user_id,)
            )
            invoice_count = cursor.fetchone()["count"] or 0

            # Get current month expenses
            now = datetime.now()
            first_day_of_month = now.replace(day=1).strftime('%Y-%m-%d')
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND receipt_date >= %s",
                (user_id, first_day_of_month)
            )
            current_month_expenses = cursor.fetchone()["total"] or 0

            # Calculate monthly growth (compare with last month)
            last_month = now - timedelta(days=30)
            first_day_last_month = last_month.replace(day=1).strftime('%Y-%m-%d')
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND receipt_date >= %s AND receipt_date < %s",
                (user_id, first_day_last_month, first_day_of_month)
            )
            last_month_expenses = cursor.fetchone()["total"] or 0
            
            if last_month_expenses > 0:
                monthly_growth = ((current_month_expenses - last_month_expenses) / last_month_expenses) * 100
            else:
                monthly_growth = 0

        return jsonify({
            "total_expenses": float(total_expenses),
            "total_invoices": float(total_invoices),
            "paid_invoices": float(paid_invoices),
            "pending_invoices": pending_invoices,
            "invoice_count": invoice_count,
            "current_month_expenses": float(current_month_expenses),
            "monthly_growth": round(monthly_growth, 1)
        }), 200
    finally:
        conn.close()


@dashboard_bp.route("/chart/monthly", methods=["GET"])
@jwt_required()
def get_monthly_chart():
    """Get monthly expense and invoice data for the last 6 months."""
    user_id = get_jwt_identity()
    
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Get monthly expenses
            cursor.execute("""
                SELECT DATE_FORMAT(receipt_date, '%%Y-%%m') as month, 
                       SUM(amount) as total
                FROM expenses
                WHERE user_id = %s 
                  AND receipt_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(receipt_date, '%%Y-%%m')
                ORDER BY month
            """, (user_id,))
            expenses = cursor.fetchall()
            expenses = [{"month": e["month"], "total": float(e["total"])} for e in expenses]

            # Get monthly invoices
            cursor.execute("""
                SELECT DATE_FORMAT(created_at, '%%Y-%%m') as month,
                       SUM(total_amount) as total
                FROM invoices
                WHERE user_id = %s
                  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(created_at, '%%Y-%%m')
                ORDER BY month
            """, (user_id,))
            invoices = cursor.fetchall()
            invoices = [{"month": i["month"], "total": float(i["total"])} for i in invoices]

        return jsonify({
            "expenses": expenses,
            "invoices": invoices
        }), 200
    finally:
        conn.close()


@dashboard_bp.route("/chart/categories", methods=["GET"])
@jwt_required()
def get_category_chart():
    """Get expense breakdown by category."""
    user_id = get_jwt_identity()
    
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT c.name as category, 
                       COALESCE(SUM(e.amount), 0) as total,
                       c.color
                FROM categories c
                LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = %s
                WHERE c.type IN ('expense', 'both')
                GROUP BY c.id, c.name, c.color
                HAVING total > 0
                ORDER BY total DESC
            """, (user_id,))
            categories = cursor.fetchall()
            categories = [{
                "category": c["category"],
                "total": float(c["total"]),
                "color": c["color"]
            } for c in categories]

        return jsonify({"categories": categories}), 200
    finally:
        conn.close()


@dashboard_bp.route("/recent", methods=["GET"])
@jwt_required()
def get_recent_transactions():
    """Get recent expenses and invoices."""
    user_id = get_jwt_identity()
    
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Get recent expenses
            cursor.execute("""
                SELECT e.id, e.title as description, e.amount, e.receipt_date as date,
                       'expense' as type, e.ai_category as category
                FROM expenses e
                WHERE e.user_id = %s
                ORDER BY e.created_at DESC
                LIMIT 5
            """, (user_id,))
            expenses = cursor.fetchall()
            expenses = [{
                "id": e["id"],
                "description": e["description"],
                "amount": float(e["amount"]),
                "date": str(e["date"]),
                "type": "expense",
                "category": e["category"]
            } for e in expenses]

            # Get recent invoices
            cursor.execute("""
                SELECT i.id, i.invoice_number as description, i.total_amount as amount,
                       i.created_at as date, 'invoice' as type, i.status,
                       i.client_name as category
                FROM invoices i
                WHERE i.user_id = %s
                ORDER BY i.created_at DESC
                LIMIT 5
            """, (user_id,))
            invoices = cursor.fetchall()
            invoices = [{
                "id": i["id"],
                "description": i["description"],
                "amount": float(i["amount"]),
                "date": str(i["date"]),
                "type": "invoice",
                "category": i["category"]
            } for i in invoices]

            # Combine and sort by date
            transactions = expenses + invoices
            transactions.sort(key=lambda x: x["date"], reverse=True)
            transactions = transactions[:10]

        return jsonify({"transactions": transactions}), 200
    finally:
        conn.close()
