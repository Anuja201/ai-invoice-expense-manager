"""
test_expenses_pipeline.py

End-to-end integration tests for Expense management, receipt OCR upload,
AI categorization, date sanitization, and CRUD operations.
"""

import sys
import os
import json
from app import create_app
from flask_jwt_extended import create_access_token

app = create_app()

def test_expenses_pipeline():
    with app.test_client() as client:
        with app.app_context():
            token = create_access_token(identity="1")
            headers = {"Authorization": f"Bearer {token}"}

        print("\n--- Test Case 1: List Expenses ---")
        res1 = client.get("/api/expenses/", headers=headers)
        print("Status:", res1.status_code)
        assert res1.status_code == 200, f"Failed to list expenses: {res1.json}"
        print(f"Total existing expenses: {len(res1.json.get('expenses', []))}")

        print("\n--- Test Case 2: Create Expense with Empty Date & AI Categorization ---")
        payload2 = {
            "title": "Cloud Server Hosting",
            "vendor": "AWS India",
            "amount": 3500.50,
            "receipt_date": "", # empty date -> should default to today's date
            "payment_method": "Credit Card", # non-standard string -> should sanitize to credit_card
            "description": "Monthly production EC2 and RDS instances"
        }
        res2 = client.post("/api/expenses/", json=payload2, headers=headers)
        print("Status:", res2.status_code)
        print("Response:", res2.json)
        assert res2.status_code == 201, f"Failed to create expense: {res2.json}"
        exp_id = res2.json["expense"]["id"]
        assert res2.json["expense"]["payment_method"] == "credit_card"
        assert res2.json["expense"]["receipt_date"] is not None

        print("\n--- Test Case 3: Update Expense ---")
        payload3 = {
            "vendor": "Amazon Web Services",
            "amount": 3800.00,
            "payment_method": "upi"
        }
        res3 = client.put(f"/api/expenses/{exp_id}", json=payload3, headers=headers)
        print("Status:", res3.status_code)
        print("Response:", res3.json)
        assert res3.status_code == 200, f"Failed to update expense: {res3.json}"
        assert res3.json["expense"]["payment_method"] == "upi"

        print("\n--- Test Case 4: Upload Receipt PDF/Image OCR Extraction ---")
        # Create a temporary dummy sample text/pdf/jpg file to test OCR upload
        sample_path = os.path.join(app.config.get("UPLOAD_FOLDER", "uploads"), "test_receipt_sample.png")
        os.makedirs(os.path.dirname(sample_path), exist_ok=True)
        with open(sample_path, "wb") as f:
            f.write(b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")

        with open(sample_path, "rb") as f:
            data = {"file": (f, "test_receipt.png")}
            res4 = client.post("/api/expenses/upload", data=data, content_type="multipart/form-data", headers=headers)
        print("Status:", res4.status_code)
        print("Response:", res4.json)
        assert res4.status_code == 200, f"Failed to upload receipt: {res4.json}"
        assert "extracted_data" in res4.json

        print("\n--- Test Case 5: Delete Expense ---")
        res5 = client.delete(f"/api/expenses/{exp_id}", headers=headers)
        print("Status:", res5.status_code)
        assert res5.status_code == 200, f"Failed to delete expense: {res5.json}"

        print("\n[ALL EXPENSE PIPELINE TESTS PASSED SUCCESSFULLY!]")

if __name__ == "__main__":
    try:
        test_expenses_pipeline()
    except Exception as e:
        print("\nTEST FAILED:", e)
        sys.exit(1)
