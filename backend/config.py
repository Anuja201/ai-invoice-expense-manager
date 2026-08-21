"""
config.py - Application configuration
Loads environment variables and sets Flask/JWT/DB config
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask
    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "your-super-secret-key-change-in-production"
    )
    DEBUG = os.getenv("DEBUG", "True") == "True"

    # JWT
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "jwt-secret-key-change-in-production"
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    # MySQL Database
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 3306))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "invoice_manager")

    # CORS
    CORS_ORIGINS = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GEMINI_TIMEOUT = int(os.getenv("GEMINI_TIMEOUT", "60"))

    # Tesseract: configurable for cross-platform deployment.
    # Set TESSERACT_CMD in .env on Windows; leave empty on Linux (uses PATH).
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()

    # Storage backend: local | s3 | gcs
    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").strip()

    # File upload
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    ALLOWED_EXTENSIONS = {
        "pdf", "png", "jpg", "jpeg",
        "tiff", "bmp", "webp", "doc", "docx"
    }