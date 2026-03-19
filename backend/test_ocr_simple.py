"""
Simple test to verify OCR extraction
Run: python test_ocr_simple.py
"""
import sys
sys.path.insert(0, '.')

from routes.ocr import extract_invoice_data_from_file, parse_invoice_text

# Test with sample text
sample_text = """
INVOICE #12345
Date: 15/01/2025
Due Date: 15/02/2025

Tech Solutions Inc
123 Tech Street
Bangalore - 560001

Description          Amount
Software Services    ₹ 50,000
Tax (18%)            ₹ 9,000
                     --------
Total Due            ₹ 59,000
"""

print("=" * 50)
print("Testing OCR parsing...")
print("=" * 50)

result = parse_invoice_text(sample_text)
print(f"\nParsed Result:")
print(f"  Vendor: {result.get('vendor')}")
print(f"  Invoice #: {result.get('invoice_number')}")
print(f"  Date: {result.get('date')}")
print(f"  Due Date: {result.get('due_date')}")
print(f"  Subtotal: {result.get('subtotal')}")
print(f"  Tax: {result.get('tax')}")
print(f"  Total: {result.get('total_amount')}")

print("\n" + "=" * 50)
print("Testing AI categorization...")
print("=" * 50)

from utils.ai_categorizer import categorize
vendor = result.get('vendor', '')
ai_result = categorize(vendor)
print(f"  Category: {ai_result.get('category')}")
print(f"  Confidence: {ai_result.get('confidence')}%")

print("\n✓ Test completed!")
