"""
test_save_invoice.py

Test script to verify invoice creation endpoint POST /api/invoices/
and ensure that edge cases (empty dates, duplicates, line items) save cleanly.
"""

import sys
import json
import logging

from app import create_app
# pyrefly: ignore [missing-import]
from flask_jwt_extended import create_access_token

app = create_app()

def test_invoice_saving():
    with app.test_client() as client:
        with app.app_context():
            token = create_access_token(identity="1")
            headers = {"Authorization": f"Bearer {token}"}

        print("\n--- Test Case 1: Saving Invoice with Empty due_date ---")
        payload1 = {
            "client_name": "Acme Corp",
            "amount": 1000.0,
            "tax": 180.0,
            "total_amount": 1180.0,
            "invoice_number": "INV-TEST-001",
            "due_date": "",
            "status": "unpaid",
            "items": [
                {"description": "Consulting", "quantity": 1, "unit_price": 1000.0, "total": 1000.0}
            ]
        }
        res1 = client.post("/api/invoices/", json=payload1, headers=headers)
        print("Status Code:", res1.status_code)
        print("Response:", res1.json)
        assert res1.status_code == 201, f"Failed to save invoice with empty due_date: {res1.json}"

        print("\n--- Test Case 2: Saving Invoice with Duplicate invoice_number ---")
        res2 = client.post("/api/invoices/", json=payload1, headers=headers)
        print("Status Code:", res2.status_code)
        print("Response:", res2.json)
        assert res2.status_code == 201, f"Failed to handle duplicate invoice_number: {res2.json}"

        print("\n--- Test Case 3: Saving Invoice with 'Not detected' Date ---")
        payload3 = {
            "vendor_name": "Beta Logistics",
            "amount": 500.0,
            "tax_amount": 50.0,
            "total_amount": 550.0,
            "due_date": "Not detected",
            "status": "Paid",
            "items": []
        }
        res3 = client.post("/api/invoices/", json=payload3, headers=headers)
        print("Status Code:", res3.status_code)
        print("Response:", res3.json)
        print("\n--- Test Case 4: Saving Invoice with String Numbers and Currency Symbols ---")
        payload4 = {
            "vendor": "Gamma Global",
            "amount": "$1,200.50",
            "tax_amount": "216.09",
            "total_amount": "1416.59",
            "status": "unpaid",
            "items": [
                {"description": "Server hosting", "quantity": "2", "unit_price": "$600.25", "total": "$1200.50"}
            ]
        }
        res4 = client.post("/api/invoices/", json=payload4, headers=headers)
        print("Status Code:", res4.status_code)
        print("Response:", res4.json)
        assert res4.status_code == 201, f"Failed to save invoice with string numbers: {res4.json}"

        print("\n--- Test Case 5: Saving Invoice with empty items and customer fallback ---")
        payload5 = {
            "client_name": "Delta Solutions",
            "amount": 0,
            "tax": 50,
            "total_amount": 550,
            "status": "draft",
            "items": []
        }
        res5 = client.post("/api/invoices/", json=payload5, headers=headers)
        print("Status Code:", res5.status_code)
        print("Response:", res5.json)
        assert res5.status_code == 201, f"Failed to save invoice with empty items: {res5.json}"

        print("\n[ALL INVOICE SAVING TESTS PASSED SUCCESSFULLY!]")

if __name__ == "__main__":
    try:
        test_invoice_saving()
    except Exception as e:
        print("TEST FAILED:", e)
        sys.exit(1)
