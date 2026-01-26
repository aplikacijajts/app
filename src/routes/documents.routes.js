import express from "express";
import path from "path";
import fs from "fs/promises";

import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { upload } from "../services/upload.js";
import { uid } from "../utils/id.js";
import { safeToken, dateStamp, extFromOriginal } from "../utils/filename.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

// GET /api/documents/my?status=submitted
router.get("/my", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const docs = await readJson("documents.json");
  const status = req.query.status;

  let mine = docs.filter(d => d.driverId === req.user.sub);
  if (status) mine = mine.filter(d => d.status === status);

  mine.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(mine);
});

// POST /api/documents/upload  (multipart/form-data: file, category, loadId?, note?)
router.post(
  "/upload",
  requireRole("driver", "dispatcher", "admin"),
  upload.single("file"),
  async (req, res) => {
    const { loadId, category, note } = req.body || {};
    if (!category) return res.status(400).json({ error: "Missing category" });
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const now = new Date();
    const cat = safeToken(category).toUpperCase() || "DOC";
    const ds = dateStamp(now);

    // Determine load part (Load<loadNumber> or Load<loadId> or Personal)
    let loadPart = "Personal";
    if (loadId) {
      const loads = await readJson("loads.json");
      const load = loads.find(l => l.id === loadId);
      if (load?.loadNumber) loadPart = `Load${safeToken(load.loadNumber)}`;
      else loadPart = `Load${safeToken(loadId)}`;
    }

    // Rename file to deterministic pattern
    const ext = extFromOriginal(req.file.originalname) || "";
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const finalName = `${cat}_${loadPart}_${ds}_${unique}${ext}`;

    const oldAbs = req.file.path; // absolute path from multer
    const dir = path.dirname(oldAbs);
    const newAbs = path.join(dir, finalName);
    await fs.rename(oldAbs, newAbs);

    // Store relative path (used internally; NOT public)
    const relPath = "/" + path.relative(path.resolve(), newAbs).replaceAll("\\", "/");

    // Versioning/grouping: same driver + category + loadId => versions
    const docs = await readJson("documents.json");
    const same = docs
      .filter(d =>
        d.driverId === req.user.sub &&
        (d.category || "").toUpperCase() === cat &&
        (d.loadId || null) === (loadId || null)
      )
      .sort((a,b) => (b.version || 1) - (a.version || 1))[0];

    const groupId = same?.groupId || uid("grp");
    const nextVersion = same ? ((same.version || 1) + 1) : 1;

    const doc = {
      id: uid("doc"),
      groupId,
      version: nextVersion,

      driverId: req.user.sub,
      loadId: loadId || null,
      category: cat,
      note: note || null,

      filePath: relPath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,

      status: "submitted",
      comments: [],
      createdAt: now.toISOString()
    };

    await updateJson("documents.json", (arr) => {
      // mark previous needs_fix as superseded (optional)
      if (same && same.status === "needs_fix") {
        const prev = arr.find(x => x.id === same.id);
        if (prev) prev.supersededBy = doc.id;
      }
      arr.push(doc);
      return arr;
    });

    await audit("document_uploaded", { docId: doc.id, category: cat, loadId: loadId || null, version: nextVersion });

    // Notify dispatchers/admins about new document
    await notify.roles(["dispatcher", "admin"], {
      type: "document_uploaded",
      title: "New Document Uploaded",
      message: `${req.user.name || "A driver"} uploaded ${cat}${loadId ? ` for load ${loadPart.replace("Load","")}` : ""}`,
      data: { docId: doc.id, loadId: loadId || null, category: cat }
    });

    res.json({
      ok: true,
      doc,
      url: `/api/documents/${doc.id}/file`
    });
  }
);

// Dispatcher/Admin inbox: GET /api/documents?status=submitted
router.get("/", requireRole("dispatcher", "admin"), async (req, res) => {
  const docs = await readJson("documents.json");
  const status = req.query.status;
  const out = status ? docs.filter(d => d.status === status) : docs;
  out.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(out);
});

// GET /api/documents/:id  (metadata)
router.get("/:id", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const docs = await readJson("documents.json");
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const isOwner = doc.driverId === req.user.sub;
  const isPrivileged = ["dispatcher", "admin"].includes(req.user.role);
  if (!isOwner && !isPrivileged) return res.status(403).json({ error: "Forbidden" });

  res.json(doc);
});

// POST /api/documents/:id/approve
router.post("/:id/approve", requireRole("dispatcher", "admin"), async (req, res) => {
  const id = req.params.id;

  let found = false;
  await updateJson("documents.json", (arr) => {
    const d = arr.find(x => x.id === id);
    if (!d) return arr;
    found = true;
    d.status = "approved";
    d.approvedAt = new Date().toISOString();
    d.approvedBy = req.user.sub;
    return arr;
  });

  if (!found) return res.status(404).json({ error: "Not found" });

  await audit("document_approved", { docId: id });

  // Notify owner
  const docs = await readJson("documents.json");
  const doc = docs.find(d => d.id === id);
  if (doc) {
    await notify.users([doc.driverId], {
      type: "document_approved",
      title: "Document Approved",
      message: `${doc.category || "Document"} was approved.`,
      data: { docId: id, loadId: doc.loadId || null }
    });
  }
  res.json({ ok: true });
});

// POST /api/documents/:id/needs-fix  body: {comment}
router.post("/:id/needs-fix", requireRole("dispatcher", "admin"), async (req, res) => {
  const id = req.params.id;
  const { comment } = req.body || {};

  let found = false;
  await updateJson("documents.json", (arr) => {
    const d = arr.find(x => x.id === id);
    if (!d) return arr;
    found = true;
    d.status = "needs_fix";
    d.comments = d.comments || [];
    d.comments.push({
      by: req.user.sub,
      text: comment || "Needs fix",
      at: new Date().toISOString()
    });
    return arr;
  });

  if (!found) return res.status(404).json({ error: "Not found" });

  await audit("document_needs_fix", { docId: id });

  // Notify owner
  const docs = await readJson("documents.json");
  const doc = docs.find(d => d.id === id);
  if (doc) {
    await notify.users([doc.driverId], {
      type: "document_needs_fix",
      title: "Document Needs Fix",
      message: `${doc.category || "Document"} needs fixes.`,
      data: { docId: id, loadId: doc.loadId || null }
    });
  }
  res.json({ ok: true });
});



// Secure file preview/download (checks permissions)
// GET /api/documents/:id/file?token=...&dl=1
router.get("/:id/file", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const docs = await readJson("documents.json");
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (!doc.filePath) return res.status(404).json({ error: "File missing" });

  const isOwner = doc.driverId === req.user.sub;
  const isPrivileged = ["dispatcher", "admin"].includes(req.user.role);
  if (!isOwner && !isPrivileged) return res.status(403).json({ error: "Forbidden" });

  const abs = path.resolve("." + doc.filePath);
  const uploadsRoot = path.resolve("./uploads");
  if (!abs.startsWith(uploadsRoot)) return res.status(400).json({ error: "Invalid file path" });

  const mime = doc.mimeType || "application/octet-stream";
  res.setHeader("Content-Type", mime);

  const wantDownload = String(req.query.dl || "") === "1";
  const fname = (doc.originalName || "document").replace(/"/g, "");
  res.setHeader("Content-Disposition", `${wantDownload ? "attachment" : "inline"}; filename="${fname}"`);

  return res.sendFile(abs);
});

export default router;
