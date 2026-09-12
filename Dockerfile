# JTS Logistics TMS - production Docker image for Render
# Installs Poppler (pdftotext/pdftoppm) and Tesseract OCR so that
# Document Intake can auto-fill data from both text-based and
# scanned/image rate confirmations and dispatch documents.

FROM node:20-slim

# System packages required for PDF text extraction (Poppler) and
# OCR fallback for scanned/image PDFs (Tesseract).
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       poppler-utils \
       tesseract-ocr \
       tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Reduce npm network flakiness/noise during Docker builds.
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_ENV=production

# Install dependencies first so this layer is cached unless
# package.json / package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the rest of the application source.
COPY . .

# Verify the app's JavaScript is syntactically valid at build time,
# so a broken deploy fails fast in the build step instead of at runtime.
RUN node --check server.js \
    && node --check public/js/app.js \
    && node --check public/sw.js

# Render injects the PORT environment variable at runtime; server.js
# already reads process.env.PORT (falling back to 4000 locally).
EXPOSE 4000

CMD ["node", "server.js"]
