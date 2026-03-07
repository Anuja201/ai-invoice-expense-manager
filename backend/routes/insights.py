"""
routes/insights.py - AI Business Insights Engine
Generates actionable financial insights and suggestions
based on spending patterns, invoice trends, and anomalies.
"""

from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db

insights_bp = Blueprint("insights", __name__)


@insights_bp.route("/", methods=["GET"])
@jwt_required()
def get_insights():
    """
    Generate AI-powered business insights and suggestions.
    Analyzes spending patterns, overdue invoices, category trends, etc.
    """
    user_id = get_jwt_identity()
    conn = get_db()
    insights = []
    score = 100  # financial health score starts at 100

    try:
        with conn.cursor() as cursor:
            now = datetime.now()
            current_month = now.strftime("%Y-%m")
            last_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

            # 1. Overdue invoices check
            cursor.execute("""
                SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
                FROM invoices
                WHERE user_id = %s AND status = 'overdue'
            """, (user_id,))
            overdue = cursor.fetchone()
            if overdue and overdue["count"] > 0:
                score -= 15
                insights.append({
                    "type": "warning",
                    "icon": "⚠️",
                    "title": f"{overdue['count']} Overdue Invoice(s)",
                    "description": f"You have ₹{float(overdue['total']):,.0f} in overdue invoices. Follow up with clients immediately to maintain cash flow.",
                    "priority": "high",
                    "action": "Go to Invoices → Filter by Overdue",
                })

            # 2. Month-over-month expense change
            cursor.execute("""
                SELECT DATE_FORMAT(receipt_date, '%%Y-%%m') as month, SUM(amount) as total
                FROM expenses
                WHERE user_id = %s AND receipt_date >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
                GROUP BY month
                ORDER BY month DESC LIMIT 2
            """, (user_id,))
            monthly_rows = cursor.fetchall()
            if len(monthly_rows) >= 2:
                current = float(monthly_rows[0]["total"])
                previous = float(monthly_rows[1]["total"])
                change_pct = ((current - previous) / previous * 100) if previous > 0 else 0
                if change_pct > 20:
                    score -= 10
                    insights.append({
                        "type": "warning",
                        "icon": "📈",
                        "title": f"Expenses Increased by {change_pct:.1f}%",
                        "description": f"Your expenses jumped from ₹{previous:,.0f} to ₹{current:,.0f} this month. Review discretionary spending.",
                        "priority": "medium",
                        "action": "Review expense categories for cost-cutting opportunities",
                    })
                elif change_pct < -10:
                    score += 5
                    insights.append({
                        "type": "success",
                        "icon": "💚",
                        "title": f"Great! Expenses Down {abs(change_pct):.1f}%",
                        "description": f"You reduced spending from ₹{previous:,.0f} to ₹{current:,.0f}. Keep up the discipline!",
                        "priority": "low",
                        "action": "Maintain this spending pattern",
                    })

            # 3. Top spending category
            cursor.execute("""
                SELECT c.name as category, SUM(e.amount) as total
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s AND e.receipt_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
                GROUP BY e.category_id, c.name
                ORDER BY total DESC LIMIT 1
            """, (user_id,))
            top_cat = cursor.fetchone()
            if top_cat:
                insights.append({
                    "type": "info",
                    "icon": "🏆",
                    "title": f"Top Spending: {top_cat['category'] or 'Uncategorized'}",
                    "description": f"Your biggest expense category this month is {top_cat['category'] or 'Uncategorized'} at ₹{float(top_cat['total']):,.0f}. Consider if this aligns with your business priorities.",
                    "priority": "low",
                    "action": "Review and optimize this category",
                })

            # 4. Unpaid invoice ratio
            cursor.execute("""
                SELECT 
                    SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid,
                    SUM(CASE WHEN status != 'paid' AND status != 'cancelled' THEN total_amount ELSE 0 END) as unpaid,
                    COUNT(*) as total_count
                FROM invoices WHERE user_id = %s
            """, (user_id,))
            inv_row = cursor.fetchone()
            if inv_row and inv_row["total_count"] > 0:
                paid = float(inv_row["paid"] or 0)
                unpaid = float(inv_row["unpaid"] or 0)
                if unpaid > 0:
                    collection_rate = (paid / (paid + unpaid) * 100) if (paid + unpaid) > 0 else 0
                    if collection_rate < 60:
                        score -= 10
                        insights.append({
                            "type": "warning",
                            "icon": "💸",
                            "title": f"Low Collection Rate: {collection_rate:.0f}%",
                            "description": f"Only {collection_rate:.0f}% of your invoices are collected. ₹{unpaid:,.0f} is still outstanding. Improve follow-up processes.",
                            "priority": "high",
                            "action": "Send payment reminders for outstanding invoices",
                        })
                    elif collection_rate >= 85:
                        insights.append({
                            "type": "success",
                            "icon": "✅",
                            "title": f"Excellent Collection Rate: {collection_rate:.0f}%",
                            "description": f"You're collecting {collection_rate:.0f}% of invoiced amounts. Strong cash flow management!",
                            "priority": "low",
                            "action": "Maintain your follow-up schedule",
                        })

            # 5. Cash flow analysis
            cursor.execute("""
                SELECT COALESCE(SUM(total_amount), 0) as income
                FROM invoices
                WHERE user_id = %s AND status = 'paid'
                  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            """, (user_id,))
            income_row = cursor.fetchone()
            
            cursor.execute("""
                SELECT COALESCE(SUM(amount), 0) as expenses
                FROM expenses
                WHERE user_id = %s
                  AND receipt_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            """, (user_id,))
            expense_row = cursor.fetchone()
            
            income = float(income_row["income"] or 0) if income_row else 0
            expenses = float(expense_row["expenses"] or 0) if expense_row else 0
            
            if income > 0 or expenses > 0:
                profit_margin = ((income - expenses) / income * 100) if income > 0 else -100
                if profit_margin < 10 and income > 0:
                    score -= 5
                    insights.append({
                        "type": "warning",
                        "icon": "📉",
                        "title": f"Thin Profit Margin: {profit_margin:.1f}%",
                        "description": f"Your net margin this month is {profit_margin:.1f}%. Consider raising rates or reducing expenses.",
                        "priority": "medium",
                        "action": "Review pricing strategy and expense reduction opportunities",
                    })
                elif profit_margin > 30:
                    insights.append({
                        "type": "success",
                        "icon": "🎯",
                        "title": f"Strong Profit Margin: {profit_margin:.1f}%",
                        "description": f"Excellent! {profit_margin:.1f}% net margin this month. You're running an efficient operation.",
                        "priority": "low",
                        "action": "Consider reinvesting profits for growth",
                    })

            # 6. Draft invoices sitting too long
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM invoices
                WHERE user_id = %s AND status = 'draft'
                  AND created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            """, (user_id,))
            old_drafts = cursor.fetchone()
            if old_drafts and old_drafts["count"] > 0:
                insights.append({
                    "type": "info",
                    "icon": "📝",
                    "title": f"{old_drafts['count']} Draft Invoice(s) Sitting Idle",
                    "description": "You have draft invoices older than 7 days. Send them to clients to accelerate payment.",
                    "priority": "medium",
                    "action": "Review drafts and send to clients",
                })

            # 7. No recent activity
            cursor.execute("""
                SELECT MAX(receipt_date) as last_expense FROM expenses WHERE user_id = %s
            """, (user_id,))
            last_activity = cursor.fetchone()
            if last_activity and last_activity["last_expense"]:
                days_since = (now.date() - last_activity["last_expense"]).days
                if days_since > 14:
                    insights.append({
                        "type": "info",
                        "icon": "🕐",
                        "title": f"No Expense Recorded in {days_since} Days",
                        "description": "Keeping expenses up to date helps with accurate reporting and tax preparation. Don't forget to log recent expenses.",
                        "priority": "low",
                        "action": "Log your recent expenses",
                    })

    finally:
        conn.close()

    # Cap score
    score = max(0, min(100, score))

    # Health grade
    if score >= 85:
        health_grade = "A"
        health_label = "Excellent"
    elif score >= 70:
        health_grade = "B"
        health_label = "Good"
    elif score >= 55:
        health_grade = "C"
        health_label = "Fair"
    else:
        health_grade = "D"
        health_label = "Needs Attention"

    # Sort: high priority first
    priority_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))

    return jsonify({
        "insights": insights,
        "financial_health_score": score,
        "financial_health_grade": health_grade,
        "financial_health_label": health_label,
        "total_insights": len(insights),
        "generated_at": datetime.now().isoformat(),
    }), 200
