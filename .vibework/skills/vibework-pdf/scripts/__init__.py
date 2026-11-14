"""VibeworkPDF - Opinionated PDF manipulation toolkit.

This package provides utilities for:
- PDF analysis and text/table extraction
- Form filling (fillable fields and annotations)
- Merging and splitting PDFs
- Converting to images and creating thumbnails

Usage:
    from scripts.core import PDF, mergePdfs, splitPdf, extractPdfInfo

    # Load a PDF
    pdf = PDF.fromFile("document.pdf")
    print(f"Pages: {pdf.pageCount}")

    # Extract text
    text = pdf.extractText()

    # Check for forms
    if pdf.hasFillableFields():
        print("Has fillable form fields")

    # Convert to images
    pdf.toImages("./images/")
"""

from .core import PDF, mergePdfs, splitPdf, extractPdfInfo

__all__ = ["PDF", "mergePdfs", "splitPdf", "extractPdfInfo"]
