"""
routes/chat.py - AI Financial Assistant Chatbot Endpoint
Provides a secure financial chatbot powered by OpenAI or fallback AI providers,
with contextual financial awareness (invoices & expenses) scoped securely to the authenticated user.
"""

import os
import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from config import Config

logger = logging.getLogger("chat_route")
chat_bp = Blueprint("chat", __name__)


def get_user_financial_context(user_id):
    """
    Safely retrieves high-level summary of user's financial status
    to augment chatbot responses without exposing sensitive credentials.
    """
    conn = get_db()
    summary = {
        "invoice_count": 0,
        "total_invoiced": 0.0,
        "paid_invoiced": 0.0,
        "pending_invoiced": 0.0,
        "expense_count": 0,
        "total_expenses": 0.0,
        "recent_expenses": [],
        "recent_invoices": []
    }
    
    try:
        with conn.cursor() as cursor:
            # Invoice metrics
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_count,
                    COALESCE(SUM(total_amount), 0) as total_amount,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as paid_amount,
                    COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount ELSE 0 END), 0) as pending_amount
                FROM invoices
                WHERE user_id = %s
            """, (user_id,))
            inv_stats = cursor.fetchone()
            if inv_stats:
                summary["invoice_count"] = inv_stats.get("total_count", 0)
                summary["total_invoiced"] = float(inv_stats.get("total_amount", 0.0) or 0.0)
                summary["paid_invoiced"] = float(inv_stats.get("paid_amount", 0.0) or 0.0)
                summary["pending_invoiced"] = float(inv_stats.get("pending_amount", 0.0) or 0.0)

            # Expense metrics
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_count,
                    COALESCE(SUM(amount), 0) as total_amount
                FROM expenses
                WHERE user_id = %s
            """, (user_id,))
            exp_stats = cursor.fetchone()
            if exp_stats:
                summary["expense_count"] = exp_stats.get("total_count", 0)
                summary["total_expenses"] = float(exp_stats.get("total_amount", 0.0) or 0.0)

            # Top 3 recent invoices (client, amount, status)
            cursor.execute("""
                SELECT invoice_number, client_name, total_amount, status, due_date
                FROM invoices
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 3
            """, (user_id,))
            invoices = cursor.fetchall()
            summary["recent_invoices"] = [
                {
                    "invoice_no": inv.get("invoice_number"),
                    "client": inv.get("client_name"),
                    "amount": float(inv.get("total_amount") or 0.0),
                    "status": inv.get("status"),
                    "due_date": str(inv.get("due_date")) if inv.get("due_date") else None
                }
                for inv in invoices
            ]

            # Top 3 recent expenses
            cursor.execute("""
                SELECT title, amount, vendor, receipt_date
                FROM expenses
                WHERE user_id = %s
                ORDER BY receipt_date DESC, created_at DESC
                LIMIT 3
            """, (user_id,))
            expenses = cursor.fetchall()
            summary["recent_expenses"] = [
                {
                    "title": exp.get("title"),
                    "amount": float(exp.get("amount") or 0.0),
                    "vendor": exp.get("vendor"),
                    "date": str(exp.get("receipt_date")) if exp.get("receipt_date") else None
                }
                for exp in expenses
            ]
    except Exception as e:
        logger.warning(f"Failed to fetch financial context for user {user_id}: {e}")

    return summary


def generate_contextual_assistant_reply(message, fin_context):
    """
    Intelligent fallback financial assistant that answers accurately
    using the authenticated user's real financial metrics when external AI APIs
    are experiencing high traffic, rate limits, or outages.
    """
    msg = (message or "").lower()
    inv_count = fin_context.get("invoice_count", 0)
    total_inv = fin_context.get("total_invoiced", 0.0)
    paid_inv = fin_context.get("paid_invoiced", 0.0)
    pending_inv = fin_context.get("pending_invoiced", 0.0)
    exp_count = fin_context.get("expense_count", 0)
    total_exp = fin_context.get("total_expenses", 0.0)
    recent_exp = fin_context.get("recent_expenses", [])
    recent_inv = fin_context.get("recent_invoices", [])

    if any(k in msg for k in ["expense", "spent", "spend", "cost", "total expense"]):
        reply = f"Here is your current expense summary:\n\n"
        reply += f"• **Total Recorded Expenses:** {exp_count}\n"
        reply += f"• **Total Expense Amount:** ${total_exp:,.2f}\n"
        if recent_exp:
            reply += f"\n**Recent Expenses:**\n"
            for e in recent_exp:
                vendor = f" ({e.get('vendor')})" if e.get('vendor') else ""
                reply += f"- {e.get('title')}{vendor}: ${e.get('amount', 0):,.2f}\n"
        return reply

    if any(k in msg for k in ["invoice", "bill", "client", "receivable", "pending"]):
        reply = f"Here is your invoice summary:\n\n"
        reply += f"• **Total Invoices:** {inv_count} (${total_inv:,.2f})\n"
        reply += f"• **Paid Invoices:** ${paid_inv:,.2f}\n"
        reply += f"• **Pending / Overdue:** ${pending_inv:,.2f}\n"
        if recent_inv:
            reply += f"\n**Recent Invoices:**\n"
            for inv in recent_inv:
                client = f" ({inv.get('client')})" if inv.get('client') else ""
                reply += f"- #{inv.get('invoice_no', 'N/A')}{client}: ${inv.get('amount', 0):,.2f} [{inv.get('status', '').upper()}]\n"
        return reply

    if any(k in msg for k in ["balance", "cashflow", "cash flow", "health", "profit", "net", "summary", "overview"]):
        net_cashflow = total_inv - total_exp
        reply = f"### Financial Health Overview\n\n"
        reply += f"• **Total Revenue (Invoiced):** ${total_inv:,.2f}\n"
        reply += f"• **Collected (Paid):** ${paid_inv:,.2f}\n"
        reply += f"• **Pending Collection:** ${pending_inv:,.2f}\n"
        reply += f"• **Total Expenses:** ${total_exp:,.2f}\n"
        reply += f"• **Net Balance:** ${net_cashflow:,.2f}\n\n"
        if pending_inv > 0:
            reply += "💡 *Tip: Follow up on your pending invoices to maintain healthy working capital.*"
        else:
            reply += "✨ *Great job keeping your receivables up to date!*"
        return reply

    if any(k in msg for k in ["tip", "optimize", "advice", "save", "cut", "reduce"]):
        return (
            "### Cash Flow Optimization Tips\n\n"
            "1. **Accelerate Receivables:** Request a deposit upfront or offer slight early-payment incentives (e.g., 2% discount within 10 days).\n"
            "2. **Monitor Recurring Subscriptions:** Review recurring software/vendor costs monthly in the Expenses tab.\n"
            "3. **Separate Business & Personal Spending:** Keep strict categorization for tax deductibility.\n"
            "4. **Maintain an Emergency Runway:** Aim for 3–6 months of operating expenses in reserve."
        )

    if any(k in msg for k in ["tax", "deduct", "write-off", "writeoff", "gst"]):
        return (
            "### Tax & Deductions Guidance\n\n"
            "Common tax-deductible business expenses typically include:\n"
            "• Office supplies and software subscriptions\n"
            "• Cloud hosting and technical infrastructure\n"
            "• Travel and client entertainment (subject to deduction limits)\n"
            "• Professional consulting and legal fees\n\n"
            "Make sure to keep digital copies of receipts uploaded in Expenza for audit compliance!"
        )

    return (
        f"Hello! I am your Expenza AI financial assistant.\n\n"
        f"Currently, your account has **{inv_count} invoices** (${total_inv:,.2f}) and **{exp_count} expenses** (${total_exp:,.2f}).\n\n"
        f"You can ask me questions like:\n"
        f"• *What is my current total expense?*\n"
        f"• *How many invoices are pending?*\n"
        f"• *Give me tips to optimize cashflow*\n"
        f"• *How do tax write-offs work?*"
    )


@chat_bp.route("/", methods=["POST"])
@jwt_required()
def chat():
    """
    Accepts user question/conversation history, checks OpenAI / Gemini API keys,
    generates an intelligent financial advisor response, and returns JSON.
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []

    if not message:
        return jsonify({"error": "Message is required."}), 400

    if len(message) > 2000:
        return jsonify({"error": "Message is too long. Maximum 2000 characters."}), 400

    # Retrieve safe financial context scoped to this authenticated user
    fin_context = get_user_financial_context(user_id)
    
    system_prompt = (
        "You are Expenza AI, an intelligent, friendly, and professional financial assistant inside the Expenza platform. "
        "You help users manage invoices, track expenses, forecast cashflow, reduce business costs, and answer general financial or tax questions.\n\n"
        "Here is the authenticated user's current account financial summary (scoped securely to their account):\n"
        f"- Total Invoices: {fin_context['invoice_count']} (Total Value: ${fin_context['total_invoiced']:,.2f}, "
        f"Paid: ${fin_context['paid_invoiced']:,.2f}, Pending/Overdue: ${fin_context['pending_invoiced']:,.2f})\n"
        f"- Total Recorded Expenses: {fin_context['expense_count']} (${fin_context['total_expenses']:,.2f})\n"
        f"- Recent Invoices: {fin_context['recent_invoices']}\n"
        f"- Recent Expenses: {fin_context['recent_expenses']}\n\n"
        "Guidelines:\n"
        "1. Give concise, insightful, and practical advice.\n"
        "2. If the user asks about their own invoices, expenses, or financial balance, refer directly to their data above.\n"
        "3. If they ask general accounting or finance questions, provide accurate, best-practice explanations.\n"
        "4. Format your responses with clean, readable markdown (bullet points, bold text) when helpful.\n"
        "5. Maintain a polite, professional, and encouraging tone."
    )

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or getattr(Config, "GEMINI_API_KEY", "").strip()

    # Priority 1: OpenAI API
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)

            # Build messages list
            messages = [{"role": "system", "content": system_prompt}]
            
            # Append last 6 messages of conversation history for conversational context
            for h in history[-6:]:
                role = "assistant" if h.get("sender") in ("bot", "assistant") else "user"
                content = (h.get("text") or h.get("content") or "").strip()
                if content:
                    messages.append({"role": role, "content": content})

            messages.append({"role": "user", "content": message})

            model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=600,
                temperature=0.7,
            )

            bot_reply = response.choices[0].message.content.strip()
            return jsonify({
                "reply": bot_reply,
                "provider": "openai",
                "model": model_name
            }), 200

        except Exception as e:
            logger.exception("OpenAI API call failed: %s", e)
            return jsonify({
                "error": "Failed to generate AI response via OpenAI. Please verify your OPENAI_API_KEY or try again.",
                "details": str(e)
            }), 502

    # Priority 2: Google Gemini if configured
    elif gemini_key:
        configured_model = os.getenv("GEMINI_MODEL", getattr(Config, "GEMINI_MODEL", "gemini-3.8-flash")).strip()
        models_to_try = [
            configured_model,
            "gemini-3.8-flash",
            "gemini-flash-latest",
        ]
        models_to_try = [m for m in dict.fromkeys(models_to_try) if m]

        reply_text = None
        used_model = None

        for model_name in models_to_try:
            try:
                import requests
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {"text": f"{system_prompt}\n\nUser Question: {message}"}
                            ]
                        }
                    ]
                }
                resp = requests.post(url, json=payload, timeout=6)
                if resp.status_code == 200:
                    result_json = resp.json()
                    candidates = result_json.get("candidates") or []
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts") or []
                        if parts and "text" in parts[0]:
                            reply_text = parts[0]["text"].strip()
                            used_model = model_name
                            break
                else:
                    logger.warning(f"Gemini {model_name} returned status {resp.status_code}")
            except Exception as e:
                logger.warning(f"Gemini {model_name} request error: {e}")

        if reply_text:
            return jsonify({
                "reply": reply_text,
                "provider": "gemini",
                "model": used_model
            }), 200

        # If Gemini is busy/rate-limited/unavailable, gracefully use built-in assistant
        fallback_reply = generate_contextual_assistant_reply(message, fin_context)
        return jsonify({
            "reply": fallback_reply,
            "provider": "expenza_assistant",
            "model": "rule_based_contextual"
        }), 200

    # If neither key is configured in backend environment, use built-in assistant
    fallback_reply = generate_contextual_assistant_reply(message, fin_context)
    return jsonify({
        "reply": fallback_reply,
        "provider": "expenza_assistant",
        "model": "rule_based_contextual"
    }), 200
