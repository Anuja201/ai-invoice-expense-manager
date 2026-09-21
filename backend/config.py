"""
config.py - Application configuration
Loads environment variables and sets Flask/JWT/DB config
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask Environment & Debug
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("DEBUG", "False" if FLASK_ENV == "production" else "True") == "True"

    # Enforce strict secrets in production
    if FLASK_ENV == "production":
        SECRET_KEY = os.environ["SECRET_KEY"]
        JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    else:
        SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-in-production")
        JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-secret-key-change-in-production")

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    # PostgreSQL Database
    # Production (Railway): set DATABASE_URL. Local dev: DATABASE_URL or DB_* vars.
    DATABASE_URL = (os.getenv("DATABASE_URL") or os.getenv("DATABASE_PUBLIC_URL") or "").strip()
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 5432))
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "invoice_manager")
    # disable | prefer | require — use "require" for Railway's public URL
    DB_SSLMODE = os.getenv("DB_SSLMODE", "prefer").strip()

    # Server port (Render injects PORT)
    PORT = int(os.getenv("PORT", 5000))

    # CORS: FRONTEND_URL is the deployed Vercel URL; CORS_ORIGINS adds extra
    # comma-separated origins. Localhost dev origins are allowed outside production.
    _origins = [
        o.strip().rstrip("/")
        for o in (os.getenv("FRONTEND_URL", "") + "," + os.getenv("CORS_ORIGINS", "")).split(",")
        if o.strip()
    ]
    if FLASK_ENV != "production":
        _origins += ["http://localhost:5173", "http://127.0.0.1:5173"]
    CORS_ORIGINS = list(dict.fromkeys(_origins))
    # Optional regex, e.g. for Vercel preview deployments:
    # ^https://your-project-[a-z0-9-]+\.vercel\.app$
    CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip()

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
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