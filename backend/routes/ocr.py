"""
routes/ocr.py

Separate, reliable extraction paths for PDF and Image files with OpenCV preprocessing,
Tesseract & EasyOCR image extraction, and label-based field parsing.

Pipeline Overview:
- PDF Path: PDF text extraction (PyPDF) -> Scanned PDF image OCR -> Label-based field parser
- Image Path (PNG, JPG, JPEG, TIFF, BMP, WEBP): OpenCV preprocessing (grayscale, denoising, Otsu thresholding) -> Tesseract OCR -> EasyOCR / Gemini Vision fallback -> Label-based field parser
- Label-Based Parser: Extracts vendor, invoice_number, date, due_date, subtotal, tax (CGST + SGST / IGST), total_amount, currency, line_items, category, confidence.
- Returns None for uncertain fields to allow manual user correction.
- Preserves raw_text unchanged for debugging.
"""

import os
import re
import json
import base64
import random
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

import requests
from flask import Blueprint, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr_pipeline")

# ============================================================
# DEPENDENCY CHECKS
# ============================================================

# OpenCV
try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

# PyTesseract
try:
    import pytesseract
    HAS_PYTESSERACT = True
    tesseract_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
    ]
    for path in tesseract_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break
except ImportError:
    HAS_PYTESSERACT = False

# EasyOCR
try:
    import easyocr
    HAS_EASYOCR = True
    EASYOCR_READER = None
except ImportError:
    HAS_EASYOCR = False
    EASYOCR_READER = None

# PyPDF
try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    try:
        import PyPDF2 as pypdf
        HAS_PYPDF = True
    except ImportError:
        HAS_PYPDF = False

# PDF2Image
try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

# Pillow (PIL)
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

from config import Config

ocr_bp = Blueprint("ocr", __name__)

# ============================================================
# GEMINI CONFIGURATION
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
try:
    GEMINI_TIMEOUT = int(os.getenv("GEMINI_TIMEOUT", "60"))
except (TypeError, ValueError):
    GEMINI_TIMEOUT = 60

GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

SUPPORTED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "tiff", "bmp", "webp"}
SUPPORTED_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | {"pdf"}


# ============================================================
# HELPER FUNCTIONS & NORMALIZATIONS
# ============================================================

def _empty_result():
    return {
        "vendor": None,
        "invoice_number": None,
        "date": None,
        "due_date": None,
        "subtotal": None,
        "tax": None,
        "total_amount": None,
        "currency": "INR",
        "line_items": [],
        "ai_category": "Uncategorized",
        "ai_confidence": 0.0,
        "needs_manual_review": True,
        "requires_review": True,
        "manual_review_reason": "OCR field extraction unverified",
        "validation_warnings": [],
        "raw_text": "",
        "confidence_per_field": {
            "vendor": False,
            "invoice_number": False,
            "date": False,
            "due_date": False,
            "subtotal": False,
            "tax": False,
            "total_amount": False,
        },
    }


def get_failed_ocr_response(raw_text="", reason="OCR extraction failed"):
    result = _empty_result()
    result["needs_manual_review"] = True
    result["requires_review"] = True
    result["manual_review_reason"] = reason
    result["error"] = reason
    result["raw_text"] = raw_text[:10000] if raw_text else ""
    # All fields uncertain
    result["confidence_per_field"] = {
        "vendor": False, "invoice_number": False, "date": False,
        "due_date": False, "subtotal": False, "tax": False, "total_amount": False,
    }
    return result


def _normalize_date(date_str):
    if not date_str:
        return None
    d_clean = re.sub(r"[^\w\s/-]", "", str(date_str)).strip()
    if not d_clean:
        return None
    patterns = [
        ("%Y-%m-%d", r"^\d{4}-\d{2}-\d{2}$"),
        ("%d/%m/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
        ("%d-%m-%Y", r"^\d{1,2}-\d{1,2}-\d{4}$"),
        ("%m/%d/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
        ("%Y/%m/%d", r"^\d{4}/\d{1,2}/\d{1,2}$"),
        ("%d %b %Y", r"^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$"),
        ("%b %d, %Y", r"^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}$")
    ]
    for fmt_str, regex in patterns:
        if re.match(regex, d_clean, re.IGNORECASE):
            try:
                dt = datetime.strptime(d_clean, fmt_str)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
    match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", d_clean)
    if match:
        y, m, d = match.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    match_d = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", d_clean)
    if match_d:
        d, m, y = match_d.groups()
        if len(y) == 2:
            y = "20" + y
        return f"{y}-{int(m):02d}-{int(d):02d}"
    return None


def _parse_number(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return round(float(val), 2)
    val_str = str(val).strip()
    val_str = re.sub(r"[^\d.,]", "", val_str)
    if not val_str:
        return None
    if "," in val_str and "." in val_str:
        if val_str.rfind(".") > val_str.rfind(","):
            val_str = val_str.replace(",", "")
        else:
            val_str = val_str.replace(".", "").replace(",", ".")
    elif "," in val_str:
        if len(val_str.split(",")[-1]) == 2:
            val_str = val_str.replace(",", ".")
        else:
            val_str = val_str.replace(",", "")
    try:
        return round(float(val_str), 2)
    except ValueError:
        return None


# ============================================================
# OPENCV PREPROCESSING FOR IMAGES
# ============================================================

def _preprocess_image_with_opencv(file_path):
    """
    OpenCV preprocessing for OCR quality:
    - Load image with cv2
    - Convert to Grayscale
    - Apply Gaussian Blur to reduce noise
    - Apply Otsu Thresholding for crisp black-and-white text
    """
    if not HAS_OPENCV:
        if HAS_PIL:
            try:
                return Image.open(file_path), None
            except Exception as e:
                return None, f"PIL open failed: {e}"
        return None, "OpenCV and PIL not available"

    try:
        img = cv2.imread(file_path)
        if img is None:
            if HAS_PIL:
                return Image.open(file_path), None
            return None, "cv2.imread returned None"

        # 1. Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Denoise & Thresholding
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        pil_img = Image.fromarray(thresh)
        return pil_img, None
    except Exception as exc:
        if HAS_PIL:
            try:
                return Image.open(file_path), None
            except Exception:
                pass
        return None, f"OpenCV preprocessing error: {exc}"


# ============================================================
# OCR ENGINE HANDLERS (TESSERACT & EASYOCR)
# ============================================================

def _extract_text_via_tesseract(file_path):
    """Primary Image OCR path: OpenCV preprocessing + Tesseract OCR."""
    if not HAS_PYTESSERACT:
        return "", "PyTesseract is not installed"

    # 1. Try OpenCV preprocessed image
    preprocessed_img, err = _preprocess_image_with_opencv(file_path)
    if preprocessed_img:
        try:
            text = pytesseract.image_to_string(preprocessed_img, lang="eng")
            if text and len(text.strip()) >= 5:
                return text.strip(), None
        except Exception:
            pass

    # 2. Try raw file path directly with PyTesseract
    try:
        text = pytesseract.image_to_string(file_path, lang="eng")
        if text and len(text.strip()) >= 5:
            return text.strip(), None
    except Exception:
        pass

    # 3. Try PIL Image directly
    if HAS_PIL:
        try:
            img = Image.open(file_path)
            text = pytesseract.image_to_string(img, lang="eng")
            if text and len(text.strip()) >= 5:
                return text.strip(), None
        except Exception:
            pass

    return "", "PyTesseract returned empty text"


def _extract_text_via_easyocr(file_path):
    """Secondary Image OCR path: EasyOCR."""
    global EASYOCR_READER
    if not HAS_EASYOCR:
        return "", "EasyOCR is not installed"

    try:
        if EASYOCR_READER is None:
            EASYOCR_READER = easyocr.Reader(['en'], gpu=False)
        results = EASYOCR_READER.readtext(file_path, detail=0)
        text = "\n".join(results)
        return text.strip() if text else "", None
    except Exception as exc:
        return "", f"EasyOCR exception: {exc}"


# ============================================================
# LABEL-BASED FIELD PARSER
# ============================================================

def _label_based_field_parser(raw_text, filename=""):
    """
    Label-based OCR field extraction for invoice and receipt documents.
    Identifies vendor, invoice_number, date, due_date, subtotal, tax (with CGST+SGST sum),
    total_amount, currency, and line items based on explicit label boundaries line-by-line.
    Returns None for any field that cannot be detected with certainty.
    Preserves raw_text unchanged for debugging.
    """
    from utils.ai_categorizer import categorize

    clean_text = raw_text or ""
    lines = [l.strip() for l in clean_text.splitlines() if l.strip()]

    vendor = None
    invoice_number = None
    date_str = None
    due_date_str = None
    subtotal = None
    tax = None
    total_amount = None
    cgst_val = None
    sgst_val = None
    igst_val = None

    for idx, line in enumerate(lines):
        next_line = lines[idx + 1] if idx + 1 < len(lines) else ""
        combined_two_lines = f"{line} {next_line}"

        # 1. Vendor (Label-Based only — no GSTIN code fallback)
        if not vendor:
            v_match = re.search(
                r"^(?:Vendor|Supplier|Merchant|Billed By|Company|Seller|Payee|Issued By|Store)[\s:]+([A-Za-z0-9\s.,&'-]{2,60})$",
                line, re.IGNORECASE
            )
            if v_match:
                cand = v_match.group(1).strip()
                if cand.lower() not in {"invoice", "tax invoice", "receipt", "total", "bill to", "statement", "amount"}:
                    vendor = cand

        # 2. Invoice / Receipt Number (Label-Based)
        if not invoice_number:
            inv_match = re.search(
                r"(?:Tax\s*Invoice\s*No|Invoice\s*Number|Invoice\s*No|Invoice\s*#|Inv\s*No|Inv\s*#|Bill\s*No|Receipt\s*No|Receipt\s*#|Ref\s*No)[\s:]+([A-Za-z0-9-_/#]{2,30})",
                line, re.IGNORECASE
            )
            if inv_match:
                num_cand = inv_match.group(1).strip()
                if num_cand.lower() not in {"date", "no", "number", "tax"}:
                    invoice_number = num_cand
            elif re.search(r"\b(INV-[A-Za-z0-9-_]{3,20})\b", line, re.IGNORECASE):
                invoice_number = re.search(r"\b(INV-[A-Za-z0-9-_]{3,20})\b", line, re.IGNORECASE).group(1).strip()

        # 3. Date & Due Date (Label-Based) — due_date stays None if not explicitly found
        if not date_str:
            d_match = re.search(
                r"(?:Invoice\s*Date|Receipt\s*Date|Bill\s*Date|Date\s*of\s*Issue|Txn\s*Date|^Date)[\s:]+([A-Za-z0-9,\s/-]{6,25})",
                line, re.IGNORECASE
            )
            if d_match:
                parsed_d = _normalize_date(d_match.group(1).strip())
                if parsed_d:
                    date_str = parsed_d

        if not due_date_str:
            due_match = re.search(
                r"(?:Due\s*Date|Payment\s*Due|Pay\s*By|^Due)[\s:]+([A-Za-z0-9,\s/-]{6,25})",
                line, re.IGNORECASE
            )
            if due_match:
                parsed_due = _normalize_date(due_match.group(1).strip())
                if parsed_due:
                    due_date_str = parsed_due

        # 4. Total Amount (Label-Based)
        if total_amount is None:
            tot_match = re.search(
                r"(?:Grand\s*Total|Total\s*Amount|Total\s*Payable|Net\s*Amount|Total\s*Due|Amount\s*Paid|^Total)[^\d\n]*([\d,]+\.?\d*)",
                combined_two_lines, re.IGNORECASE
            )
            if tot_match:
                parsed_tot = _parse_number(tot_match.group(1))
                if parsed_tot is not None and parsed_tot > 0:
                    total_amount = parsed_tot

        # 5. Subtotal (Label-Based)
        if subtotal is None:
            sub_match = re.search(
                r"(?:Subtotal|Sub\s*Total|Sub-Total|Taxable\s*Value|Taxable\s*Amount|Net\s*Value)[^\d\n]*([\d,]+\.?\d*)",
                combined_two_lines, re.IGNORECASE
            )
            if sub_match:
                parsed_sub = _parse_number(sub_match.group(1))
                if parsed_sub is not None and parsed_sub > 0:
                    subtotal = parsed_sub

        # 6. CGST / SGST / IGST Tax Components
        if cgst_val is None:
            cgst_match = re.search(r"CGST[^\d\n]*([\d,]+\.?\d*)", combined_two_lines, re.IGNORECASE)
            if cgst_match:
                cgst_val = _parse_number(cgst_match.group(1))

        if sgst_val is None:
            sgst_match = re.search(r"SGST[^\d\n]*([\d,]+\.?\d*)", combined_two_lines, re.IGNORECASE)
            if sgst_match:
                sgst_val = _parse_number(sgst_match.group(1))

        if igst_val is None:
            igst_match = re.search(r"IGST[^\d\n]*([\d,]+\.?\d*)", combined_two_lines, re.IGNORECASE)
            if igst_match:
                igst_val = _parse_number(igst_match.group(1))

    # Top header fallback for Vendor — only plain company-name lines, never GSTIN codes
    if not vendor and lines:
        ignore_keywords = {
            "invoice", "tax invoice", "receipt", "bill", "cash receipt",
            "statement", "date", "total", "amount", "page", "subtotal",
            "phone", "email", "gstin", "gst", "pan", "cin", "www", "http"
        }
        for line in lines[:5]:
            l_lower = line.lower()
            # Skip lines that are purely numeric/symbol, or look like GSTIN/PAN codes
            if (len(line) >= 3
                    and not any(kw in l_lower for kw in ignore_keywords)
                    and not re.match(r"^[\d\s.,/\-#@:]+$", line)
                    and not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", line)):
                vendor = line.strip()
                break

    # Date fallback if label search missed
    if not date_str:
        gen_match = re.search(r"\b(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", clean_text)
        if gen_match:
            date_str = _normalize_date(gen_match.group(1))

    # Calculate Tax total from CGST + SGST or IGST
    if cgst_val is not None or sgst_val is not None:
        tax = round((cgst_val or 0.0) + (sgst_val or 0.0), 2)
    elif igst_val is not None:
        tax = round(igst_val, 2)
    else:
        gen_tax_match = re.search(
            r"(?:^Tax|GST|VAT|Total\s*Tax)[\s:₹$Rs.%@0-9]*[\s:]+([\d,]+\.?\d*)",
            clean_text, re.IGNORECASE | re.MULTILINE
        )
        if gen_tax_match:
            tax = _parse_number(gen_tax_match.group(1))

    # Currency
    currency = "INR"
    if "₹" in clean_text or "INR" in clean_text or "Rs." in clean_text or "Rs " in clean_text:
        currency = "INR"
    elif "$" in clean_text or "USD" in clean_text:
        currency = "USD"
    elif "€" in clean_text or "EUR" in clean_text:
        currency = "EUR"
    elif "£" in clean_text or "GBP" in clean_text:
        currency = "GBP"

    # Line Items — only genuine parsed rows; never fabricate synthetic entries
    line_items = []
    for line in lines:
        item_match = re.search(
            r"^([A-Za-z0-9\s.,&'-]{3,50})\s+(\d+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$", line
        )
        if item_match:
            desc = item_match.group(1).strip()
            if desc.lower() not in {"total", "subtotal", "tax", "description", "item"}:
                line_items.append({
                    "description": desc,
                    "quantity": float(item_match.group(2)),
                    "unit_price": float(item_match.group(3).replace(",", "")),
                    "total_price": float(item_match.group(4).replace(",", ""))
                })
    # No fallback fabrication — return empty list when no real items found

    # AI Category & Confidence
    ai_cat = (
        categorize(f"{vendor or ''} {clean_text} {filename}")
        if (vendor or clean_text)
        else {"category": "Uncategorized", "confidence": 0}
    )

    detected_count = sum(1 for f in [vendor, invoice_number, date_str, total_amount] if f is not None)
    confidence_score = round((detected_count / 4.0) * 100, 2)

    missing_fields = []
    if not vendor:          missing_fields.append("vendor name")
    if not invoice_number:  missing_fields.append("invoice number")
    if not date_str:        missing_fields.append("date")
    if total_amount is None: missing_fields.append("total amount")

    needs_review = len(missing_fields) > 0
    review_reason = f"Uncertain fields: {', '.join(missing_fields)}" if missing_fields else None

    # Per-field confidence flags
    confidence_per_field = {
        "vendor": vendor is not None,
        "invoice_number": invoice_number is not None,
        "date": date_str is not None,
        "due_date": due_date_str is not None,  # True only if explicitly found
        "subtotal": subtotal is not None,
        "tax": tax is not None,
        "total_amount": total_amount is not None,
    }

    return {
        "vendor": vendor,
        "invoice_number": invoice_number,
        "date": date_str,
        "due_date": due_date_str,       # None if not found — never copy from date
        "subtotal": subtotal,
        "tax": tax,
        "total_amount": total_amount,
        "currency": currency,
        "line_items": line_items,
        "ai_category": ai_cat["category"],
        "ai_confidence": confidence_score if confidence_score > 0 else ai_cat["confidence"],
        "needs_manual_review": needs_review,
        "requires_review": needs_review,
        "manual_review_reason": review_reason,
        "validation_warnings": [f"Missing: {m}" for m in missing_fields],
        "confidence_per_field": confidence_per_field,
        "raw_text": clean_text[:10000] if clean_text else ""
    }


# ============================================================
# PDF EXTRACTION PATH
# ============================================================

def _extract_pdf_text(file_path):
    """Extract selectable text from PDF file."""
    if not HAS_PYPDF:
        return ""
    try:
        reader = pypdf.PdfReader(file_path)
        pages = []
        for page in reader.pages:
            try:
                t = page.extract_text()
                if t:
                    pages.append(t)
            except Exception:
                pass
        return "\n".join(pages).strip()
    except Exception:
        return ""


def _convert_pdf_to_images(file_path):
    """Convert first 5 PDF pages to images."""
    if not HAS_PDF2IMAGE:
        return [], "pdf2image not installed"
    try:
        images = convert_from_path(file_path, first_page=1, last_page=5, dpi=200)
        return (images, None) if images else ([], "No pages rendered")
    except Exception as exc:
        return [], str(exc)


def _pil_image_to_bytes(image):
    if not HAS_PIL:
        return None, "PIL not installed"
    try:
        import io
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=95)
        return out.getvalue(), None
    except Exception as exc:
        return None, str(exc)


def _extract_from_pdf(file_path):
    """
    Dedicated PDF Extraction Path:
    1. Try PyPDF text extraction first.
    2. If Gemini API key is set, call Gemini API.
    3. If scanned PDF, convert pages to images via pdf2image and run Tesseract/OpenCV.
    4. Run Label-Based Field Parser.
    """
    filename = os.path.basename(file_path)
    pdf_text = _extract_pdf_text(file_path)

    if len(pdf_text.strip()) >= 20:
        if GEMINI_API_KEY and GEMINI_API_KEY != "YOUR_GEMINI_API_KEY":
            data, error = _call_gemini_with_text(pdf_text)
            if not error and data:
                return _normalize_gemini_result(data, pdf_text), "gemini_pdf_text"

        parsed = _label_based_field_parser(pdf_text, filename)
        return parsed, "pdf_text_extraction"

    # Scanned PDF path
    images, error = _convert_pdf_to_images(file_path)
    if images:
        ocr_texts = []
        for img in images:
            img_bytes, conv_err = _pil_image_to_bytes(img)
            if img_bytes:
                import tempfile
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
                    tmp_file.write(img_bytes)
                    tmp_path = tmp_file.name
                try:
                    txt, _ = _extract_text_via_tesseract(tmp_path)
                    if txt:
                        ocr_texts.append(txt)
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

        combined_text = "\n---\n".join(ocr_texts) if ocr_texts else pdf_text
        parsed = _label_based_field_parser(combined_text, filename)
        return parsed, "scanned_pdf_ocr"

    parsed = _label_based_field_parser(pdf_text or f"PDF file: {filename}", filename)
    return parsed, "pdf_text_extraction"


# ============================================================
# IMAGE EXTRACTION PATH
# ============================================================

def _extract_from_image(file_path):
    """
    Dedicated Image Extraction Path for PNG/JPG/JPEG/TIFF/BMP/WEBP.
    Uses Tesseract OCR with OpenCV preprocessing as primary.
    Uses EasyOCR / Gemini Vision as fallback.
    Does NOT use PDF text fallback for images.
    """
    filename = os.path.basename(file_path)
    raw_text = ""
    method = "tesseract_ocr_opencv"

    # 1. Primary: Tesseract + OpenCV preprocessing
    tess_text, tess_err = _extract_text_via_tesseract(file_path)
    if tess_text and len(tess_text.strip()) >= 10:
        raw_text = tess_text
        method = "tesseract_ocr_opencv"
    else:
        # 2. Secondary / Fallback: EasyOCR
        easy_text, easy_err = _extract_text_via_easyocr(file_path)
        if easy_text and len(easy_text.strip()) >= 10:
            raw_text = easy_text
            method = "easyocr_fallback"
        else:
            # 3. Gemini Vision (if configured)
            if GEMINI_API_KEY and GEMINI_API_KEY != "YOUR_GEMINI_API_KEY":
                image_bytes, mime_type, prep_err = _prepare_image_for_gemini(file_path)
                if image_bytes:
                    data, g_err = _call_gemini_with_image(image_bytes, mime_type)
                    if not g_err and data:
                        res = _normalize_gemini_result(data, f"Image: {filename}")
                        res["raw_text"] = res.get("raw_text") or tess_text or easy_text or f"Image: {filename}"
                        return res, "gemini_vision"

            raw_text = tess_text or easy_text or f"Image document: {filename}"
            method = "tesseract_ocr_opencv" if tess_text else ("easyocr_fallback" if easy_text else "image_ocr_failed")

    parsed = _label_based_field_parser(raw_text, filename)
    return parsed, method


# ============================================================
# GEMINI HELPERS
# ============================================================

def _get_image_mime_type(filename):
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff"
    }
    return mapping.get(ext, "image/jpeg")


def _prepare_image_for_gemini(file_path):
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        if not data:
            return None, None, "Image empty"
        return data, _get_image_mime_type(file_path), None
    except Exception as exc:
        return None, None, str(exc)


_GEMINI_SCHEMA_PROMPT = """
Extract structured data from this invoice or receipt document and return ONLY a JSON object with these exact fields:

{
  "vendor": "<string: company or person name who issued the invoice, or null if not found>",
  "invoice_number": "<string: invoice/receipt/bill number, or null if not found>",
  "date": "<string: invoice/receipt date in YYYY-MM-DD format, or null if not found>",
  "due_date": "<string: payment due date in YYYY-MM-DD format, or null — do NOT copy from date unless explicitly stated as due date>",
  "subtotal": "<number: amount before tax, or null if not found>",
  "tax": "<number: total tax amount (CGST+SGST or IGST or GST/VAT), or null if not found>",
  "total_amount": "<number: final payable amount including tax, or null if not found>",
  "currency": "<string: INR, USD, EUR, or GBP — default INR if rupee symbols or Indian context>",
  "line_items": [
    {"description": "<string>", "quantity": <number>, "unit_price": <number>, "total_price": <number>}
  ],
  "ai_category": "<string: one of: Food & Dining, Travel, Office Supplies, Utilities, Healthcare, Education, Entertainment, Shopping, Technology, Other>",
  "ai_confidence": <number: your confidence 0-100 that the extracted data is accurate>
}

CRITICAL RULES:
- Return null for any field you cannot find with certainty. Never invent or estimate values.
- Do NOT calculate missing values. If subtotal is not shown, return null — do not subtract tax from total.
- Do NOT copy date into due_date unless the document explicitly labels a due/payment date.
- Return an empty array [] for line_items if no itemized rows are present.
- Numbers must be plain floats (no currency symbols or commas).
- Return ONLY the JSON object, no explanation text.
"""


def _call_gemini_with_image(image_bytes, mime_type):
    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
        return None, "GEMINI_API_KEY unconfigured"
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "contents": [{
            "parts": [
                {"text": _GEMINI_SCHEMA_PROMPT},
                {"inline_data": {"mime_type": mime_type, "data": encoded}}
            ]
        }],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}
    }
    try:
        res = requests.post(f"{GEMINI_ENDPOINT}?key={GEMINI_API_KEY}", json=payload, timeout=GEMINI_TIMEOUT)
        if res.status_code == 200:
            return _extract_json_from_response(res.json())
        return None, f"Gemini HTTP {res.status_code}"
    except Exception as exc:
        return None, str(exc)


def _call_gemini_with_text(document_text):
    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
        return None, "GEMINI_API_KEY unconfigured"
    payload = {
        "contents": [{
            "parts": [{
                "text": (
                    f"{_GEMINI_SCHEMA_PROMPT}\n\n"
                    f"DOCUMENT TEXT:\n{document_text[:30000]}"
                )
            }]
        }],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}
    }
    try:
        res = requests.post(f"{GEMINI_ENDPOINT}?key={GEMINI_API_KEY}", json=payload, timeout=GEMINI_TIMEOUT)
        if res.status_code == 200:
            return _extract_json_from_response(res.json())
        return None, f"Gemini HTTP {res.status_code}"
    except Exception as exc:
        return None, str(exc)


def _extract_json_from_response(response_json):
    try:
        candidates = response_json.get("candidates", [])
        if not candidates:
            return None, "No candidates"
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return None, "No content parts"
        text = "\n".join([p.get("text", "") for p in parts if isinstance(p, dict)]).strip()
        text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
        try:
            return json.loads(text), None
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(text[start:end+1]), None
        return None, "Invalid JSON from Gemini"
    except Exception as exc:
        return None, str(exc)


def _normalize_gemini_result(data, raw_text=""):
    result = _empty_result()
    if not isinstance(data, dict):
        return get_failed_ocr_response(raw_text, "Invalid Gemini structure")

    result["vendor"] = data.get("vendor") or None
    result["invoice_number"] = data.get("invoice_number") or None
    result["date"] = _normalize_date(data.get("date"))
    # due_date: ONLY use explicitly returned value — never copy from date
    result["due_date"] = _normalize_date(data.get("due_date")) or None
    result["subtotal"] = _parse_number(data.get("subtotal"))
    result["tax"] = _parse_number(data.get("tax"))
    result["total_amount"] = _parse_number(data.get("total_amount"))
    result["currency"] = data.get("currency") or "INR"
    result["line_items"] = data.get("line_items") or []
    result["ai_category"] = data.get("ai_category") or "Uncategorized"
    # Use Gemini's confidence only if explicitly returned; 0.0 otherwise — never invent a score
    raw_conf = data.get("ai_confidence")
    result["ai_confidence"] = float(raw_conf) if raw_conf is not None else 0.0
    result["raw_text"] = raw_text[:10000] if raw_text else str(data)[:1000]

    missing = []
    if not result["vendor"]:          missing.append("vendor name")
    if not result["invoice_number"]:  missing.append("invoice number")
    if not result["date"]:            missing.append("date")
    if result["total_amount"] is None: missing.append("total amount")

    result["needs_manual_review"] = len(missing) > 0
    result["requires_review"] = len(missing) > 0
    result["manual_review_reason"] = f"Uncertain fields: {', '.join(missing)}" if missing else None
    result["validation_warnings"] = [f"Missing: {m}" for m in missing]

    # Per-field confidence flags
    result["confidence_per_field"] = {
        "vendor": result["vendor"] is not None,
        "invoice_number": result["invoice_number"] is not None,
        "date": result["date"] is not None,
        "due_date": result["due_date"] is not None,
        "subtotal": result["subtotal"] is not None,
        "tax": result["tax"] is not None,
        "total_amount": result["total_amount"] is not None,
    }
    return result


def extract_text_from_file(file_path, filename=""):
    if not os.path.exists(file_path):
        return "", "failed"
    ext = os.path.splitext(filename or file_path)[1].lower().lstrip(".")
    if ext == "pdf":
        t = _extract_pdf_text(file_path)
        return (t, "pdf_text") if t else ("", "pdf_image")
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return ("", "image_ocr")
    return ("", "failed")


# ============================================================
# MAIN OCR FUNCTION
# ============================================================

def extract_invoice_data_from_file(file_path, filename=""):
    """
    Main entry point for OCR extraction on invoices and expenses.
    Executes separate PDF or Image extraction pipelines.
    Logs raw OCR text, extraction method, and parsed fields JSON.
    """
    fname = filename or os.path.basename(file_path)

    if not os.path.exists(file_path):
        res = get_failed_ocr_response("", "Uploaded file does not exist")
        method = "failed"
    else:
        ext = os.path.splitext(fname)[1].lower().lstrip(".")
        if ext in SUPPORTED_IMAGE_EXTENSIONS:
            res, method = _extract_from_image(file_path)
        elif ext == "pdf":
            res, method = _extract_from_pdf(file_path)
        else:
            res, method = get_failed_ocr_response("", f"Unsupported extension .{ext}"), "failed"

    raw_text = res.get("raw_text", "")

    log_msg = (
        f"\n==================== OCR PIPELINE LOG ====================\n"
        f"File Path        : {file_path}\n"
        f"File Name        : {fname}\n"
        f"Extraction Method: {method}\n"
        f"Raw OCR Text     :\n{raw_text[:1000] if raw_text else '(none)'}\n"
        f"Parsed Fields    :\n{json.dumps(res, indent=2, default=str)}\n"
        f"=========================================================="
    )
    logger.info(log_msg)
    print(log_msg, flush=True)

    return res, method