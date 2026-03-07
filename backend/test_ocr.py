"""Test OCR extraction demonstration"""
import sys
sys.path.insert(0, '.')

from routes.ocr import simulate_ocr_extraction, parse_invoice_text

# Test 1: Simulated OCR result
print("=" * 60)
print("1. SIMULATED OCR EXTRACTION (when no real OCR available)")
print("=" * 60)
result = simulate_ocr_extraction('sample_invoice.pdf')
print(f"""
Extracted Data:
  - Vendor: {result['vendor']}
  - Invoice Number: {result['invoice_number']}
  - Date: {result['date']}
  - Due Date: {result['due_date']}
  - Subtotal: ₹{result['subtotal']}
  - Tax: ₹{result['tax']}
  - Total Amount: ₹{result['total_amount']}
  - AI Category: {result['ai_category']}
  - AI Confidence: {result['ai_confidence']}%
  - Extraction Method: {result['extraction_method']}
""")

# Test 2: Parse sample invoice text
print("=" * 60)
print("2. PARSED INVOICE TEXT (text parsing)")
print("=" * 60)
sample_text = """
INVOICE #INV-2025-1234
Date: 2025-01-15
Due Date: 2025-02-15

Vendor: TechSoft Solutions Pvt Ltd
123 Tech Park, Bangalore

Description: Software Development Services
Quantity: 1
Rate: 5000.00
Subtotal: 5000.00
Tax (18%): 900.00
Total Amount: 5900.00
"""
parsed = parse_invoice_text(sample_text)
print(f"""
Parsed Data:
  - Vendor: {parsed['vendor']}
  - Invoice Number: {parsed['invoice_number']}
  - Date: {parsed['date']}
  - Due Date: {parsed['due_date']}
  - Subtotal: ₹{parsed['subtotal']}
  - Tax: ₹{parsed['tax']}
  - Total Amount: ₹{parsed['total_amount']}
""")

# Test 3: AI Categorization
print("=" * 60)
print("3. AI CATEGORIZATION TEST")
print("=" * 60)
from utils.ai_categorizer import categorize

test_texts = [
    "AWS Monthly Bill - Cloud hosting services",
    "Uber ride to airport",
    "Zomato food delivery lunch",
    "Netflix subscription monthly",
    "Consulting services for project"
]

for text in test_texts:
    result = categorize(text)
    print(f"  '{text}' -> {result['category']} ({result['confidence']}%)")

print("\n" + "=" * 60)
print("OCR EXTRACTION COMPLETE!")
print("=" * 60)

