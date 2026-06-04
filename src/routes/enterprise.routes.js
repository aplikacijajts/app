import express from "express";
import { readJson, updateJson, writeJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

const clean = (value, max = 180) => String(value ?? "").trim().slice(0, max);
const asMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const nowIso = () => new Date().toISOString();

function assertOps(req, res) {
  if (!["admin", "dispatcher"].includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function publicUser(u = {}) {
  const { passwordHash, ...rest } = u || {};
  return rest;
}

function csv(rows) {
  const safeRows = rows.map(r => { const { passwordHash, ...rest } = r || {}; return rest; });
  const columns = Array.from(safeRows.reduce((set, row) => { Object.keys(row || {}).forEach(k => set.add(k)); return set; }, new Set()));
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(","), ...safeRows.map(row => columns.map(c => esc(row[c])).join(","))].join("\n");
}

function expiringWithin(dateValue, days = 30) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  const diff = d.getTime() - Date.now();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

// Enterprise dashboard with activity, fleet, documents, money and compliance metrics.
router.get("/dashboard", requireRole("admin", "dispatcher"), async (req, res) => {
  const [users, loads, bids, docs, fleet, maintenance, invoices, payments, notifications] = await Promise.all([
    readJson("users.json"), readJson("loads.json"), readJson("bids.json"), readJson("documents.json"),
    readJson("fleet.json"), readJson("maintenance.json"), readJson("invoices.json"), readJson("payments.json"), readJson("notifications.json")
  ]);
  const activeLoads = loads.filter(l => !["closed", "cancelled", "delivered"].includes(String(l.status || "").toLowerCase()));
  const completedLoads = loads.filter(l => ["closed", "delivered"].includes(String(l.status || "").toLowerCase()));
  const submittedBids = bids.filter(b => String(b.status || "submitted") === "submitted");
  const missingDocs = loads.filter(l => {
    const cats = new Set(docs.filter(d => d.loadId === l.id).map(d => String(d.category || "").toUpperCase()));
    return !cats.has("POD") || !cats.has("BOL");
  });
  const unpaidInvoices = invoices.filter(i => !["paid", "void"].includes(String(i.status || "").toLowerCase()));
  const dueMaintenance = maintenance.filter(m => ["open", "scheduled"].includes(String(m.status || "open").toLowerCase()) || expiringWithin(m.dueDate, 30));
  const revenueEstimate = loads.reduce((sum, l) => sum + asMoney(l.rate || l.price || l.amount), 0);
  const paidTotal = payments.reduce((sum, p) => sum + asMoney(p.amount), 0);
  res.json({ ok: true, metrics: {
    users: users.filter(u => u.status === "approved").length,
    drivers: users.filter(u => u.status === "approved" && u.role === "driver").length,
    dispatchers: users.filter(u => u.status === "approved" && u.role === "dispatcher").length,
    activeLoads: activeLoads.length,
    completedLoads: completedLoads.length,
    pendingBids: submittedBids.length,
    missingDocs: missingDocs.length,
    fleetUnits: fleet.length,
    maintenanceDue: dueMaintenance.length,
    unpaidInvoices: unpaidInvoices.length,
    revenueEstimate,
    paidTotal,
    unreadNotifications: notifications.filter(n => !n.readAt && !n.read).length
  }, recent: { loads: loads.slice(-8).reverse(), bids: bids.slice(-8).reverse(), maintenance: dueMaintenance.slice(0, 8) } });
});

// Global search across users, loads, trucks, brokers, bids and invoices.
router.get("/search", requireRole("admin", "dispatcher"), async (req, res) => {
  const q = clean(req.query.q, 100).toLowerCase();
  if (!q) return res.json({ ok: true, results: [] });
  const [users, loads, bids, fleet, invoices, customers] = await Promise.all([
    readJson("users.json"), readJson("loads.json"), readJson("bids.json"), readJson("fleet.json"), readJson("invoices.json"), readJson("customers.json")
  ]);
  const match = (obj) => JSON.stringify(obj || {}).toLowerCase().includes(q);
  const results = [];
  users.filter(match).slice(0, 15).forEach(u => results.push({ type: "user", label: `${u.name || u.email} (${u.role})`, data: publicUser(u) }));
  loads.filter(match).slice(0, 15).forEach(l => results.push({ type: "load", label: `Load ${l.loadNumber || l.id}`, data: l }));
  bids.filter(match).slice(0, 15).forEach(b => results.push({ type: "bid", label: `Bid ${b.route || b.id}`, data: b }));
  fleet.filter(match).slice(0, 15).forEach(f => results.push({ type: "fleet", label: `${f.unitNumber || f.truckNumber || f.id} ${f.type || "unit"}`, data: f }));
  invoices.filter(match).slice(0, 15).forEach(i => results.push({ type: "invoice", label: `Invoice ${i.invoiceNumber || i.id}`, data: i }));
  customers.filter(match).slice(0, 15).forEach(c => results.push({ type: "customer", label: `${c.companyName || c.name || c.id}`, data: c }));
  res.json({ ok: true, results: results.slice(0, 50) });
});

// Fleet management: trucks and trailers.
router.get("/fleet", requireRole("admin", "dispatcher", "broker"), async (req, res) => {
  const rows = await readJson("fleet.json");
  res.json(rows.sort((a,b) => String(a.unitNumber || a.id).localeCompare(String(b.unitNumber || b.id))));
});

router.post("/fleet", requireRole("admin", "dispatcher"), async (req, res) => {
  if (!assertOps(req, res)) return;
  const unitNumber = clean(req.body?.unitNumber || req.body?.truckNumber, 80);
  if (!unitNumber) return res.status(400).json({ error: "Unit/truck number is required" });
  const item = {
    id: uid("fleet"), type: clean(req.body?.type, 40) || "truck", unitNumber,
    vin: clean(req.body?.vin, 80) || null, plateNumber: clean(req.body?.plateNumber, 80) || null,
    trailerNumber: clean(req.body?.trailerNumber, 80) || null, trailerType: clean(req.body?.trailerType, 80) || null,
    driverId: clean(req.body?.driverId, 120) || null, status: clean(req.body?.status, 40) || "active",
    registrationExpiry: clean(req.body?.registrationExpiry, 40) || null,
    insuranceExpiry: clean(req.body?.insuranceExpiry, 40) || null,
    inspectionExpiry: clean(req.body?.inspectionExpiry, 40) || null,
    notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), updatedAt: nowIso(), createdBy: req.user.sub
  };
  await updateJson("fleet.json", arr => (arr.push(item), arr));
  await audit("fleet_unit_created", { unitId: item.id, unitNumber: item.unitNumber, by: req.user.sub });
  res.json({ ok: true, item });
});

router.patch("/fleet/:id", requireRole("admin", "dispatcher"), async (req, res) => {
  let updated = null;
  await updateJson("fleet.json", arr => {
    const item = arr.find(x => x.id === req.params.id);
    if (!item) return arr;
    for (const key of ["type", "unitNumber", "vin", "plateNumber", "trailerNumber", "trailerType", "driverId", "status", "registrationExpiry", "insuranceExpiry", "inspectionExpiry", "notes"]) {
      if (req.body?.[key] !== undefined) item[key] = clean(req.body[key], key === "notes" ? 500 : 120) || null;
    }
    item.updatedAt = nowIso(); updated = item; return arr;
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  await audit("fleet_unit_updated", { unitId: updated.id, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

router.delete("/fleet/:id", requireRole("admin"), async (req, res) => {
  await updateJson("fleet.json", arr => arr.filter(x => x.id !== req.params.id));
  await audit("fleet_unit_deleted", { unitId: req.params.id, by: req.user.sub });
  res.json({ ok: true });
});

// Maintenance and expiration reminders.
router.get("/maintenance", requireRole("admin", "dispatcher"), async (req, res) => {
  const rows = await readJson("maintenance.json");
  res.json(rows.sort((a,b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))));
});

router.post("/maintenance", requireRole("admin", "dispatcher"), async (req, res) => {
  const title = clean(req.body?.title, 160);
  if (!title) return res.status(400).json({ error: "Reminder title is required" });
  const row = { id: uid("mnt"), title, unitId: clean(req.body?.unitId, 120) || null, driverId: clean(req.body?.driverId, 120) || null, category: clean(req.body?.category, 80) || "maintenance", dueDate: clean(req.body?.dueDate, 40) || null, status: clean(req.body?.status, 40) || "open", notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("maintenance.json", arr => (arr.push(row), arr));
  await audit("maintenance_created", { id: row.id, title: row.title, by: req.user.sub });
  res.json({ ok: true, item: row });
});

router.patch("/maintenance/:id", requireRole("admin", "dispatcher"), async (req, res) => {
  let updated = null;
  await updateJson("maintenance.json", arr => { const r = arr.find(x => x.id === req.params.id); if (!r) return arr; for (const k of ["title", "unitId", "driverId", "category", "dueDate", "status", "notes"]) if (req.body?.[k] !== undefined) r[k] = clean(req.body[k], k === "notes" ? 500 : 160) || null; r.updatedAt = nowIso(); updated = r; return arr; });
  if (!updated) return res.status(404).json({ error: "Not found" });
  await audit("maintenance_updated", { id: updated.id, status: updated.status, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

// Driver availability calendar.
router.get("/availability", requireRole("admin", "dispatcher", "driver"), async (req, res) => {
  const rows = await readJson("availability.json");
  let visible = rows;
  if (req.user.role === "driver") visible = rows.filter(r => r.driverId === req.user.sub);
  res.json(visible.sort((a,b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))));
});

router.post("/availability", requireRole("admin", "dispatcher", "driver"), async (req, res) => {
  const driverId = req.user.role === "driver" ? req.user.sub : clean(req.body?.driverId, 120);
  if (!driverId) return res.status(400).json({ error: "Driver is required" });
  const status = clean(req.body?.status, 40) || "available";
  const row = { id: uid("av"), driverId, status, fromDate: clean(req.body?.fromDate, 40) || null, toDate: clean(req.body?.toDate, 40) || null, notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: req.user.sub };
  await updateJson("availability.json", arr => { arr.push(row); return arr; });
  await audit("availability_updated", { driverId, status, by: req.user.sub });
  await notify.roles(["admin", "dispatcher"], { type: "availability", title: "Driver availability updated", message: `Driver availability is now ${status}.`, data: { driverId } });
  res.json({ ok: true, item: row });
});

// Broker / customer profiles.
router.get("/customers", requireRole("admin", "dispatcher", "broker"), async (req, res) => {
  const rows = await readJson("customers.json");
  res.json(rows.sort((a,b) => String(a.companyName || a.name || "").localeCompare(String(b.companyName || b.name || ""))));
});

router.post("/customers", requireRole("admin", "dispatcher", "broker"), async (req, res) => {
  const companyName = clean(req.body?.companyName || req.body?.name, 160);
  if (!companyName) return res.status(400).json({ error: "Company/customer name is required" });
  const row = { id: uid("cust"), type: clean(req.body?.type, 40) || "broker", companyName, contactName: clean(req.body?.contactName, 160) || null, email: clean(req.body?.email, 160) || null, phone: clean(req.body?.phone, 80) || null, mcNumber: clean(req.body?.mcNumber, 80) || null, paymentTerms: clean(req.body?.paymentTerms, 80) || null, rating: clean(req.body?.rating, 40) || null, notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("customers.json", arr => (arr.push(row), arr));
  await audit("customer_created", { customerId: row.id, by: req.user.sub });
  res.json({ ok: true, item: row });
});

// Rate confirmation generator from bid or load.
router.post("/rate-confirmations", requireRole("admin", "dispatcher"), async (req, res) => {
  const [loads, bids, users] = await Promise.all([readJson("loads.json"), readJson("bids.json"), readJson("users.json")]);
  const load = req.body?.loadId ? loads.find(l => l.id === req.body.loadId) : null;
  const bid = req.body?.bidId ? bids.find(b => b.id === req.body.bidId) : null;
  const isManual = !load && !bid;
  const driverId = load?.driverId || bid?.driverId || clean(req.body?.driverId, 120) || null;
  const driver = driverId ? users.find(u => u.id === driverId) : null;
  const brokerName = clean(req.body?.brokerName || bid?.brokerName || load?.customer, 160) || "Broker / Customer";
  const origin = clean(req.body?.origin || bid?.origin || load?.pickup, 180);
  const destination = clean(req.body?.destination || bid?.destination || load?.delivery, 180);
  const rate = asMoney(req.body?.rate || bid?.price || load?.rate);
  const row = { id: uid("rc"), confirmationNumber: `RC-${Date.now()}`, loadId: load?.id || null, bidId: bid?.id || null, brokerName, driverId, driverName: driver?.name || bid?.driverName || null, origin, destination, rate, terms: clean(req.body?.terms, 1000) || "Standard carrier terms apply.", createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("rateConfirmations.json", arr => (arr.push(row), arr));
  await audit("rate_confirmation_created", { id: row.id, by: req.user.sub });
  res.json({ ok: true, item: row, downloadUrl: `/api/enterprise/rate-confirmations/${row.id}.html` });
});

router.get("/rate-confirmations", requireRole("admin", "dispatcher"), async (req, res) => {
  const rows = await readJson("rateConfirmations.json");
  res.json(rows.sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
});

router.get("/rate-confirmations/:id.html", requireRole("admin", "dispatcher"), async (req, res) => {
  const rows = await readJson("rateConfirmations.json");
  const r = rows.find(x => x.id === req.params.id);
  if (!r) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${r.confirmationNumber}</title><style>body{font-family:Arial;margin:40px;color:#111} .box{border:1px solid #ddd;border-radius:14px;padding:22px;margin:16px 0}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}.sig{margin-top:50px;border-top:1px solid #111;width:280px;padding-top:8px}</style></head><body><h1>JTS Logistics Rate Confirmation</h1><p><b>${r.confirmationNumber}</b></p><div class="box"><div class="row"><b>Broker / Customer</b><span>${r.brokerName || ""}</span></div><div class="row"><b>Driver</b><span>${r.driverName || ""}</span></div><div class="row"><b>Route</b><span>${r.origin || ""} → ${r.destination || ""}</span></div><div class="row"><b>Rate</b><span>$${r.rate || 0}</span></div><div class="row"><b>Date</b><span>${r.createdAt || ""}</span></div></div><h3>Terms</h3><p>${r.terms || ""}</p><div class="sig">Authorized signature</div><script>window.print && setTimeout(()=>window.print(),300)</script></body></html>`);
});

// Invoices and payment tracking.
router.get("/invoices", requireRole("admin", "dispatcher"), async (req, res) => {
  const rows = await readJson("invoices.json");
  res.json(rows.sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
});

router.post("/invoices", requireRole("admin", "dispatcher"), async (req, res) => {
  const invoiceNumber = clean(req.body?.invoiceNumber, 80) || `INV-${Date.now()}`;
  const amount = asMoney(req.body?.amount);
  if (amount <= 0) return res.status(400).json({ error: "Valid invoice amount is required" });
  const row = { id: uid("inv"), invoiceNumber, loadId: clean(req.body?.loadId, 120) || null, customerId: clean(req.body?.customerId, 120) || null, customerName: clean(req.body?.customerName, 160) || null, amount, status: clean(req.body?.status, 40) || "unpaid", dueDate: clean(req.body?.dueDate, 40) || null, notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("invoices.json", arr => (arr.push(row), arr));
  await audit("invoice_created", { invoiceId: row.id, amount: row.amount, by: req.user.sub });
  res.json({ ok: true, item: row });
});

router.patch("/invoices/:id", requireRole("admin", "dispatcher"), async (req, res) => {
  let updated = null;
  await updateJson("invoices.json", arr => { const r = arr.find(x => x.id === req.params.id); if (!r) return arr; for (const k of ["invoiceNumber", "loadId", "customerId", "customerName", "status", "dueDate", "notes"]) if (req.body?.[k] !== undefined) r[k] = clean(req.body[k], k === "notes" ? 500 : 160) || null; if (req.body?.amount !== undefined) r.amount = asMoney(req.body.amount); r.updatedAt = nowIso(); updated = r; return arr; });
  if (!updated) return res.status(404).json({ error: "Not found" });
  await audit("invoice_updated", { invoiceId: updated.id, status: updated.status, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

router.get("/payments", requireRole("admin", "dispatcher"), async (req, res) => {
  const rows = await readJson("payments.json");
  res.json(rows.sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
});

router.post("/payments", requireRole("admin", "dispatcher"), async (req, res) => {
  const amount = asMoney(req.body?.amount);
  if (amount <= 0) return res.status(400).json({ error: "Valid payment amount is required" });
  const row = { id: uid("pay"), invoiceId: clean(req.body?.invoiceId, 120) || null, loadId: clean(req.body?.loadId, 120) || null, amount, method: clean(req.body?.method, 80) || "manual", status: clean(req.body?.status, 40) || "paid", paidAt: clean(req.body?.paidAt, 40) || nowIso(), notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("payments.json", arr => (arr.push(row), arr));
  if (row.invoiceId) {
    await updateJson("invoices.json", arr => { const inv = arr.find(i => i.id === row.invoiceId); if (inv) { inv.status = "paid"; inv.paidAt = row.paidAt; inv.updatedAt = nowIso(); } return arr; });
  }
  await audit("payment_recorded", { paymentId: row.id, amount: row.amount, by: req.user.sub });
  res.json({ ok: true, item: row });
});

// Document expiration records for drivers/carriers.
router.get("/compliance-docs", requireRole("admin", "dispatcher", "driver"), async (req, res) => {
  const rows = await readJson("complianceDocs.json");
  const visible = req.user.role === "driver" ? rows.filter(r => r.driverId === req.user.sub) : rows;
  res.json(visible.sort((a,b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999"))));
});

router.post("/compliance-docs", requireRole("admin", "dispatcher", "driver"), async (req, res) => {
  const driverId = req.user.role === "driver" ? req.user.sub : clean(req.body?.driverId, 120);
  const category = clean(req.body?.category, 80);
  if (!driverId || !category) return res.status(400).json({ error: "Driver and document category are required" });
  const row = { id: uid("cdoc"), driverId, category, expiryDate: clean(req.body?.expiryDate, 40) || null, status: clean(req.body?.status, 40) || "active", notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("complianceDocs.json", arr => (arr.push(row), arr));
  await audit("compliance_doc_created", { id: row.id, category, driverId, by: req.user.sub });
  res.json({ ok: true, item: row });
});

// Notification preferences.
router.get("/notification-preferences", requireRole("admin", "dispatcher", "driver", "broker"), async (req, res) => {
  const rows = await readJson("notificationPreferences.json");
  const pref = rows.find(r => r.userId === req.user.sub) || { userId: req.user.sub, push: true, email: false, chat: true, loads: true, bids: true, documents: true };
  res.json({ ok: true, preferences: pref });
});

router.put("/notification-preferences", requireRole("admin", "dispatcher", "driver", "broker"), async (req, res) => {
  const pref = { userId: req.user.sub, push: req.body?.push !== false, email: req.body?.email === true, chat: req.body?.chat !== false, loads: req.body?.loads !== false, bids: req.body?.bids !== false, documents: req.body?.documents !== false, updatedAt: nowIso() };
  await updateJson("notificationPreferences.json", arr => { const idx = arr.findIndex(r => r.userId === req.user.sub); if (idx >= 0) arr[idx] = pref; else arr.push(pref); return arr; });
  res.json({ ok: true, preferences: pref });
});

// Backup/export all operational JSON data.
router.get("/backup", requireRole("admin"), async (req, res) => {
  const tables = ["users", "loads", "bids", "documents", "fleet", "maintenance", "availability", "customers", "invoices", "payments", "rateConfirmations", "complianceDocs", "companies", "profitCalculations", "settlements", "brokerRatings", "audit", "notifications", "assignments"];
  const out = { exportedAt: nowIso(), tables: {} };
  for (const t of tables) out.tables[t] = await readJson(`${t}.json`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="jts-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(out, null, 2));
});

router.get("/export/:table.csv", requireRole("admin", "dispatcher"), async (req, res) => {
  const table = clean(req.params.table, 60);
  const allowed = new Set(["fleet", "maintenance", "availability", "customers", "invoices", "payments", "rateConfirmations", "complianceDocs", "companies", "profitCalculations", "settlements", "brokerRatings"]);
  if (!allowed.has(table)) return res.status(400).json({ error: "Invalid export" });
  const rows = await readJson(`${table}.json`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="jts-${table}.csv"`);
  res.send(csv(rows));
});

// Email notification placeholder: safe to use without SMTP; stores outbound queue.
router.post("/email-test", requireRole("admin"), async (req, res) => {
  const to = clean(req.body?.to, 160);
  const subject = clean(req.body?.subject, 160) || "JTS Logistics notification";
  const body = clean(req.body?.body, 1000) || "Test notification";
  if (!to || !to.includes("@")) return res.status(400).json({ error: "Valid email is required" });
  const row = { id: uid("mail"), to, subject, body, status: process.env.SMTP_HOST ? "queued" : "saved_no_smtp", createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson("emailQueue.json", arr => (arr.push(row), arr));
  await audit("email_notification_saved", { id: row.id, to, by: req.user.sub });
  res.json({ ok: true, item: row, message: process.env.SMTP_HOST ? "Email queued." : "SMTP is not configured, so the email was saved in the queue." });
});


// Premium TMS modules: multi-company, driver matching, fuel/profit, settlements and broker ratings.
function distanceMiles(lat1, lon1, lat2, lon2) {
  const nums = [lat1, lon1, lat2, lon2].map(Number);
  if (nums.some(n => !Number.isFinite(n))) return null;
  const toRad = d => d * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(nums[2] - nums[0]);
  const dLon = toRad(nums[3] - nums[1]);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(nums[0])) * Math.cos(toRad(nums[2])) * Math.sin(dLon/2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
}

function currentAvailability(driverId, availability = []) {
  const mine = availability.filter(a => a.driverId === driverId).sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  return mine[0]?.status || 'unknown';
}

function activeLoadCount(driverId, loads = []) {
  return loads.filter(l => l.driverId === driverId && !['closed','cancelled','delivered','rejected'].includes(String(l.status || '').toLowerCase())).length;
}

function hasComplianceRisk(driverId, docs = []) {
  return docs.some(d => d.driverId === driverId && ['expired','missing','pending'].includes(String(d.status || '').toLowerCase()));
}

function calculateProfit(body = {}) {
  const miles = asMoney(body.miles);
  const rate = asMoney(body.rate || body.revenue);
  const fuelPrice = asMoney(body.fuelPrice || body.fuelPricePerGallon);
  const mpg = asMoney(body.mpg || 6.5) || 6.5;
  const tolls = asMoney(body.tolls);
  const driverPay = asMoney(body.driverPay);
  const otherCosts = asMoney(body.otherCosts);
  const fuelCost = miles > 0 && fuelPrice > 0 && mpg > 0 ? Math.round((miles / mpg) * fuelPrice * 100) / 100 : 0;
  const totalCosts = Math.round((fuelCost + tolls + driverPay + otherCosts) * 100) / 100;
  const profit = Math.round((rate - totalCosts) * 100) / 100;
  const margin = rate > 0 ? Math.round((profit / rate) * 10000) / 100 : 0;
  return { miles, rate, fuelPrice, mpg, tolls, driverPay, otherCosts, fuelCost, totalCosts, profit, margin };
}

router.get('/companies', requireRole('admin'), async (req, res) => {
  const rows = await readJson('companies.json');
  const companies = rows.length ? rows : [{ id: 'jts-logistics', name: 'JTS Logistics', status: 'active', plan: 'enterprise', createdAt: nowIso() }];
  res.json(companies.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))));
});

router.post('/companies', requireRole('admin'), async (req, res) => {
  const name = clean(req.body?.name || req.body?.companyName, 160);
  if (!name) return res.status(400).json({ error: 'Company name is required' });
  const row = { id: clean(req.body?.id, 80) || uid('co'), name, legalName: clean(req.body?.legalName, 180) || null, email: clean(req.body?.email, 160) || null, phone: clean(req.body?.phone, 80) || null, address: clean(req.body?.address, 220) || null, status: clean(req.body?.status, 40) || 'active', plan: clean(req.body?.plan, 60) || 'enterprise', logoUrl: clean(req.body?.logoUrl, 300) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson('companies.json', arr => {
    if (arr.some(c => c.id === row.id)) throw new Error('Company ID already exists');
    arr.push(row); return arr;
  });
  await audit('company_created', { companyId: row.id, name: row.name, by: req.user.sub });
  res.json({ ok: true, item: row });
});

router.patch('/companies/:id', requireRole('admin'), async (req, res) => {
  let updated = null;
  await updateJson('companies.json', arr => {
    const c = arr.find(x => x.id === req.params.id);
    if (!c) return arr;
    for (const k of ['name','legalName','email','phone','address','status','plan','logoUrl']) if (req.body?.[k] !== undefined) c[k] = clean(req.body[k], k === 'address' || k === 'logoUrl' ? 300 : 180) || null;
    c.updatedAt = nowIso(); c.updatedBy = req.user.sub; updated = c; return arr;
  });
  if (!updated) return res.status(404).json({ error: 'Company not found' });
  await audit('company_updated', { companyId: updated.id, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

router.get('/driver-matching', requireRole('admin', 'dispatcher'), async (req, res) => {
  const trailerType = clean(req.query.trailerType, 80).toLowerCase();
  const pickupLat = req.query.pickupLat; const pickupLng = req.query.pickupLng;
  const [users, loads, availability, complianceDocs] = await Promise.all([readJson('users.json'), readJson('loads.json'), readJson('availability.json'), readJson('complianceDocs.json')]);
  let drivers = users.filter(u => u.status === 'approved' && u.role === 'driver');
  if (req.user.role === 'dispatcher') {
    // Dispatchers may see all drivers, but their own assigned drivers get a small matching boost in the score below.
  }
  const assignments = await readJson('assignments.json');
  const assignedToMe = new Set(assignments.filter(a => a.dispatcherId === req.user.sub).flatMap(a => a.driverIds || []));
  const results = drivers.map(d => {
    let score = 60;
    const reasons = [];
    const av = currentAvailability(d.id, availability);
    const active = activeLoadCount(d.id, loads);
    const risk = hasComplianceRisk(d.id, complianceDocs);
    if (av === 'available') { score += 20; reasons.push('available'); }
    if (av === 'busy' || av === 'out_of_service' || av === 'sick_leave' || av === 'vacation') { score -= 25; reasons.push(`availability: ${av}`); }
    if (trailerType && String(d.trailerType || '').toLowerCase() === trailerType) { score += 15; reasons.push('matching trailer'); }
    else if (trailerType) { score -= 8; reasons.push('different trailer'); }
    if (active === 0) { score += 10; reasons.push('no active load'); }
    else { score -= active * 8; reasons.push(`${active} active load(s)`); }
    if (risk) { score -= 12; reasons.push('compliance attention'); }
    if (assignedToMe.has(d.id)) { score += 5; reasons.push('assigned to you'); }
    const lastLat = d.lastLat ?? d.latitude ?? d.lat;
    const lastLng = d.lastLng ?? d.longitude ?? d.lng;
    const distance = distanceMiles(pickupLat, pickupLng, lastLat, lastLng);
    if (distance !== null) {
      if (distance <= 50) score += 15;
      else if (distance <= 150) score += 6;
      else score -= 5;
      reasons.push(`${distance} miles from pickup`);
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { driverId: d.id, name: d.name || d.email, email: d.email, phone: d.phone || null, trailerType: d.trailerType || null, truckNumber: d.truckNumber || null, availability: av, activeLoads: active, complianceRisk: risk, score, reasons, distanceMiles: distance };
  }).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
  res.json({ ok: true, results });
});

router.post('/profit-calculations', requireRole('admin', 'dispatcher'), async (req, res) => {
  const calc = calculateProfit(req.body || {});
  if (calc.rate <= 0) return res.status(400).json({ error: 'Rate/revenue is required' });
  const row = { id: uid('calc'), loadId: clean(req.body?.loadId, 120) || null, origin: clean(req.body?.origin, 180) || null, destination: clean(req.body?.destination, 180) || null, ...calc, notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson('profitCalculations.json', arr => (arr.push(row), arr));
  await audit('profit_calculation_created', { id: row.id, profit: row.profit, by: req.user.sub });
  res.json({ ok: true, item: row });
});

router.get('/profit-calculations', requireRole('admin', 'dispatcher'), async (req, res) => {
  const rows = await readJson('profitCalculations.json');
  res.json(rows.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
});

router.get('/settlements', requireRole('admin', 'dispatcher', 'driver'), async (req, res) => {
  const rows = await readJson('settlements.json');
  const visible = req.user.role === 'driver' ? rows.filter(r => r.driverId === req.user.sub) : rows;
  res.json(visible.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
});

router.post('/settlements', requireRole('admin', 'dispatcher'), async (req, res) => {
  const [loads, users] = await Promise.all([readJson('loads.json'), readJson('users.json')]);
  const load = req.body?.loadId ? loads.find(l => l.id === req.body.loadId) : null;
  const driverId = clean(req.body?.driverId || load?.driverId, 120);
  const driver = users.find(u => u.id === driverId && u.role === 'driver');
  if (!driverId || !driver) return res.status(400).json({ error: 'Valid driver is required' });
  const grossRate = asMoney(req.body?.grossRate || req.body?.rate || load?.rate);
  if (grossRate <= 0) return res.status(400).json({ error: 'Gross rate is required' });
  const driverPercent = asMoney(req.body?.driverPercent);
  const flatPay = asMoney(req.body?.flatPay);
  const deductions = asMoney(req.body?.deductions);
  const bonuses = asMoney(req.body?.bonuses);
  const basePay = flatPay > 0 ? flatPay : (driverPercent > 0 ? Math.round(grossRate * driverPercent) / 100 : grossRate);
  const netPay = Math.round((basePay + bonuses - deductions) * 100) / 100;
  const row = { id: uid('set'), settlementNumber: `SET-${Date.now()}`, loadId: load?.id || clean(req.body?.loadId, 120) || null, loadNumber: load?.loadNumber || clean(req.body?.loadNumber, 80) || null, driverId, driverName: driver.name || driver.email, grossRate, driverPercent, flatPay, deductions, bonuses, netPay, status: clean(req.body?.status, 40) || 'pending', notes: clean(req.body?.notes, 500) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson('settlements.json', arr => (arr.push(row), arr));
  await audit('driver_settlement_created', { id: row.id, driverId, netPay, by: req.user.sub });
  await notify.users([driverId], { type: 'settlement', title: 'Driver settlement created', message: `Settlement ${row.settlementNumber} was created.`, data: { settlementId: row.id, url: '/enterprise.html' } });
  res.json({ ok: true, item: row, downloadUrl: `/api/enterprise/settlements/${row.id}.html` });
});

router.patch('/settlements/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  let updated = null;
  await updateJson('settlements.json', arr => { const r = arr.find(x => x.id === req.params.id); if (!r) return arr; for (const k of ['status','notes']) if (req.body?.[k] !== undefined) r[k] = clean(req.body[k], k === 'notes' ? 500 : 80) || null; r.updatedAt = nowIso(); r.updatedBy = req.user.sub; updated = r; return arr; });
  if (!updated) return res.status(404).json({ error: 'Settlement not found' });
  await audit('driver_settlement_updated', { id: updated.id, status: updated.status, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

router.get('/settlements/:id.html', requireRole('admin', 'dispatcher', 'driver'), async (req, res) => {
  const rows = await readJson('settlements.json');
  const r = rows.find(x => x.id === req.params.id);
  if (!r) return res.status(404).send('Not found');
  if (req.user.role === 'driver' && r.driverId !== req.user.sub) return res.status(403).send('Forbidden');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${r.settlementNumber}</title><style>body{font-family:Arial;margin:40px;color:#111}.box{border:1px solid #ddd;border-radius:14px;padding:22px;margin:16px 0}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}.sig{margin-top:50px;border-top:1px solid #111;width:280px;padding-top:8px}</style></head><body><h1>JTS Logistics Driver Settlement</h1><p><b>${r.settlementNumber}</b></p><div class="box"><div class="row"><b>Driver</b><span>${r.driverName || ''}</span></div><div class="row"><b>Load</b><span>${r.loadNumber || r.loadId || ''}</span></div><div class="row"><b>Gross rate</b><span>$${r.grossRate || 0}</span></div><div class="row"><b>Bonuses</b><span>$${r.bonuses || 0}</span></div><div class="row"><b>Deductions</b><span>$${r.deductions || 0}</span></div><div class="row"><b>Net pay</b><span><b>$${r.netPay || 0}</b></span></div><div class="row"><b>Status</b><span>${r.status || ''}</span></div></div><p>${r.notes || ''}</p><div class="sig">Driver signature</div><script>window.print && setTimeout(()=>window.print(),300)</script></body></html>`);
});

router.get('/broker-ratings', requireRole('admin', 'dispatcher', 'broker'), async (req, res) => {
  const rows = await readJson('brokerRatings.json');
  const visible = req.user.role === 'broker' ? rows.filter(r => r.brokerUserId === req.user.sub || r.email === req.user.email) : rows;
  res.json(visible.sort((a,b) => Number(b.overallScore || 0) - Number(a.overallScore || 0)));
});

router.post('/broker-ratings', requireRole('admin', 'dispatcher'), async (req, res) => {
  const companyName = clean(req.body?.companyName || req.body?.brokerName, 160);
  if (!companyName) return res.status(400).json({ error: 'Broker/company name is required' });
  const paymentSpeed = Math.max(1, Math.min(5, Number(req.body?.paymentSpeed || 3)));
  const communication = Math.max(1, Math.min(5, Number(req.body?.communication || 3)));
  const reliability = Math.max(1, Math.min(5, Number(req.body?.reliability || 3)));
  const rateQuality = Math.max(1, Math.min(5, Number(req.body?.rateQuality || 3)));
  const overallScore = Math.round(((paymentSpeed + communication + reliability + rateQuality) / 4) * 20);
  const row = { id: uid('br'), brokerUserId: clean(req.body?.brokerUserId, 120) || null, companyName, contactName: clean(req.body?.contactName, 160) || null, email: clean(req.body?.email, 160) || null, phone: clean(req.body?.phone, 80) || null, mcNumber: clean(req.body?.mcNumber, 80) || null, paymentSpeed, communication, reliability, rateQuality, overallScore, notes: clean(req.body?.notes, 700) || null, createdAt: nowIso(), createdBy: req.user.sub };
  await updateJson('brokerRatings.json', arr => (arr.push(row), arr));
  await audit('broker_rating_created', { id: row.id, companyName, overallScore, by: req.user.sub });
  res.json({ ok: true, item: row });
});

router.patch('/broker-ratings/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  let updated = null;
  await updateJson('brokerRatings.json', arr => { const r = arr.find(x => x.id === req.params.id); if (!r) return arr; for (const k of ['companyName','contactName','email','phone','mcNumber','notes']) if (req.body?.[k] !== undefined) r[k] = clean(req.body[k], k === 'notes' ? 700 : 160) || null; for (const k of ['paymentSpeed','communication','reliability','rateQuality']) if (req.body?.[k] !== undefined) r[k] = Math.max(1, Math.min(5, Number(req.body[k]) || 3)); r.overallScore = Math.round(((Number(r.paymentSpeed||3)+Number(r.communication||3)+Number(r.reliability||3)+Number(r.rateQuality||3))/4)*20); r.updatedAt = nowIso(); r.updatedBy = req.user.sub; updated = r; return arr; });
  if (!updated) return res.status(404).json({ error: 'Rating not found' });
  await audit('broker_rating_updated', { id: updated.id, overallScore: updated.overallScore, by: req.user.sub });
  res.json({ ok: true, item: updated });
});

export default router;
