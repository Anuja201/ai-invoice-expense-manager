"""
routes/ocr.py - OCR invoice parsing pipeline
Extracts structured data from uploaded invoice images/PDFs using
pdf2image + pytesseract (primary) with easyocr fallback. Falls back
to simulation if neither is installed.
"""
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
import os
import re
import json
import random
import tempfile
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from config import Config

ocr_bp = Blueprint("ocr", __name__)

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp", "webp"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def clean_ocr_text(text):
    """
    Clean raw OCR text by removing noise and normalising whitespace.
    """
    if not text:
        return ""
    # Remove non-printable characters except newline/tab
    text = re.sub(r"[^\x20-\x7E\n\t]", " ", text)
    # Collapse multiple spaces into one
    text = re.sub(r"[ \t]+", " ", text)
    # Collapse more than 2 consecutive newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text_from_pdf(file_path):
    """
    Convert each PDF page to an image with pdf2image, then run
    pytesseract on every page and concatenate the results.
    Returns the cleaned combined text, or None on failure.
    """
    try:
        from pdf2image import convert_from_path
        import pytesseract

        pages = convert_from_path(file_path, dpi=300)
        page_texts = []
        for page_img in pages:
            text = pytesseract.image_to_string(page_img, config="--psm 6")
            if text:
                page_texts.append(text)

        combined = "\n".join(page_texts)
        return clean_ocr_text(combined) if combined.strip() else None

    except Exception as e:
        print(f"[OCR] pdf2image+pytesseract failed: {e}")
        return None


def extract_with_pdfplumber(file_path):
    """Extract embedded text from a PDF using pdfplumber (no image conversion)."""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        cleaned = clean_ocr_text(text)
        return cleaned if cleaned else None
    except Exception as e:
        print(f"[OCR] pdfplumber failed: {e}")
        return None


def extract_with_tesseract(file_path):
    """Use pytesseract directly on an image file."""
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(file_path)
        text = pytesseract.image_to_string(img, config="--psm 6")
        return clean_ocr_text(text) if text else None
    except Exception as e:
        print(f"[OCR] pytesseract (image) failed: {e}")
        return None


def extract_with_easyocr(file_path):
    """Fallback OCR using easyocr."""
    try:
        import easyocr
        reader = easyocr.Reader(["en"], gpu=False)
        result = reader.readtext(file_path, detail=0)
        text = " ".join(result)
        return clean_ocr_text(text) if text else None
    except Exception as e:
        print(f"[OCR] easyocr failed: {e}")
        return None


def parse_invoice_text(text):
    """
    Parse cleaned OCR text and extract structured invoice fields.
    Returns a dict with: invoice_number, vendor, date, due_date,
    subtotal, tax, total_amount, line_items, raw_text.
    """
    result = {
        "vendor": None,
        "invoice_number": None,
        "date": None,
        "due_date": None,
        "subtotal": None,
        "tax": None,
        "total_amount": None,
        "line_items": [],
        "raw_text": text[:500] if text else "",
    }

    if not text:
        return result

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # ── Invoice number ────────────────────────────────────────────
    inv_patterns = [
        r"invoice\s*#?\s*:?\s*([A-Z0-9\-\/]+)",
        r"inv\s*#?\s*:?\s*([A-Z0-9\-\/]+)",
        r"bill\s*no\.?\s*:?\s*([A-Z0-9\-\/]+)",
        r"receipt\s*no\.?\s*:?\s*([A-Z0-9\-\/]+)",
    ]
    for pattern in inv_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            result["invoice_number"] = m.group(1).strip()
            break

    # ── Dates ─────────────────────────────────────────────────────
    date_pattern = (
        r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}"
        r"|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}"
        r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})"
    )
    dates = re.findall(date_pattern, text, re.IGNORECASE)
    if dates:
        result["date"] = dates[0]
    if len(dates) > 1:
        result["due_date"] = dates[1]

    # ── Monetary amounts ──────────────────────────────────────────
    amount_pattern = r"[\$₹£€]?\s*([\d,]+\.?\d{0,2})"
    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in ["total", "amount", "subtotal", "tax", "due", "balance"]):
            matches = re.findall(amount_pattern, line)
            for m in matches:
                try:
                    val = float(m.replace(",", ""))
                    if val <= 0:
                        continue
                    if "tax" in lower and result["tax"] is None:
                        result["tax"] = val
                    elif "subtotal" in lower and result["subtotal"] is None:
                        result["subtotal"] = val
                    elif "total" in lower and result["total_amount"] is None:
                        result["total_amount"] = val
                except ValueError:
                    pass

    # Derive total_amount from subtotal + tax if not found directly
    if result["total_amount"] is None and result["subtotal"] and result["tax"]:
        result["total_amount"] = round(result["subtotal"] + result["tax"], 2)

    # ── Vendor (first meaningful non-keyword line) ─────────────────
    skip_keywords = {"invoice", "bill", "receipt", "date", "tax", "total", "amount", "no.", "no:"}
    for line in lines[:6]:
        if len(line) < 3:
            continue
        if re.match(r"^[\d\s\-\/\.]+$", line):
            continue
        if any(kw in line.lower() for kw in skip_keywords):
            continue
        result["vendor"] = line
        break

    return result


def simulate_ocr_extraction(filename=""):
    """
    Simulate OCR extraction when libraries are not available.
    Returns realistic-looking extracted data.
    """
    vendors = [
        "Acme Corporation", "TechSoft Solutions", "Global Logistics Ltd",
        "Creative Design Studio", "Office Pro Supplies", "CloudHost Services",
    ]
    categories = ["Technology", "Marketing", "Consulting", "Office Supplies", "Travel"]

    amount = round(random.uniform(500, 15000), 2)
    tax = round(amount * 0.18, 2)
    total = round(amount + tax, 2)

    return {
        "vendor": random.choice(vendors),
        "invoice_number": f"INV-2025-{random.randint(1000, 9999)}",
        "date": "2025-01-15",
        "due_date": "2025-02-15",
        "subtotal": amount,
        "tax": tax,
        "total_amount": total,
        "line_items": [
            {"description": "Professional Services", "quantity": 1, "rate": round(amount * 0.7, 2), "amount": round(amount * 0.7, 2)},
            {"description": "Support & Maintenance", "quantity": 1, "rate": round(amount * 0.3, 2), "amount": round(amount * 0.3, 2)},
        ],
        "ai_category": random.choice(categories),
        "ai_confidence": round(random.uniform(82, 97), 1),
        "extraction_method": "simulation",
        "raw_text": f"Sample OCR text from {filename}",
    }


def extract_invoice_data_from_file(file_path, filename=""):
    """
    Main OCR pipeline.
    Priority order:
      1. pdf2image + pytesseract  (PDF → images → OCR)
      2. pdfplumber               (embedded text in PDF)
      3. pytesseract              (direct image)
      4. easyocr                  (fallback)
      5. simulation               (last resort)

    Returns (extracted_dict, extraction_method_str).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    raw_text = None
    extraction_method = "simulation"

    # Step 1 – PDF: pdf2image + pytesseract
    if ext == "pdf":
        raw_text = extract_text_from_pdf(file_path)
        if raw_text:
            extraction_method = "pdf2image+pytesseract"

    # Step 2 – PDF fallback: pdfplumber (embedded text)
    if raw_text is None and ext == "pdf":
        raw_text = extract_with_pdfplumber(file_path)
        if raw_text:
            extraction_method = "pdfplumber"

    # Step 3 – Images: pytesseract
    if raw_text is None and ext in {"png", "jpg", "jpeg", "tiff", "bmp", "webp"}:
        raw_text = extract_with_tesseract(file_path)
        if raw_text:
            extraction_method = "pytesseract"

    # Step 4 – easyocr fallback
    if raw_text is None:
        raw_text = extract_with_easyocr(file_path)
        if raw_text:
            extraction_method = "easyocr"

    # Step 5 – simulation
    if raw_text is None:
        extracted = simulate_ocr_extraction(filename)
        return extracted, "simulation"

    extracted = parse_invoice_text(raw_text)
    extracted["extraction_method"] = extraction_method

    # AI categorisation
    try:
        from utils.ai_categorizer import categorize
        vendor_text = extracted.get("vendor") or ""
        ai_result = categorize(vendor_text)
        extracted["ai_category"] = ai_result["category"]
        extracted["ai_confidence"] = ai_result["confidence"]
    except Exception as e:
        print(f"[OCR] AI categorisation failed: {e}")
        extracted["ai_category"] = None
        extracted["ai_confidence"] = None

    return extracted, extraction_method


# ──────────────────────────── Routes ──────────────────────────── #

@ocr_bp.route("/extract", methods=["POST"])
@jwt_required()
def extract_invoice():
    """
    Upload an invoice image or PDF and extract structured data via OCR.

    Supported formats: PDF, PNG, JPG, JPEG, TIFF, BMP, WEBP
    Returns extracted fields: vendor, invoice_number, date, total_amount, etc.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Use field name 'file'"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[1].lower()

    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        extracted, extraction_method = extract_invoice_data_from_file(tmp_path, filename)

        return jsonify({
            "message": "Invoice extracted successfully",
            "filename": filename,
            "extracted_data": extracted,
            "extraction_method": extraction_method,
        }), 200

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@ocr_bp.route("/test", methods=["GET"])
@jwt_required()
def test_ocr():
    """Test endpoint to verify OCR service availability."""
    available = {}

    for lib in ("pytesseract", "easyocr", "pdfplumber", "pdf2image"):
        try:
            __import__(lib)
            available[lib] = True
        except ImportError:
            available[lib] = False

    return jsonify({
        "ocr_services": available,
        "status": "ok",
        "note": "If no OCR library is available, simulation mode is used",
    }), 200