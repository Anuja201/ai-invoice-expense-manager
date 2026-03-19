"""
routes/auth.py - Authentication endpoints
Handles register, login, logout, current user profile, and Google OAuth.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt
)
import bcrypt
import requests as http_requests
from utils.db import execute_query

auth_bp = Blueprint("auth", __name__)

# In-memory token blocklist (use Redis in production)
BLOCKLIST = set()


@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user."""
    data = request.get_json()
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    company = data.get("company", "").strip()

    # Basic validation
    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Check if email already exists
    existing = execute_query(
        "SELECT id FROM users WHERE email = %s", (email,), fetch_one=True
    )
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    # Hash password with bcrypt
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Create avatar initials from name
    parts = name.split()
    initials = "".join(p[0].upper() for p in parts[:2])

    # Insert user
    user_id = execute_query(
        "INSERT INTO users (name, email, password_hash, company, avatar_initials) VALUES (%s, %s, %s, %s, %s)",
        (name, email, password_hash, company, initials),
        commit=True
    )

    # Generate JWT
    access_token = create_access_token(identity=str(user_id))
    return jsonify({
        "message": "Account created successfully",
        "token": access_token,
        "user": {"id": user_id, "name": name, "email": email, "company": company, "initials": initials}
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """Login with email + password, returns JWT."""
    data = request.get_json()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Fetch user
    user = execute_query(
        "SELECT id, name, email, password_hash, company, avatar_initials FROM users WHERE email = %s",
        (email,), fetch_one=True
    )

    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    # Verify password
    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=str(user["id"]))
    return jsonify({
        "message": "Login successful",
        "token": access_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "company": user["company"],
            "initials": user["avatar_initials"]
        }
    }), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Blacklist current JWT token."""
    jti = get_jwt()["jti"]
    BLOCKLIST.add(jti)
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_me():
    """Return current authenticated user profile."""
    user_id = get_jwt_identity()
    user = execute_query(
        "SELECT id, name, email, company, avatar_initials, created_at FROM users WHERE id = %s",
        (user_id,), fetch_one=True
    )
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()

    return jsonify({"user": user}), 200



@auth_bp.route("/google", methods=["POST"])
def google_oauth():
    """
    Google OAuth login/register.
    Client sends the Google ID token; backend verifies and returns JWT.
    """
    from config import Config
    data = request.get_json()
    google_token = data.get("token")

    if not google_token:
        return jsonify({"error": "Google token is required"}), 400

    # Verify Google token
    try:
        verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={google_token}"
        resp = http_requests.get(verify_url, timeout=10)
        if resp.status_code != 200:
            return jsonify({"error": "Invalid Google token"}), 401

        google_data = resp.json()

        if "error" in google_data:
            return jsonify({"error": "Google token validation failed"}), 401

        # Optionally verify audience
        # if Config.GOOGLE_CLIENT_ID and google_data.get("aud") != Config.GOOGLE_CLIENT_ID:
        #     return jsonify({"error": "Token audience mismatch"}), 401

    except Exception as e:
        return jsonify({"error": f"Could not verify Google token: {str(e)}"}), 502

    google_id = google_data.get("sub")
    email = google_data.get("email", "").lower()
    name = google_data.get("name", email.split("@")[0])

    # Check if user exists by google_id or email
    existing = execute_query(
        "SELECT id, name, email, company, avatar_initials FROM users WHERE google_id = %s OR email = %s LIMIT 1",
        (google_id, email),
        fetch_one=True
    )

    if existing:
        user_id = existing["id"]
        # Update google_id if logging in via email match
        execute_query(
            "UPDATE users SET google_id = %s WHERE id = %s",
            (google_id, user_id),
            commit=True
        )
        user_data = existing
    else:
        # Create new user
        parts = name.split()
        initials = "".join(p[0].upper() for p in parts[:2])
        user_id = execute_query(
            "INSERT INTO users (name, email, google_id, avatar_initials) VALUES (%s, %s, %s, %s)",
            (name, email, google_id, initials),
            commit=True
        )
        user_data = {"id": user_id, "name": name, "email": email, "company": None, "avatar_initials": initials}

    access_token = create_access_token(identity=str(user_data["id"]))
    return jsonify({
        "message": "Google login successful",
        "token": access_token,
        "user": {
            "id": user_data["id"],
            "name": user_data["name"],
            "email": user_data["email"],
            "company": user_data.get("company"),
            "initials": user_data.get("avatar_initials"),
        }
    }), 200
