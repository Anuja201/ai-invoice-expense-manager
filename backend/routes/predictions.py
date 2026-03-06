"""
routes/predictions.py - ML-powered predictions
- Time series expense forecasting (next month)
- Duplicate expense detection
- Unusual/anomalous expense detection
- Budget recommendations
"""

import statistics
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db

predictions_bp = Blueprint("predictions", __name__)


def get_monthly_expenses(cursor, user_id, months=6):
    """Fetch last N months of expense totals."""
    cursor.execute("""
        SELECT DATE_FORMAT(receipt_date, '%Y-%m') as month,
               SUM(amount) as total,
               COUNT(*) as count
        FROM expenses
        WHERE user_id = %s
          AND receipt_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        GROUP BY month
        ORDER BY month ASC
    """, (user_id, months))
    return cursor.fetchall()


def linear_regression_predict(values):
    """
    Simple linear regression to predict next value.
    Returns (predicted_value, trend_slope, r_squared)
    """
    n = len(values)
    if n < 2:
        return values[-1] if values else 0, 0, 0

    x = list(range(n))
    x_mean = sum(x) / n
    y_mean = sum(values) / n

    numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, values))
    denominator = sum((xi - x_mean) ** 2 for xi in x)

    slope = numerator / denominator if denominator != 0 else 0
    intercept = y_mean - slope * x_mean
    predicted = slope * n + intercept

    # R-squared
    ss_res = sum((yi - (slope * xi + intercept)) ** 2 for xi, yi in zip(x, values))
    ss_tot = sum((yi - y_mean) ** 2 for yi in values)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    return max(0, predicted), slope, max(0, r_squared)


def detect_anomalies(expenses, z_threshold=2.0):
    """
    Detect anomalous expenses using z-score method.
    Returns list of anomalous expense IDs with scores.
    """
    if len(expenses) < 3:
        return []

    amounts = [float(e["amount"]) for e in expenses]
    mean = statistics.mean(amounts)
    stdev = statistics.stdev(amounts) if len(amounts) > 1 else 0

    anomalies = []
    for exp in expenses:
        amount = float(exp["amount"])
        z_score = abs(amount - mean) / stdev if stdev > 0 else 0
        if z_score > z_threshold:
            anomalies.append({
                "id": exp["id"],
                "title": exp["title"],
                "amount": amount,
                "vendor": exp.get("vendor", ""),
                "z_score": round(z_score, 2),
                "category": exp.get("category_name", "Unknown"),
                "deviation_pct": round(((amount - mean) / mean) * 100, 1) if mean > 0 else 0,
            })

    return sorted(anomalies, key=lambda x: x["z_score"], reverse=True)


def find_duplicates(expenses, amount_threshold=0.01, days_threshold=3):
    """
    Find potentially duplicate expenses within close time/amount proximity.
    """
    duplicates = []
    seen = []

    for i, exp in enumerate(expenses):
        for j, other in enumerate(expenses):
            if i >= j:
                continue

            same_amount = abs(float(exp["amount"]) - float(other["amount"])) <= amount_threshold
            
            # Check date proximity
            try:
                d1 = datetime.strptime(str(exp["receipt_date"]), "%Y-%m-%d")
                d2 = datetime.strptime(str(other["receipt_date"]), "%Y-%m-%d")
                close_dates = abs((d1 - d2).days) <= days_threshold
            except:
                close_dates = False

            same_vendor = (exp.get("vendor") or "").lower() == (other.get("vendor") or "").lower()
            similar_title = exp["title"].lower()[:10] == other["title"].lower()[:10]

            if same_amount and close_dates and (same_vendor or similar_title):
                pair = {
                    "expense_1": {"id": exp["id"], "title": exp["title"], "amount": float(exp["amount"]), "date": str(exp["receipt_date"])},
                    "expense_2": {"id": other["id"], "title": other["title"], "amount": float(other["amount"]), "date": str(other["receipt_date"])},
                    "confidence": 0.9 if same_vendor else 0.7,
                    "reason": "Same amount, similar dates" + (", same vendor" if same_vendor else ""),
                }
                duplicates.append(pair)

    return duplicates[:10]  # Cap results


@predictions_bp.route("/next-month", methods=["GET"])
@jwt_required()
def predict_next_month():
    """
    Predict next month's expenses using linear regression on historical data.
    Returns prediction with confidence interval.
    """
    user_id = get_jwt_identity()
    conn = get_db()

    try:
        with conn.cursor() as cursor:
            rows = get_monthly_expenses(cursor, user_id, months=12)

        if not rows:
            return jsonify({
                "prediction": 0,
                "confidence": 0,
                "trend": "insufficient_data",
                "message": "Not enough data for prediction. Add more expenses.",
                "historical": []
            }), 200

        amounts = [float(r["total"]) for r in rows]
        months = [r["month"] for r in rows]

        predicted, slope, r_squared = linear_regression_predict(amounts)

        # Moving average comparison
        ma3 = sum(amounts[-3:]) / 3 if len(amounts) >= 3 else predicted
        ma6 = sum(amounts[-6:]) / 6 if len(amounts) >= 6 else predicted

        # Confidence interval (±1 stdev)
        stdev = statistics.stdev(amounts) if len(amounts) > 1 else 0
        lower = max(0, predicted - stdev)
        upper = predicted + stdev

        # Trend direction
        if slope > 0:
            trend = "increasing"
        elif slope < 0:
            trend = "decreasing"
        else:
            trend = "stable"

        # Next month label
        now = datetime.now()
        next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
        next_month_label = next_month.strftime("%B %Y")

        return jsonify({
            "prediction": round(predicted, 2),
            "lower_bound": round(lower, 2),
            "upper_bound": round(upper, 2),
            "confidence": round(r_squared * 100, 1),
            "trend": trend,
            "trend_slope": round(slope, 2),
            "moving_average_3m": round(ma3, 2),
            "moving_average_6m": round(ma6, 2),
            "next_month": next_month_label,
            "historical": [{"month": m, "total": round(a, 2)} for m, a in zip(months, amounts)],
            "data_points": len(amounts),
        }), 200

    finally:
        conn.close()


@predictions_bp.route("/anomalies", methods=["GET"])
@jwt_required()
def detect_expense_anomalies():
    """
    Detect unusual/anomalous expenses using statistical z-score method.
    """
    user_id = get_jwt_identity()
    conn = get_db()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT e.id, e.title, e.amount, e.vendor, e.receipt_date,
                       c.name as category_name
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
                ORDER BY e.receipt_date DESC
                LIMIT 100
            """, (user_id,))
            expenses = cursor.fetchall()

        anomalies = detect_anomalies(expenses)

        return jsonify({
            "anomalies": anomalies,
            "total_analyzed": len(expenses),
            "anomalies_found": len(anomalies),
            "method": "z-score (threshold: 2.0 standard deviations)",
        }), 200

    finally:
        conn.close()


@predictions_bp.route("/duplicates", methods=["GET"])
@jwt_required()
def find_duplicate_expenses():
    """
    Find potentially duplicate expenses.
    """
    user_id = get_jwt_identity()
    conn = get_db()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT e.id, e.title, e.amount, e.vendor, e.receipt_date,
                       c.name as category_name
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
                ORDER BY e.receipt_date DESC
                LIMIT 200
            """, (user_id,))
            expenses = cursor.fetchall()

        # Serialize dates
        for e in expenses:
            if e.get("receipt_date"):
                e["receipt_date"] = str(e["receipt_date"])

        duplicates = find_duplicates(expenses)

        return jsonify({
            "duplicates": duplicates,
            "total_analyzed": len(expenses),
            "duplicate_pairs_found": len(duplicates),
        }), 200

    finally:
        conn.close()


@predictions_bp.route("/budget-recommendation", methods=["GET"])
@jwt_required()
def budget_recommendation():
    """
    Recommend monthly budgets per category based on historical spending.
    """
    user_id = get_jwt_identity()
    conn = get_db()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT c.name as category,
                       AVG(monthly_spend) as avg_spend,
                       MAX(monthly_spend) as max_spend,
                       COUNT(*) as months_active
                FROM (
                    SELECT e.category_id,
                           DATE_FORMAT(e.receipt_date, '%Y-%m') as month,
                           SUM(e.amount) as monthly_spend
                    FROM expenses e
                    WHERE e.user_id = %s
                      AND e.receipt_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                    GROUP BY e.category_id, month
                ) as monthly
                LEFT JOIN categories c ON monthly.category_id = c.id
                GROUP BY monthly.category_id, c.name
                ORDER BY avg_spend DESC
            """, (user_id,))
            rows = cursor.fetchall()

        recommendations = []
        for row in rows:
            avg = float(row["avg_spend"] or 0)
            max_spend = float(row["max_spend"] or 0)
            # Recommend 10% buffer above average
            recommended_budget = round(avg * 1.10, 2)
            recommendations.append({
                "category": row["category"] or "Uncategorized",
                "avg_monthly_spend": round(avg, 2),
                "max_monthly_spend": round(max_spend, 2),
                "recommended_budget": recommended_budget,
                "months_with_data": row["months_active"],
            })

        total_recommended = sum(r["recommended_budget"] for r in recommendations)

        return jsonify({
            "recommendations": recommendations,
            "total_recommended_monthly_budget": round(total_recommended, 2),
            "based_on": "6 months historical data",
        }), 200

    finally:
        conn.close()
