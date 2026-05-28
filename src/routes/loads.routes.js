import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { notify } from "../services/notify.js";
import { audit } from "../services/audit.js";
import { canAccessDriver, filterLoadsForUser } from "../services/access.js";

const router = express.Router();
router.use(requireAuth);

const requiredDocs = ["POD", "BOL"];

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

router.post("/", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const { loadNumber, customer, driverId, pickup, delivery, rate, notes } = req.body || {};
  if (!loadNumber || !driverId) return res.status(400).json({ error: "Load number and driver are required" });
  if (req.user.role !== "admin") {
    const allowed = await canAccessDriver(req.user, driverId);
    if (!allowed && req.user.role !== "broker") return res.status(403).json({ error: "Driver is not assigned to you" });
  }
  const load = {
    id: uid("l"),
    loadNumber: String(loadNumber).trim(),
    customer: customer ? String(customer).trim() : null,
    driverId,
    dispatcherId: req.user.role === "dispatcher" ? req.user.sub : (req.body.dispatcherId || null),
    brokerId: req.user.role === "broker" ? req.user.sub : (req.body.brokerId || null),
    pickup: pickup || null,
    delivery: delivery || null,
    rate: rate || null,
    notes: notes || null,
    status: "in_progress",
    createdBy: req.user.sub,
    companyId: req.user.companyId || "jts-logistics",
    createdAt: new Date().toISOString()
  };
  await updateJson("loads.json", arr => (arr.push(load), arr));
  await audit("load_created", { loadId: load.id, loadNumber: load.loadNumber, driverId });
  await notify.users([driverId], { type: "load_assigned", title: "New load assigned", message: `Load ${load.loadNumber} has been assigned.`, data: { loadId: load.id, url: "/driver-portal.html" } });
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
  const allowed = req.user.role === "driver" ? ["picked_up", "in_transit", "delivered"] : ["in_progress", "picked_up", "in_transit", "delayed", "delivered", "closed", "cancelled"];
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
    if (["delivered", "closed"].includes(status)) l.completedAt = l.completedAt || new Date().toISOString();
    updated = l;
    return arr;
  });
  await audit("load_status_updated", { loadId: updated.id, status });
  const recipients = [updated.driverId, updated.dispatcherId, updated.brokerId].filter(Boolean);
  await notify.users(recipients, { type: "load_status", title: "Load status updated", message: `Load ${updated.loadNumber} is now ${status}.`, data: { loadId: updated.id } });
  res.json({ ok: true, load: updated });
});

export default router;
