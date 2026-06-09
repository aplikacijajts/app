import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { audit } from "../services/audit.js";
import { buildConfirmationPdf } from "../services/pdf.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin", "dispatcher"));

const FIELD_LIMITS = {
  confirmationNumber: 80,
  confirmationDate: 40,
  loadNumber: 90,
  customer: 180,
  brokerName: 180,
  contactName: 120,
  contactPhone: 60,
  contactEmail: 160,
  pickup: 220,
  delivery: 220,
  driverName: 160,
  truckNumber: 90,
  trailerNumber: 90,
  rate: 60,
  commodity: 140,
  weight: 80,
  pickupDate: 80,
  deliveryDate: 80,
  notes: 1400,
  instructions: 1400
};

function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
}

function cleanPayload(body = {}) {
  const out = {};
  for (const [key, max] of Object.entries(FIELD_LIMITS)) out[key] = clean(body[key], max);
  return out;
}

function visibleForUser(row, user) {
  if (!row) return false;
  if (user.role === "admin") return true;
  return row.createdBy === user.sub || row.dispatcherId === user.sub;
}

router.get("/", async (req, res) => {
  const rows = await readJson("confirmations.json");
  const visible = rows.filter(r => visibleForUser(r, req.user)).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json(visible.slice(0, 100));
});

router.post("/", async (req, res) => {
  const data = cleanPayload(req.body || {});
  if (!data.loadNumber && !data.customer && !data.pickup && !data.delivery) {
    return res.status(400).json({ error: "Enter at least load number, customer, pickup or delivery." });
  }
  const now = new Date().toISOString();
  const row = {
    id: uid("conf"),
    ...data,
    confirmationNumber: data.confirmationNumber || `JTS-${Date.now()}`,
    createdBy: req.user.sub,
    dispatcherId: req.user.role === "dispatcher" ? req.user.sub : null,
    role: req.user.role,
    companyId: req.user.companyId || "jts-logistics",
    createdAt: now,
    updatedAt: now
  };
  await updateJson("confirmations.json", arr => (arr.push(row), arr));
  await audit("confirmation_created", { confirmationId: row.id, loadNumber: row.loadNumber, by: req.user.sub });
  res.json({ ok: true, confirmation: row });
});

router.get("/:id", async (req, res) => {
  const rows = await readJson("confirmations.json");
  const row = rows.find(r => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Confirmation not found" });
  if (!visibleForUser(row, req.user)) return res.status(403).json({ error: "Forbidden" });
  res.json({ ok: true, confirmation: row });
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const rows = await readJson("confirmations.json");
    const row = rows.find(r => r.id === req.params.id);
    if (!row) return res.status(404).json({ error: "Confirmation not found" });
    if (!visibleForUser(row, req.user)) return res.status(403).json({ error: "Forbidden" });
    const pdf = await buildConfirmationPdf(row, { logoPath: "public/assets/jts-logo-pdf.jpg" });
    const safeNo = String(row.confirmationNumber || row.id).replace(/[^a-z0-9_-]+/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="JTS-confirmation-${safeNo}.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

export default router;
