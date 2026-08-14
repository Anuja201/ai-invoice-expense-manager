"""
routes/ocr.py

Gemini Vision based invoice extraction.

Pipeline:
    Image/PDF
        ↓
    Gemini 2.5 Flash Vision
        ↓
    Structured JSON
        ↓
    Validation / normalization
        ↓
    Return data compatible with invoices.py

Important:
- Never invent missing invoice values.
- Missing/unclear fields are returned as None.
- Existing invoices.py function names are preserved.
- PDF support is preserved.
"""

import os
import re
import json
import base64
from datetime import datetime
from decimal import Decimal, InvalidOperation

import requests
from flask import Blueprint, jsonify, request

# Optional PDF support
try:
    import pypdf

    HAS_PYPDF = True
except ImportError:
    try:
        import PyPDF2 as pypdf

        HAS_PYPDF = True
    except ImportError:
        HAS_PYPDF = False

try:
    from pdf2image import convert_from_path

    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

from config import Config


ocr_bp = Blueprint("ocr", __name__)


# ============================================================
# CONFIGURATION
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
).strip()

try:
    GEMINI_TIMEOUT = int(
        os.getenv("GEMINI_TIMEOUT", "60")
    )
except (TypeError, ValueError):
    GEMINI_TIMEOUT = 60


GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


# ============================================================
# SUPPORTED FILE TYPES
# ============================================================

SUPPORTED_IMAGE_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "tiff",
    "bmp",
    "webp",
}

SUPPORTED_EXTENSIONS = (
    SUPPORTED_IMAGE_EXTENSIONS
    | {"pdf"}
)


# ============================================================
# COMMON RESPONSE STRUCTURE
# ============================================================

def _empty_result():
    """
    Return the standard extraction structure.

    This structure intentionally matches the fields expected
    by the existing invoices.py.
    """

    return {
        "vendor": None,
        "invoice_number": None,
        "date": None,
        "due_date": None,
        "subtotal": None,
        "tax": None,
        "total_amount": None,
        "currency": None,
        "line_items": [],
        "ai_category": "Uncategorized",
        "ai_confidence": 0.0,
        "needs_manual_review": False,
        "requires_review": False,
        "manual_review_reason": None,
        "validation_warnings": [],
        "raw_text": "",
    }


# ============================================================
# FAILED OCR RESPONSE
# ============================================================

def get_failed_ocr_response(
    raw_text="",
    reason="OCR extraction failed"
):
    """
    Return a safe failure response.

    No values are guessed or generated.
    """

    result = _empty_result()

    result["needs_manual_review"] = True
    result["requires_review"] = True
    result["manual_review_reason"] = reason
    result["error"] = reason
    result["raw_text"] = (
        raw_text[:5000]
        if raw_text
        else ""
    )

    return result


# ============================================================
# STRING HELPERS
# ============================================================

def _clean_string(value):
    """
    Safely convert a value to a clean string.
    """

    if value is None:
        return None

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return None

        return value

    return str(value).strip() or None


def _normalize_null(value):
    """
    Convert common AI null-like values into Python None.
    """

    if value is None:
        return None

    if isinstance(value, str):

        value = value.strip()

        if value.lower() in {
            "",
            "null",
            "none",
            "n/a",
            "na",
            "not available",
            "unknown",
            "not found",
            "not provided",
        }:
            return None

    return value


# ============================================================
# NUMBER NORMALIZATION
# ============================================================

def _parse_number(value):
    """
    Convert an AI amount into a numeric value.

    Examples:
        "₹1,250.50" -> 1250.50
        "1,250.50"  -> 1250.50
        1250.50     -> 1250.50

    No calculation is performed.
    """

    value = _normalize_null(value)

    if value is None:
        return None

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        try:
            number = float(value)

            if number < 0:
                return None

            return round(number, 2)

        except (ValueError, TypeError):
            return None

    if isinstance(value, str):

        cleaned = value.strip()

        # Remove common currency symbols and names.
        cleaned = re.sub(
            r"(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)",
            "",
            cleaned,
            flags=re.IGNORECASE
        )

        # Remove spaces.
        cleaned = cleaned.replace(" ", "")

        # Handle comma-separated numbers.
        cleaned = cleaned.replace(",", "")

        # Keep only numeric characters, decimal point,
        # and minus sign.
        cleaned = re.sub(
            r"[^0-9.\-]",
            "",
            cleaned
        )

        if not cleaned:
            return None

        try:

            number = Decimal(cleaned)

            if number < 0:
                return None

            return float(
                number.quantize(
                    Decimal("0.01")
                )
            )

        except (
            InvalidOperation,
            ValueError,
            TypeError
        ):
            return None

    return None


# ============================================================
# DATE NORMALIZATION
# ============================================================

def _parse_date_to_iso(raw):
    """
    Convert common invoice date formats to YYYY-MM-DD.

    Returns None if the date cannot be confidently parsed.
    """

    raw = _normalize_null(raw)

    if raw is None:
        return None

    raw = str(raw).strip()

    # Remove ordinal suffixes:
    # 1st -> 1
    # 2nd -> 2
    # 3rd -> 3
    # 4th -> 4
    raw = re.sub(
        r"(?<=\d)(st|nd|rd|th)\b",
        "",
        raw,
        flags=re.IGNORECASE
    )

    raw = raw.replace(",", " ")

    raw = re.sub(
        r"\s+",
        " ",
        raw
    ).strip()

    formats = [

        # ISO
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",

        # Day first
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d.%m.%Y",

        "%d-%m-%y",
        "%d/%m/%y",
        "%d.%m.%y",

        # Month names
        "%d %b %Y",
        "%d %B %Y",
        "%d %b %y",
        "%d %B %y",

        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d/%b/%Y",
        "%d/%B/%Y",

        # Month first
        "%b %d %Y",
        "%B %d %Y",
        "%b %d, %Y",
        "%B %d, %Y",

        "%m-%d-%Y",
        "%m/%d/%Y",
        "%m.%d.%Y",
    ]

    for fmt in formats:

        try:

            parsed = datetime.strptime(
                raw,
                fmt
            )

            return parsed.strftime(
                "%Y-%m-%d"
            )

        except ValueError:
            continue

    return None


# ============================================================
# DATE VALIDATION
# ============================================================

def _normalize_date(value):
    """
    Normalize an AI-returned date.

    If it cannot be parsed, return None.
    """

    value = _normalize_null(value)

    if value is None:
        return None

    parsed = _parse_date_to_iso(
        value
    )

    return parsed


# ============================================================
# LINE ITEM NORMALIZATION
# ============================================================

def _normalize_line_items(items):
    """
    Normalize line items returned by Gemini.

    Keeps the structure simple and safe.
    """

    if not isinstance(items, list):
        return []

    normalized = []

    for item in items:

        if not isinstance(item, dict):
            continue

        description = _clean_string(
            item.get("description")
        )

        quantity = _parse_number(
            item.get("quantity")
        )

        unit_price = _parse_number(
            item.get("unit_price")
        )

        amount = _parse_number(
            item.get("amount")
        )

        normalized.append({
            "description": description,
            "quantity": quantity,
            "unit_price": unit_price,
            "amount": amount,
        })

    return normalized


# ============================================================
# GEMINI PROMPT
# ============================================================

GEMINI_SYSTEM_PROMPT = """
You are an expert invoice document extraction system.

Your task is to inspect the supplied invoice image/document
and extract ONLY information that is visibly present.

CRITICAL RULES:

1. Never guess.
2. Never invent values.
3. Never generate an invoice number.
4. Never calculate a missing subtotal.
5. Never calculate a missing tax.
6. Never calculate a missing total.
7. Never assume a missing value is zero.
8. If a field is not clearly visible, return null.
9. If text is unclear or unreadable, return null.
10. Preserve the actual values visible on the invoice.
11. Do not confuse invoice number with order number,
    customer number, purchase order number, GST number,
    phone number, or transaction ID.
12. Do not confuse invoice date with due date.
13. Do not confuse subtotal with total.
14. Do not calculate total from subtotal + tax.
15. Extract tax only when a tax amount is actually visible.
16. Extract subtotal only when a subtotal amount is actually visible.
17. Extract total only when a total/grand total/amount due
    value is actually visible.
18. Use the invoice's own currency if visible.
19. For line items, only return information that is visible.
20. Return valid JSON only.

INVOICE NUMBER:
Look for labels such as:
- Invoice Number
- Invoice No
- Invoice #
- Inv No
- Bill Number
- Bill No
- Receipt Number

DATE:
Look for:
- Invoice Date
- Issue Date
- Date
- Dated

DUE DATE:
Look for:
- Due Date
- Payment Due
- Pay By
- Payment Due Date

VENDOR:
Identify the company/business issuing the invoice.
Do not use the customer/buyer name as the vendor.

SUBTOTAL:
Use the value explicitly labelled:
- Subtotal
- Sub-total
- Sub Total

TAX:
Use the explicitly shown tax amount.
Examples:
- GST
- CGST
- SGST
- IGST
- VAT
- Sales Tax

If multiple tax components exist, return the total tax amount
ONLY if the invoice explicitly provides a combined tax total.
Do not calculate it yourself.

TOTAL:
Use the explicitly shown final amount such as:
- Grand Total
- Total
- Total Amount
- Amount Due
- Total Payable
- Balance Due

Return this exact JSON structure:

{
  "vendor": null,
  "invoice_number": null,
  "date": null,
  "due_date": null,
  "subtotal": null,
  "tax": null,
  "total_amount": null,
  "currency": null,
  "line_items": [],
  "ai_category": "Uncategorized",
  "ai_confidence": 0.0,
  "field_confidence": {
    "vendor": 0.0,
    "invoice_number": 0.0,
    "date": 0.0,
    "due_date": 0.0,
    "subtotal": 0.0,
    "tax": 0.0,
    "total_amount": 0.0
  },
  "raw_text": ""
}

Confidence values must be between 0.0 and 1.0.

The confidence value describes how clearly the field was
visible and identified.

Do not add extra JSON fields.
"""


# ============================================================
# GEMINI RESPONSE EXTRACTION
# ============================================================

def _extract_json_from_response(response_json):
    """
    Extract JSON text from Gemini API response.
    """

    try:

        candidates = response_json.get(
            "candidates",
            []
        )

        if not candidates:
            return None, "Gemini returned no candidates"

        candidate = candidates[0]

        content = candidate.get(
            "content",
            {}
        )

        parts = content.get(
            "parts",
            []
        )

        if not parts:
            return None, "Gemini returned no content"

        text_parts = []

        for part in parts:

            if isinstance(part, dict):

                text = part.get(
                    "text"
                )

                if text:
                    text_parts.append(
                        text
                    )

        if not text_parts:
            return None, "Gemini returned no text"

        text = "\n".join(
            text_parts
        ).strip()

        # Remove markdown JSON fences if present.
        text = re.sub(
            r"^```json\s*",
            "",
            text,
            flags=re.IGNORECASE
        )

        text = re.sub(
            r"^```\s*",
            "",
            text
        )

        text = re.sub(
            r"\s*```$",
            "",
            text
        )

        text = text.strip()

        # First attempt: direct JSON
        try:

            return json.loads(
                text
            ), None

        except json.JSONDecodeError:
            pass

        # Second attempt: find JSON object.
        start = text.find("{")
        end = text.rfind("}")

        if start >= 0 and end > start:

            json_text = text[
                start:end + 1
            ]

            try:

                return json.loads(
                    json_text
                ), None

            except json.JSONDecodeError as exc:

                return (
                    None,
                    f"Invalid JSON from Gemini: {exc}"
                )

        return None, "No JSON object found in Gemini response"

    except Exception as exc:

        return (
            None,
            f"Could not parse Gemini response: {exc}"
        )


# ============================================================
# GEMINI REQUEST
# ============================================================

def _call_gemini_with_image(
    image_bytes,
    mime_type
):
    """
    Send an image to Gemini Vision.
    """

    if not GEMINI_API_KEY:

        return (
            None,
            "GEMINI_API_KEY is not configured"
        )

    if not image_bytes:

        return (
            None,
            "Image data is empty"
        )

    encoded_image = base64.b64encode(
        image_bytes
    ).decode("utf-8")

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": GEMINI_SYSTEM_PROMPT
                    },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json"
        }
    }

    headers = {
        "Content-Type": "application/json"
    }

    url = (
        f"{GEMINI_ENDPOINT}"
        f"?key={GEMINI_API_KEY}"
    )

    try:

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=GEMINI_TIMEOUT
        )

    except requests.Timeout:

        return (
            None,
            "Gemini API request timed out"
        )

    except requests.RequestException as exc:

        return (
            None,
            f"Gemini API request failed: {exc}"
        )

    except Exception as exc:

        return (
            None,
            f"Unexpected Gemini request error: {exc}"
        )

    if response.status_code != 200:

        try:
            error_data = response.json()

            error_message = (
                error_data
                .get("error", {})
                .get("message")
            )

        except Exception:

            error_message = None

        if not error_message:
            error_message = response.text[:1000]

        return (
            None,
            (
                f"Gemini API returned HTTP "
                f"{response.status_code}: "
                f"{error_message}"
            )
        )

    try:

        response_json = response.json()

    except ValueError:

        return (
            None,
            "Gemini returned invalid HTTP JSON"
        )

    return _extract_json_from_response(
        response_json
    )


# ============================================================
# GEMINI REQUEST WITH PDF TEXT
# ============================================================

def _call_gemini_with_text(
    document_text
):
    """
    Send extracted PDF text to Gemini.

    This is used for text-based PDFs where pypdf can extract
    meaningful text without rendering the PDF.
    """

    if not GEMINI_API_KEY:

        return (
            None,
            "GEMINI_API_KEY is not configured"
        )

    if not document_text:

        return (
            None,
            "PDF text is empty"
        )

    prompt = (
        GEMINI_SYSTEM_PROMPT
        + "\n\n"
        + "The following text was extracted from the invoice PDF. "
        + "Use it as the document content. Preserve values exactly "
        + "as supported by the text.\n\n"
        + "DOCUMENT TEXT:\n"
        + document_text[:30000]
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json"
        }
    }

    headers = {
        "Content-Type": "application/json"
    }

    url = (
        f"{GEMINI_ENDPOINT}"
        f"?key={GEMINI_API_KEY}"
    )

    try:

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=GEMINI_TIMEOUT
        )

    except requests.Timeout:

        return (
            None,
            "Gemini API request timed out"
        )

    except requests.RequestException as exc:

        return (
            None,
            f"Gemini API request failed: {exc}"
        )

    except Exception as exc:

        return (
            None,
            f"Unexpected Gemini request error: {exc}"
        )

    if response.status_code != 200:

        try:
            error_data = response.json()

            error_message = (
                error_data
                .get("error", {})
                .get("message")
            )

        except Exception:

            error_message = None

        if not error_message:
            error_message = response.text[:1000]

        return (
            None,
            (
                f"Gemini API returned HTTP "
                f"{response.status_code}: "
                f"{error_message}"
            )
        )

    try:

        response_json = response.json()

    except ValueError:

        return (
            None,
            "Gemini returned invalid HTTP JSON"
        )

    return _extract_json_from_response(
        response_json
    )


# ============================================================
# IMAGE MIME TYPE
# ============================================================

def _get_image_mime_type(filename):
    """
    Determine MIME type from filename.
    """

    ext = os.path.splitext(
        filename
    )[1].lower()

    mapping = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }

    return mapping.get(
        ext,
        "image/jpeg"
    )


# ============================================================
# IMAGE PREPARATION
# ============================================================

def _prepare_image_for_gemini(
    file_path
):
    """
    Read an image file.

    The original image is preserved as much as possible.
    """

    try:

        with open(
            file_path,
            "rb"
        ) as file:

            data = file.read()

        if not data:

            return (
                None,
                None,
                "Image file is empty"
            )

        mime_type = _get_image_mime_type(
            file_path
        )

        return (
            data,
            mime_type,
            None
        )

    except Exception as exc:

        return (
            None,
            None,
            f"Could not read image: {exc}"
        )


# ============================================================
# PDF TEXT EXTRACTION
# ============================================================

def _extract_pdf_text(
    file_path
):
    """
    Extract selectable text from PDF.

    Returns empty string if the PDF is scanned/image-only.
    """

    if not HAS_PYPDF:
        return ""

    try:

        reader = pypdf.PdfReader(
            file_path
        )

        pages = []

        for page in reader.pages:

            try:

                text = page.extract_text()

            except Exception:

                text = ""

            if text:

                pages.append(
                    text
                )

        return "\n".join(
            pages
        ).strip()

    except Exception:

        return ""


# ============================================================
# PDF TO IMAGES
# ============================================================

def _convert_pdf_to_images(
    file_path
):
    """
    Convert the first five PDF pages to images.

    This preserves the existing application's PDF support.
    """

    if not HAS_PDF2IMAGE:

        return (
            [],
            "pdf2image is not installed"
        )

    try:

        images = convert_from_path(
            file_path,
            first_page=1,
            last_page=5,
            dpi=200
        )

        if not images:

            return (
                [],
                "No PDF pages could be rendered"
            )

        return (
            images,
            None
        )

    except Exception as exc:

        return (
            [],
            f"Could not render PDF: {exc}"
        )


# ============================================================
# PIL IMAGE TO BYTES
# ============================================================

def _pil_image_to_bytes(
    image
):
    """
    Convert PIL image to JPEG bytes.

    Used for scanned PDF pages.
    """

    if not HAS_PIL:

        return (
            None,
            "Pillow is not installed"
        )

    try:

        import io

        if image.mode not in (
            "RGB",
            "L"
        ):

            image = image.convert(
                "RGB"
            )

        elif image.mode == "L":

            image = image.convert(
                "RGB"
            )

        output = io.BytesIO()

        image.save(
            output,
            format="JPEG",
            quality=95
        )

        return (
            output.getvalue(),
            None
        )

    except Exception as exc:

        return (
            None,
            f"Could not convert PDF page to image: {exc}"
        )


# ============================================================
# NORMALIZE GEMINI RESULT
# ============================================================

def _normalize_gemini_result(
    data,
    raw_text=""
):
    """
    Convert Gemini output into the exact structure expected
    by the existing invoice upload endpoint.
    """

    result = _empty_result()

    if not isinstance(data, dict):

        return get_failed_ocr_response(
            raw_text,
            "Gemini returned an invalid extraction structure"
        )

    # --------------------------------------------------------
    # Basic fields
    # --------------------------------------------------------

    result["vendor"] = _clean_string(
        _normalize_null(
            data.get("vendor")
        )
    )

    result["invoice_number"] = _clean_string(
        _normalize_null(
            data.get("invoice_number")
        )
    )

    # --------------------------------------------------------
    # Dates
    # --------------------------------------------------------

    result["date"] = _normalize_date(
        data.get("date")
    )

    result["due_date"] = _normalize_date(
        data.get("due_date")
    )

    # --------------------------------------------------------
    # Amounts
    # --------------------------------------------------------

    result["subtotal"] = _parse_number(
        data.get("subtotal")
    )

    result["tax"] = _parse_number(
        data.get("tax")
    )

    result["total_amount"] = _parse_number(
        data.get("total_amount")
    )

    # --------------------------------------------------------
    # Currency
    # --------------------------------------------------------

    currency = _clean_string(
        _normalize_null(
            data.get("currency")
        )
    )

    if currency:

        result["currency"] = (
            currency.upper()
        )

    # --------------------------------------------------------
    # Line items
    # --------------------------------------------------------

    result["line_items"] = (
        _normalize_line_items(
            data.get("line_items")
        )
    )

    # --------------------------------------------------------
    # AI category
    # --------------------------------------------------------

    category = _clean_string(
        data.get("ai_category")
    )

    if category:

        result["ai_category"] = category

    # --------------------------------------------------------
    # Confidence
    # --------------------------------------------------------

    confidence = data.get(
        "ai_confidence",
        0.0
    )

    try:

        confidence = float(
            confidence
        )

    except (
        ValueError,
        TypeError
    ):

        confidence = 0.0

    confidence = max(
        0.0,
        min(1.0, confidence)
    )

    # Existing database/frontend may expect percentage.
    # The old code used values such as 85.
    #
    # Gemini returns 0.0 - 1.0.
    # Convert to 0 - 100.

    result["ai_confidence"] = round(
        confidence * 100,
        2
    )

    # --------------------------------------------------------
    # Raw text
    # --------------------------------------------------------

    ai_raw_text = _clean_string(
        data.get("raw_text")
    )

    if ai_raw_text:

        result["raw_text"] = (
            ai_raw_text[:5000]
        )

    elif raw_text:

        result["raw_text"] = (
            raw_text[:5000]
        )

    # --------------------------------------------------------
    # FIELD CONFIDENCE
    # --------------------------------------------------------

    field_confidence = data.get(
        "field_confidence"
    )

    if isinstance(
        field_confidence,
        dict
    ):

        normalized_confidence = {}

        for field in [
            "vendor",
            "invoice_number",
            "date",
            "due_date",
            "subtotal",
            "tax",
            "total_amount",
        ]:

            value = field_confidence.get(
                field,
                0.0
            )

            try:

                value = float(
                    value
                )

            except (
                ValueError,
                TypeError
            ):

                value = 0.0

            normalized_confidence[
                field
            ] = max(
                0.0,
                min(1.0, value)
            )

        result["field_confidence"] = (
            normalized_confidence
        )

    # ========================================================
    # VALIDATION
    # ========================================================

    review_reasons = []

    warnings = []

    # Vendor
    if not result["vendor"]:

        review_reasons.append(
            "vendor name could not be identified"
        )

    # Invoice number
    if not result["invoice_number"]:

        review_reasons.append(
            "invoice number could not be identified"
        )

    # Date
    if data.get("date") and not result["date"]:

        review_reasons.append(
            "invoice date could not be parsed"
        )

    if not result["date"]:

        review_reasons.append(
            "invoice date could not be identified"
        )

    # Subtotal
    if result["subtotal"] is None:

        warnings.append(
            "subtotal could not be identified"
        )

    # Tax
    #
    # Tax is intentionally NOT a required field.
    #
    # Some invoices do not show tax separately.
    if result["tax"] is None:

        warnings.append(
            "tax amount could not be identified"
        )

    # Total
    if result["total_amount"] is None:

        review_reasons.append(
            "total amount could not be identified"
        )

    # --------------------------------------------------------
    # Total consistency check
    # --------------------------------------------------------
    #
    # IMPORTANT:
    # We do NOT calculate or replace any invoice values.
    #
    # This check only produces a warning/review request if
    # all three values are explicitly available and disagree.
    #

    if (
        result["subtotal"] is not None
        and result["tax"] is not None
        and result["total_amount"] is not None
    ):

        expected = round(
            result["subtotal"]
            + result["tax"],
            2
        )

        actual = round(
            result["total_amount"],
            2
        )

        if abs(
            expected - actual
        ) > 0.02:

            warnings.append(
                "Subtotal + tax does not match "
                "the extracted total"
            )

            review_reasons.append(
                "extracted financial values require verification"
            )

    # --------------------------------------------------------
    # Confidence checks
    # --------------------------------------------------------

    field_conf = result.get(
        "field_confidence",
        {}
    )

    for field in [
        "vendor",
        "invoice_number",
        "date",
        "total_amount",
    ]:

        value = field_conf.get(
            field
        )

        if (
            value is not None
            and value < 0.50
            and getattr(
                result,
                "get",
                lambda x: None
            )
        ):

            # We do not need to add duplicate warnings here.
            pass

    # --------------------------------------------------------
    # Review status
    # --------------------------------------------------------

    result["validation_warnings"] = list(
        dict.fromkeys(
            warnings
        )
    )

    if review_reasons:

        result["requires_review"] = True
        result["needs_manual_review"] = True

        result["manual_review_reason"] = (
            "; ".join(
                dict.fromkeys(
                    review_reasons
                )
            )
        )

    return result


# ============================================================
# IMAGE EXTRACTION
# ============================================================

def _extract_from_image(
    file_path
):
    """
    Send image directly to Gemini Vision.
    """

    image_bytes, mime_type, error = (
        _prepare_image_for_gemini(
            file_path
        )
    )

    if error:

        return (
            get_failed_ocr_response(
                "",
                error
            ),
            "failed"
        )

    data, error = (
        _call_gemini_with_image(
            image_bytes,
            mime_type
        )
    )

    if error:

        return (
            get_failed_ocr_response(
                "",
                error
            ),
            "gemini_vision_failed"
        )

    result = _normalize_gemini_result(
        data,
        ""
    )

    return (
        result,
        "gemini_vision"
    )


# ============================================================
# PDF EXTRACTION
# ============================================================

def _extract_from_pdf(
    file_path
):
    """
    PDF extraction strategy:

    1. Try selectable PDF text.
    2. Send extracted text to Gemini.
    3. If PDF is scanned/image-only, render pages.
    4. Send rendered invoice page images to Gemini.
    """

    # --------------------------------------------------------
    # 1. Try PDF text
    # --------------------------------------------------------

    pdf_text = _extract_pdf_text(
        file_path
    )

    if len(pdf_text.strip()) >= 20:

        data, error = (
            _call_gemini_with_text(
                pdf_text
            )
        )

        if not error and data:

            result = _normalize_gemini_result(
                data,
                pdf_text
            )

            return (
                result,
                "gemini_pdf_text"
            )

    # --------------------------------------------------------
    # 2. Scanned PDF
    # --------------------------------------------------------

    images, error = (
        _convert_pdf_to_images(
            file_path
        )
    )

    if not images:

        reason = (
            error
            or "Could not extract or render PDF"
        )

        return (
            get_failed_ocr_response(
                pdf_text,
                reason
            ),
            "failed"
        )

    page_results = []

    for index, image in enumerate(
        images
    ):

        image_bytes, conversion_error = (
            _pil_image_to_bytes(
                image
            )
        )

        if conversion_error:

            continue

        data, api_error = (
            _call_gemini_with_image(
                image_bytes,
                "image/jpeg"
            )
        )

        if api_error:

            continue

        if data:

            page_results.append(
                data
            )

    if not page_results:

        return (
            get_failed_ocr_response(
                pdf_text,
                "Gemini could not extract information from the PDF"
            ),
            "gemini_pdf_failed"
        )

    # --------------------------------------------------------
    # If there is only one page, use it directly.
    # --------------------------------------------------------

    if len(page_results) == 1:

        result = _normalize_gemini_result(
            page_results[0],
            pdf_text
        )

        return (
            result,
            "gemini_pdf_vision"
        )

    # --------------------------------------------------------
    # Multiple pages:
    # Combine page data without inventing values.
    # --------------------------------------------------------

    combined = _empty_result()

    combined["raw_text"] = (
        pdf_text[:5000]
        if pdf_text
        else ""
    )

    for page_data in page_results:

        normalized = _normalize_gemini_result(
            page_data,
            pdf_text
        )

        # Fill missing fields only.
        # Never overwrite a field already extracted.

        for field in [
            "vendor",
            "invoice_number",
            "date",
            "due_date",
            "subtotal",
            "tax",
            "total_amount",
            "currency",
        ]:

            if (
                combined.get(field) is None
                and normalized.get(field) is not None
            ):

                combined[field] = (
                    normalized[field]
                )

        # Line items can exist on different pages.
        combined["line_items"].extend(
            normalized.get(
                "line_items",
                []
            )
        )

        # Preserve category if available.
        if (
            combined["ai_category"]
            == "Uncategorized"
            and normalized.get("ai_category")
        ):

            combined["ai_category"] = (
                normalized["ai_category"]
            )

        # Keep highest confidence.
        combined["ai_confidence"] = max(
            float(
                combined.get(
                    "ai_confidence",
                    0
                )
            ),
            float(
                normalized.get(
                    "ai_confidence",
                    0
                )
            )
        )

        combined["validation_warnings"].extend(
            normalized.get(
                "validation_warnings",
                []
            )
        )

    # --------------------------------------------------------
    # Re-run validation on combined result.
    # --------------------------------------------------------

    review_reasons = []

    if not combined["vendor"]:

        review_reasons.append(
            "vendor name could not be identified"
        )

    if not combined["invoice_number"]:

        review_reasons.append(
            "invoice number could not be identified"
        )

    if not combined["date"]:

        review_reasons.append(
            "invoice date could not be identified"
        )

    if combined["total_amount"] is None:

        review_reasons.append(
            "total amount could not be identified"
        )

    combined["validation_warnings"] = list(
        dict.fromkeys(
            combined["validation_warnings"]
        )
    )

    if review_reasons:

        combined["requires_review"] = True
        combined["needs_manual_review"] = True

        combined["manual_review_reason"] = (
            "; ".join(
                review_reasons
            )
        )

    return (
        combined,
        "gemini_pdf_vision"
    )


# ============================================================
# RAW TEXT EXTRACTION
# ============================================================

def extract_text_from_file(
    file_path,
    filename=""
):
    """
    Compatibility helper.

    This function now provides basic document text where
    possible. The actual invoice extraction uses Gemini Vision
    directly through extract_invoice_data_from_file().

    Returns:
        (text, method)
    """

    if not os.path.exists(
        file_path
    ):

        return (
            "",
            "failed"
        )

    ext = os.path.splitext(
        filename or file_path
    )[1].lower().lstrip(".")

    # --------------------------------------------------------
    # PDF
    # --------------------------------------------------------

    if ext == "pdf":

        text = _extract_pdf_text(
            file_path
        )

        if text:

            return (
                text,
                "pdf_text"
            )

        return (
            "",
            "pdf_image"
        )

    # --------------------------------------------------------
    # Images
    # --------------------------------------------------------

    if ext in SUPPORTED_IMAGE_EXTENSIONS:

        # We intentionally don't use Tesseract here.
        #
        # Gemini is responsible for vision extraction.
        return (
            "",
            "gemini_vision"
        )

    return (
        "",
        "failed"
    )


# ============================================================
# MAIN OCR FUNCTION
# ============================================================

def extract_invoice_data_from_file(
    file_path,
    filename=""
):
    """
    Main function used by invoices.py.

    Returns:

        (
            extracted_data,
            extraction_method
        )

    extraction methods include:

        gemini_vision
        gemini_pdf_text
        gemini_pdf_vision
        failed
    """

    if not os.path.exists(
        file_path
    ):

        return (
            get_failed_ocr_response(
                "",
                "Uploaded file does not exist"
            ),
            "failed"
        )

    ext = os.path.splitext(
        filename or file_path
    )[1].lower().lstrip(".")

    if ext not in SUPPORTED_EXTENSIONS:

        return (
            get_failed_ocr_response(
                "",
                f"Unsupported file type: .{ext}"
            ),
            "failed"
        )

    # --------------------------------------------------------
    # IMAGE
    # --------------------------------------------------------

    if ext in SUPPORTED_IMAGE_EXTENSIONS:

        return _extract_from_image(
            file_path
        )

    # --------------------------------------------------------
    # PDF
    # --------------------------------------------------------

    if ext == "pdf":

        return _extract_from_pdf(
            file_path
        )

    return (
        get_failed_ocr_response(
            "",
            "Unsupported document format"
        ),
        "failed"
    )


# ============================================================
# DIRECT OCR ROUTE
# ============================================================

@ocr_bp.route(
    "/extract",
    methods=["POST"]
)
def process_ocr_route():
    """
    OCR-only endpoint.

    It does NOT save the invoice to MySQL.

    Request:
        multipart/form-data
        file=<invoice>

    Response:
        extracted_data
        extraction_method
    """

    if "file" not in request.files:

        return jsonify({
            "error": "No file uploaded"
        }), 400

    file = request.files["file"]

    if not file.filename:

        return jsonify({
            "error": "No file selected"
        }), 400

    filename = file.filename

    ext = os.path.splitext(
        filename
    )[1].lower().lstrip(".")

    if ext not in SUPPORTED_EXTENSIONS:

        return jsonify({
            "error": (
                "Unsupported file type. "
                "Allowed: PDF, PNG, JPG, JPEG, "
                "TIFF, BMP, WEBP"
            )
        }), 400

    import tempfile

    temp_path = None

    try:

        with tempfile.NamedTemporaryFile(
            suffix=f".{ext}",
            delete=False
        ) as tmp:

            file.save(
                tmp.name
            )

            temp_path = tmp.name

        extracted, method = (
            extract_invoice_data_from_file(
                temp_path,
                filename
            )
        )

        status_code = (
            200
            if method != "failed"
            else 422
        )

        return jsonify({
            "extracted_data": extracted,
            "extraction_method": method
        }), status_code

    except Exception as exc:

        return jsonify({
            "error": "OCR processing failed",
            "details": str(exc)
        }), 500

    finally:

        if (
            temp_path
            and os.path.exists(
                temp_path
            )
        ):

            try:

                os.remove(
                    temp_path
                )

            except Exception:
                pass