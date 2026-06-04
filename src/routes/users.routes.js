import express from "express";
import { readJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { filterUsersForUser } from "../services/access.js";

const router = express.Router();
router.use(requireAuth);

function safeUser(u = {}) {
  return {
    id: u.id,
    firstName: u.firstName || null,
    lastName: u.lastName || null,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    address: u.address || null,
    companyId: u.companyId || "jts-logistics",
    companyName: u.companyName || null,
    role: u.role,
    status: u.status || "approved",
    isOwner: u.isOwner ?? null,
    trailerType: u.trailerType || null,
    truckNumber: u.truckNumber || null,
    trailerNumber: u.trailerNumber || null,
    mcNumber: u.mcNumber || null,
    dotNumber: u.dotNumber || null,
    notes: u.notes || null
  };
}

router.get("/me", async (req, res) => {
  const users = await readJson("users.json");
  const user = users.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(safeUser(user));
});


router.get("/:id/performance", requireRole("dispatcher", "admin", "driver"), async (req, res) => {
  const id = req.params.id;
  if (req.user.role === "driver" && req.user.sub !== id) return res.status(403).json({ error: "Forbidden" });
  const [users, loads, docs] = await Promise.all([readJson("users.json"), readJson("loads.json"), readJson("documents.json")]);
  const user = users.find(u => u.id === id && u.role === "driver");
  if (!user) return res.status(404).json({ error: "Driver not found" });
  const mine = loads.filter(l => l.driverId === id);
  const completed = mine.filter(l => ["delivered", "closed"].includes(String(l.status || "").toLowerCase())).length;
  const rejected = mine.filter(l => String(l.status || "").toLowerCase() === "rejected").length;
  const active = mine.filter(l => !["delivered", "closed", "cancelled", "rejected"].includes(String(l.status || "").toLowerCase())).length;
  const missingDocs = mine.filter(l => {
    const cats = new Set(docs.filter(d => d.loadId === l.id).map(d => String(d.category || "").toUpperCase()));
    return !cats.has("POD") || !cats.has("BOL");
  }).length;
  const score = Math.max(0, Math.min(100, 100 - rejected * 10 - missingDocs * 5));
  res.json({ ok: true, driver: safeUser(user), stats: { totalLoads: mine.length, active, completed, rejected, missingDocs, score, lastActive: user.lastActiveAt || user.updatedAt || user.createdAt || null } });
});

router.get("/", requireRole("dispatcher", "admin", "broker", "driver"), async (req, res) => {
  const role = String(req.query.role || "").toLowerCase();
  const users = await readJson("users.json");
  const assignments = await readJson("assignments.json");
  let visible = await filterUsersForUser(req.user, users.filter(u => u.status === "approved"));
  if (role) visible = visible.filter(u => String(u.role || "").toLowerCase() === role);

  const primaryByDriver = new Map();
  for (const a of assignments) {
    for (const driverId of (Array.isArray(a.driverIds) ? a.driverIds : [])) {
      if (!primaryByDriver.has(driverId)) primaryByDriver.set(driverId, a.dispatcherId);
    }
  }

  res.json(visible.map(u => {
    const item = safeUser(u);
    if (String(u.role || "").toLowerCase() === "driver") {
      item.assignedDispatcherId = primaryByDriver.get(u.id) || null;
      item.isAssignedToMe = req.user.role === "dispatcher" && item.assignedDispatcherId === req.user.sub;
    }
    return item;
  }));
});

export default router;
