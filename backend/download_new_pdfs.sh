#!/bin/bash

# Download New PDFs from OneDrive
echo ""
echo "📥 Download New PDFs from OneDrive"
echo "==================================="
echo ""

# OneDrive shared folder link
ONEDRIVE_LINK="https://1drv.ms/f/c/613dd27101141ec1/EhOahKqtqcVNvx8b5GSOFzkBd1ngJR3DWIWi6wi-AJoztg?e=qJq9P4"

echo "OneDrive folder: $ONEDRIVE_LINK"
echo ""
echo "Since OneDrive shared links can't be directly synced via command line,"
echo "here are your options to download new PDFs:"
echo ""
echo "OPTION 1: Manual Download (Recommended)"
echo "  1. Open OneDrive in your browser"
echo "  2. Select all PDF files (or just new ones)"
echo "  3. Click 'Download'"
echo "  4. Move/copy downloaded PDFs to: $(pwd)/data/pdfs/"
echo ""
echo "OPTION 2: OneDrive Desktop App"
echo "  1. Make sure OneDrive Desktop app is installed and synced"
echo "  2. Copy PDFs from your OneDrive folder to: $(pwd)/data/pdfs/"
echo ""
echo "After downloading, run:"
echo "  node verify_new_invoices.js"
echo ""
echo "Then extract new PDFs:"
echo "  node flawless_pdf_extractor.js"
echo ""
echo "Current PDFs in data/pdfs: $(ls -1 data/pdfs/*.pdf 2>/dev/null | wc -l | tr -d ' ')"
echo ""
