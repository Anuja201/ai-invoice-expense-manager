"""Create a sample PDF invoice for OCR testing"""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import os

pdf_path = "uploads/sample_invoice.pdf"

# Create PDF
c = canvas.Canvas(pdf_path, pagesize=letter)
width, height = letter

# Header
c.setFont("Helvetica-Bold", 20)
c.drawString(50, height - 50, "INVOICE")

c.setFont("Helvetica", 12)
c.drawString(50, height - 80, "Invoice #: INV-2025-1234")
c.drawString(50, height - 100, "Date: 2025-01-15")
c.drawString(50, height - 120, "Due Date: 2025-02-15")

# Vendor
c.setFont("Helvetica-Bold", 14)
c.drawString(50, height - 160, "TechSoft Solutions Pvt Ltd")
c.setFont("Helvetica", 12)
c.drawString(50, height - 180, "123 Tech Park, Bangalore")

# Line items
c.drawString(50, height - 220, "Description")
c.drawString(300, height - 220, "Amount")

c.drawString(50, height - 240, "Software Development Services")
c.drawString(300, height - 240, "₹5,000.00")

c.drawString(50, height - 260, "Subtotal")
c.drawString(300, height - 260, "₹5,000.00")

c.drawString(50, height - 280, "Tax (18%)")
c.drawString(300, height - 280, "₹900.00")

c.setFont("Helvetica-Bold", 12)
c.drawString(50, height - 310, "Total Amount")
c.drawString(300, height - 310, "₹5,900.00")

c.save()
print(f"Created: {pdf_path}")

