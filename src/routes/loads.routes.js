import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { notify } from "../services/notify.js";
import { audit } from "../services/audit.js";
import { canAccessDriver, filterLoadsForUser, getDispatcherIdsForDriver, isDriverAssignedToDispatcher } from "../services/access.js";

const router = express.Router();
router.use(requireAuth);

const requiredDocs = ["POD", "BOL"];

function statusLabel(status) {
  return String(status || "").replaceAll("_", " ").trim() || "updated";
}

function addHistory(load, status, byUserId = null, note = null) {
  load.statusHistory = Array.isArray(load.statusHistory) ? load.statusHistory : [];
  load.statusHistory.push({
    status,
    byUserId,
    note: note || null,
    at: new Date().toISOString()
  });
}


function enrichLoad(load, docs) {
  const loadDocs = docs.filter(d => d.loadId === load.id);
  const latest = {};
  for (const d of loadDocs) {
    const key = String(d.category || "").toUpperCase();
    if (!key) continue;
    if (!latest[key] || (d.version || 1) > (latest[key].version || 1)) latest[key] = d;
  }
  const docsSummary = {};
  for (const cat of requiredDocs) docsSummary[cat] = latest[cat] ? (latest[cat].status || "submitted") : "none";
  const missingDocs = requiredDocs.filter(c => docsSummary[c] === "none");
  return { ...load, requiredDocs, docsSummary, missingDocs, missingCount: missingDocs.length };
}

router.get("/", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const [loads, docs] = await Promise.all([readJson("loads.json"), readJson("documents.json")]);
  const includeClosed = String(req.query.includeClosed || "") === "1";
  const view = String(req.query.view || "active");
  let visible = await filterLoadsForUser(req.user, loads);
  if (!includeClosed && view === "active") visible = visible.filter(l => !["closed", "cancelled"].includes(String(l.status || "").toLowerCase()));
  if (view === "finished") visible = visible.filter(l => ["closed", "delivered"].includes(String(l.status || "").toLowerCase()));
  visible = visible.map(l => enrichLoad(l, docs)).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json(visible);
});

router.get("/all", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const [loads, docs] = await Promise.all([readJson("loads.json"), readJson("documents.json")]);
  let visible = await filterLoadsForUser(req.user, loads);
  const view = String(req.query.view || "active");
  if (view === "finished") visible = visible.filter(l => ["closed", "delivered"].includes(String(l.status || "").toLowerCase()));
  else if (view === "active") visible = visible.filter(l => !["closed", "cancelled"].includes(String(l.status || "").toLowerCase()));
  res.json(visible.map(l => enrichLoad(l, docs)).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
});


const DRAFT_FIELDS = ["loadNumber", "customer", "driverId", "pickup", "delivery", "rate", "notes"];
function cleanDraft(body = {}) {
  const draft = {};
  for (const key of DRAFT_FIELDS) {
    const max = key === "notes" ? 1000 : 220;
    const value = String(body[key] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    draft[key] = value || "";
  }
  return draft;
}
function cleanContext(value = "default") {
  return String(value || "default").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80) || "default";
}

router.get("/draft", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const context = cleanContext(req.query.context || "default");
  const rows = await readJson("loadDrafts.json");
  const row = rows.find(r => r.userId === req.user.sub && r.context === context);
  res.json({ ok: true, context, draft: row?.draft || {}, updatedAt: row?.updatedAt || null });
});

router.put("/draft", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const context = cleanContext(req.body?.context || req.query.context || "default");
  const draft = cleanDraft(req.body?.draft || req.body || {});
  const now = new Date().toISOString();
  let saved = null;
  await updateJson("loadDrafts.json", arr => {
    const rows = Array.isArray(arr) ? arr : [];
    let row = rows.find(r => r.userId === req.user.sub && r.context === context);
    if (!row) {
      row = { id: uid("ldraft"), userId: req.user.sub, context, createdAt: now };
      rows.push(row);
    }
    row.draft = draft;
    row.updatedAt = now;
    saved = row;
    return rows;
  });
  res.json({ ok: true, draft: saved });
});

router.post("/", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const { loadNumber, customer, driverId, pickup, delivery, rate, notes } = req.body || {};
  if (!loadNumber || !driverId) return res.status(400).json({ error: "Load number and driver are required" });
  if (req.user.role === "dispatcher") {
    const allowed = await isDriverAssignedToDispatcher(req.user.sub, driverId);
    if (!allowed) return res.status(403).json({ error: "You can create loads only for drivers assigned to you" });
  } else if (req.user.role !== "admin") {
    const allowed = await canAccessDriver(req.user, driverId);
    if (!allowed && req.user.role !== "broker") return res.status(403).json({ error: "Driver is not assigned to you" });
  }
  const assignedDispatchers = await getDispatcherIdsForDriver(driverId);
  const primaryDispatcherId = req.body.dispatcherId || (req.user.role === "dispatcher" ? req.user.sub : (assignedDispatchers[0] || null));

  const load = {
    id: uid("l"),
    loadNumber: String(loadNumber).trim(),
    customer: customer ? String(customer).trim() : null,
    driverId,
    dispatcherId: primaryDispatcherId,
    brokerId: req.user.role === "broker" ? req.user.sub : (req.body.brokerId || null),
    pickup: pickup || null,
    delivery: delivery || null,
    rate: rate || null,
    notes: notes || null,
    status: "assigned",
    createdBy: req.user.sub,
    companyId: req.user.companyId || "jts-logistics",
    createdAt: new Date().toISOString(),
    statusHistory: [{ status: "created", byUserId: req.user.sub, at: new Date().toISOString(), note: "Load created" }, { status: "assigned", byUserId: req.user.sub, at: new Date().toISOString(), note: "Assigned to driver" }]
  };
  await updateJson("loads.json", arr => (arr.push(load), arr));
  await audit("load_created", { loadId: load.id, loadNumber: load.loadNumber, driverId });
  await notify.users([driverId], { type: "load_assigned", title: "New load assigned", message: `Load ${load.loadNumber} has been assigned.`, data: { loadId: load.id, url: "/driver.html" } });
  await notify.roles(["admin", "dispatcher"], { type: "load_created", title: "Load created", message: `Load ${load.loadNumber} was created.`, data: { loadId: load.id } });
  res.json({ ok: true, load });
});

router.get("/:id/details", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const [loads, docs, users] = await Promise.all([readJson("loads.json"), readJson("documents.json"), readJson("users.json")]);
  const load = loads.find(l => l.id === req.params.id);
  if (!load) return res.status(404).json({ error: "Load not found" });
  const visible = await filterLoadsForUser(req.user, [load]);
  if (!visible.length) return res.status(403).json({ error: "Forbidden" });
  const allDocs = docs.filter(d => d.loadId === load.id).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const driver = users.find(u => u.id === load.driverId);
  res.json({ ok: true, load: enrichLoad({ ...load, driverName: driver?.name || null }, docs), checklist: requiredDocs.map(c => ({ category: c, status: enrichLoad(load, docs).docsSummary[c] })), allDocs });
});

router.patch("/:id/status", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const { status } = req.body || {};
  const allowed = req.user.role === "driver" ? ["accepted", "picked_up", "in_transit", "delivered"] : ["assigned", "accepted", "rejected", "in_progress", "picked_up", "in_transit", "delayed", "delivered", "closed", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const loads = await readJson("loads.json");
  const current = loads.find(l => l.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Load not found" });
  const visible = await filterLoadsForUser(req.user, [current]);
  if (!visible.length) return res.status(403).json({ error: "Forbidden" });

  let updated = null;
  await updateJson("loads.json", arr => {
    const l = arr.find(x => x.id === req.params.id);
    if (!l) return arr;
    l.status = status;
    l.updatedAt = new Date().toISOString();
    addHistory(l, status, req.user.sub, req.body?.note || null);
    if (["accepted", "picked_up", "in_transit"].includes(status)) l.startedAt = l.startedAt || new Date().toISOString();
    if (["delivered", "closed"].includes(status)) l.completedAt = l.completedAt || new Date().toISOString();
    updated = l;
    return arr;
  });
  await audit("load_status_updated", { loadId: updated.id, status });
  const recipients = [updated.driverId, updated.dispatcherId, updated.brokerId].filter(Boolean);
  await notify.users(recipients, { type: "load_status", title: "Load status updated", message: `Load ${updated.loadNumber} is now ${statusLabel(status)}.`, data: { loadId: updated.id, url: `/load-details.html?id=${updated.id}` } });
  res.json({ ok: true, load: updated });
});

router.post("/:id/accept", requireRole("driver"), async (req, res) => {
  const loads = await readJson("loads.json");
  const current = loads.find(l => l.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Load not found" });
  if (current.driverId !== req.user.sub) return res.status(403).json({ error: "Forbidden" });
  let updated = null;
  await updateJson("loads.json", arr => {
    const l = arr.find(x => x.id === req.params.id);
    if (!l) return arr;
    l.status = "accepted";
    l.acceptedAt = new Date().toISOString();
    l.updatedAt = l.acceptedAt;
    addHistory(l, "accepted", req.user.sub, "Driver accepted the load");
    updated = l;
    return arr;
  });
  await audit("load_accepted", { loadId: updated.id, driverId: req.user.sub });
  await notify.users([updated.dispatcherId, updated.brokerId].filter(Boolean), { type: "load_accepted", title: "Load accepted", message: `Driver accepted load ${updated.loadNumber}.`, data: { loadId: updated.id, url: `/load-details.html?id=${updated.id}` } });
  await notify.roles(["admin"], { type: "load_accepted", title: "Load accepted", message: `Driver accepted load ${updated.loadNumber}.`, data: { loadId: updated.id, url: `/load-details.html?id=${updated.id}` } });
  res.json({ ok: true, load: updated });
});

router.post("/:id/reject", requireRole("driver"), async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "Reject reason is required" });
  const loads = await readJson("loads.json");
  const current = loads.find(l => l.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Load not found" });
  if (current.driverId !== req.user.sub) return res.status(403).json({ error: "Forbidden" });
  let updated = null;
  await updateJson("loads.json", arr => {
    const l = arr.find(x => x.id === req.params.id);
    if (!l) return arr;
    l.status = "rejected";
    l.rejectedAt = new Date().toISOString();
    l.rejectionReason = reason.slice(0, 500);
    l.updatedAt = l.rejectedAt;
    addHistory(l, "rejected", req.user.sub, l.rejectionReason);
    updated = l;
    return arr;
  });
  await audit("load_rejected", { loadId: updated.id, driverId: req.user.sub, reason: updated.rejectionReason });
  await notify.users([updated.dispatcherId, updated.brokerId].filter(Boolean), { type: "load_rejected", title: "Load rejected", message: `Driver rejected load ${updated.loadNumber}: ${updated.rejectionReason}`, data: { loadId: updated.id, url: `/load-details.html?id=${updated.id}` } });
  await notify.roles(["admin"], { type: "load_rejected", title: "Load rejected", message: `Driver rejected load ${updated.loadNumber}: ${updated.rejectionReason}`, data: { loadId: updated.id, url: `/load-details.html?id=${updated.id}` } });
  res.json({ ok: true, load: updated });
});

export default router;
