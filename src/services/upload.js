import multer from "multer";
import fs from "fs";
import path from "path";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dir = path.resolve("uploads", "documents", yyyy, mm);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeOriginal = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    cb(null, `${unique}__${safeOriginal}`); // temp name; we'll rename after upload
  }
});

function fileFilter(req, file, cb) {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Unsupported file type. Allowed: PDF/JPG/PNG/WEBP"));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});
