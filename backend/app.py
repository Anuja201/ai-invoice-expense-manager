"""
app.py - Main Flask Application Entry Point
Registers all blueprints, CORS, JWT, and error handlers.
"""

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config

# Import route blueprints
from routes.auth import auth_bp, BLOCKLIST
from routes.invoices import invoices_bp
from routes.expenses import expenses_bp
from routes.dashboard import dashboard_bp
from routes.categories import categories_bp
from routes.ocr import ocr_bp
from routes.predictions import predictions_bp
from routes.insights import insights_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS for React frontend
    CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)

    # JWT setup
    jwt = JWTManager(app)

    # Check blocklist on every protected request
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        return jwt_payload["jti"] in BLOCKLIST

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked. Please log in again."}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired. Please log in again."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "Invalid token."}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "Authorization token required."}), 401

    # Register blueprints with URL prefixes
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(invoices_bp, url_prefix="/api/invoices")
    app.register_blueprint(expenses_bp, url_prefix="/api/expenses")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(categories_bp, url_prefix="/api/categories")
    app.register_blueprint(ocr_bp, url_prefix="/api/ocr")
    app.register_blueprint(predictions_bp, url_prefix="/api/predictions")
    app.register_blueprint(insights_bp, url_prefix="/api/insights")

    # Health check
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "message": "Invoice Manager API running", "version": "2.0.0"}), 200

    # Generic error handlers
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=Config.DEBUG, host="0.0.0.0", port=5000)
