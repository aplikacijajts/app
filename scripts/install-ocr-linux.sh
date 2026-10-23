#!/usr/bin/env bash
set -euo pipefail

echo "Installing OCR dependencies for JTS Doc Intake..."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y poppler-utils tesseract-ocr
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y poppler-utils tesseract
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y poppler-utils tesseract
else
  echo "Unsupported package manager. Install Poppler (pdftotext/pdftoppm) and Tesseract manually."
  exit 1
fi

echo "Checking tools..."
pdftotext -v || true
pdftoppm -v || true
tesseract --version || true

echo "Done. Restart node server.js and check http://localhost:4000/health"
