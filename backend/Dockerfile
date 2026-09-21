# Backend image for Render (Docker runtime).
# Docker is used because OCR needs system packages (tesseract, poppler)
# that Render's native Python runtime cannot apt-get install.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production
ENV DEBUG=False

WORKDIR /app

# Tesseract OCR + poppler (pdf2image). libgl1-mesa-glx was removed from current
# Debian and is only needed by non-headless OpenCV, which is not installed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY . /app/

RUN mkdir -p uploads

# Render sets PORT; default to 5000 for local `docker run`.
ENV PORT=5000
EXPOSE 5000

# Apply pending DB migrations (non-destructive) in the background so gunicorn binds
# $PORT immediately (Render fails the deploy if no port opens in time).
# Set RUN_MIGRATIONS=false to skip. Long timeout: OCR + AI calls can take >30s.
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then python init_db.py & fi; exec gunicorn --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY:-2} --threads 2 --timeout 120 --access-logfile - wsgi:app"]
