"""
routes/categories.py - Category listing endpoint
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from utils.db import execute_query

categories_bp = Blueprint("categories", __name__)


@categories_bp.route("/", methods=["GET"])
@jwt_required()
def list_categories():
    """Return all available categories."""
    categories = execute_query(
        "SELECT * FROM categories ORDER BY name ASC",
        fetch_all=True
    )
    for c in categories:
        if c.get("created_at"):
            c["created_at"] = c["created_at"].isoformat()
    return jsonify({"categories": categories}), 200
