import express from "express";
import { readJson, updateJson, writeJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { hashPassword } from "../utils/password.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    address: u.address || null,
    companyId: u.companyId || "jts-logistics",
    role: u.role,
    status: u.status || "approved",
    createdAt: u.createdAt || null
  };
}

router.get("/summary", async (req, res) => {
  const [users, loads, approvals, documents, notifications, auditRows, assignments] = await Promise.all([
    readJson("users.json"), readJson("loads.json"), readJson("approvals.json"), readJson("documents.json"), readJson("notifications.json"), readJson("audit.json"), readJson("assignments.json")
  ]);
  res.json({
    ok: true,
    metrics: {
      users: users.filter(u => u.status === "approved").length,
      drivers: users.filter(u => u.role === "driver" && u.status === "approved").length,
      dispatchers: users.filter(u => u.role === "dispatcher" && u.status === "approved").length,
      brokers: users.filter(u => u.role === "broker" && u.status === "approved").length,
      activeLoads: loads.filter(l => !["closed", "cancelled", "delivered"].includes(String(l.status || "").toLowerCase())).length,
      pendingApprovals: approvals.filter(a => a.status === "pending").length,
      documents: documents.length,
      unreadNotifications: notifications.filter(n => !n.readAt && !n.read).length,
      assignments: assignments.length
    },
    timeline: auditRows.slice(-20).reverse(),
    recentLoads: loads.slice(-10).reverse()
  });
});

router.get("/approvals", async (req, res) => {
  const approvals = await readJson("approvals.json");
  const status = req.query.status || "pending";
  res.json(approvals.filter(a => a.status === status));
});

router.post("/approvals/:id/approve", async (req, res) => {
  const id = req.params.id;
  const approvals = await readJson("approvals.json");
  const approval = approvals.find(a => a.id === id);
  if (!approval) return res.status(404).json({ error: "Not found" });
  if (approval.status !== "pending") return res.status(400).json({ error: "Not pending" });

  const desiredRole = ["driver", "dispatcher", "broker"].includes(req.body?.role) ? req.body.role : (approval.requestedRole || "driver");
  let createdUser = null;
  await updateJson("users.json", (users) => {
    createdUser = {
      id: uid("u"),
      name: approval.userData.name,
      email: approval.userData.email,
      phone: approval.userData.phone || null,
      companyId: approval.userData.companyId || "jts-logistics",
      role: desiredRole,
      status: "approved",
      passwordHash: approval.userData.passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(createdUser);
    return users;
  });

  await updateJson("approvals.json", (arr) => {
    const a = arr.find(x => x.id === id);
    a.status = "approved";
    a.requestedRole = desiredRole;
    a.decidedAt = new Date().toISOString();
    a.decidedBy = req.user.sub;
    return arr;
  });
  await audit("approval_approved", { approvalId: id, userId: createdUser.id, role: desiredRole });
  res.json({ ok: true, user: safeUser(createdUser) });
});

router.post("/approvals/:id/reject", async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};
  let found = false;
  await updateJson("approvals.json", (arr) => {
    const a = arr.find(x => x.id === id);
    if (!a || a.status !== "pending") return arr;
    found = true;
    a.status = "rejected";
    a.reason = reason || "Rejected";
    a.decidedAt = new Date().toISOString();
    a.decidedBy = req.user.sub;
    return arr;
  });
  if (!found) return res.status(404).json({ error: "Not found" });
  await audit("approval_rejected", { approvalId: id, reason });
  res.json({ ok: true });
});

router.get("/users", async (req, res) => {
  const role = String(req.query.role || "").toLowerCase();
  const users = await readJson("users.json");
  let out = users.filter(u => u.status === "approved");
  if (role) out = out.filter(u => String(u.role || "").toLowerCase() === role);
  res.json(out.map(safeUser));
});

router.post("/users", async (req, res) => {
  const { name, email, phone, address, companyId, role, password } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: "Name, email, role and password are required" });
  const desiredRole = String(role).toLowerCase();
  if (!["driver", "dispatcher", "admin", "broker"].includes(desiredRole)) return res.status(400).json({ error: "Invalid role" });
  const normEmail = String(email).trim().toLowerCase();
  const users = await readJson("users.json");
  if (users.some(u => String(u.email || "").toLowerCase() === normEmail)) return res.status(409).json({ error: "Email already exists" });

  const user = {
    id: uid("u"),
    name: String(name).trim(),
    email: normEmail,
    phone: phone ? String(phone).trim() : null,
    address: address ? String(address).trim() : null,
    companyId: companyId ? String(companyId).trim() : "jts-logistics",
    role: desiredRole,
    status: "approved",
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString()
  };
  await updateJson("users.json", arr => (arr.push(user), arr));
  await audit("admin_user_created", { userId: user.id, role: user.role, email: user.email });
  res.json({ ok: true, user: safeUser(user) });
});

router.patch("/users/:id", async (req, res) => {
  const id = req.params.id;
  const allowed = ["name", "phone", "address", "companyId", "role", "status"];
  let updated = null;
  await updateJson("users.json", (arr) => {
    const u = arr.find(x => x.id === id);
    if (!u) return arr;
    for (const key of allowed) if (req.body?.[key] !== undefined) u[key] = req.body[key];
    if (u.role && !["driver", "dispatcher", "admin", "broker"].includes(u.role)) u.role = "driver";
    u.updatedAt = new Date().toISOString();
    updated = u;
    return arr;
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  await audit("admin_user_updated", { userId: id });
  res.json({ ok: true, user: safeUser(updated) });
});

router.delete("/users/:id", async (req, res) => {
  const id = req.params.id;
  if (id === req.user.sub) return res.status(400).json({ error: "Cannot delete current user" });
  const users = await readJson("users.json");
  const target = users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === "admin") return res.status(400).json({ error: "Refusing to delete an admin user" });
  await updateJson("users.json", arr => arr.filter(u => u.id !== id));
  await updateJson("assignments.json", arr => arr.map(a => ({ ...a, driverIds: (a.driverIds || []).filter(d => d !== id) })).filter(a => a.dispatcherId !== id));
  await audit("admin_user_deleted", { userId: id });
  res.json({ ok: true });
});

router.get("/assignments", async (req, res) => {
  const [assignments, users] = await Promise.all([readJson("assignments.json"), readJson("users.json")]);
  const byId = new Map(users.map(u => [u.id, safeUser(u)]));
  const dispatchers = users.filter(u => u.role === "dispatcher" && u.status === "approved").map(safeUser);
  const drivers = users.filter(u => u.role === "driver" && u.status === "approved").map(safeUser);
  const rows = dispatchers.map(d => {
    const rec = assignments.find(a => a.dispatcherId === d.id) || { dispatcherId: d.id, driverIds: [] };
    return {
      dispatcher: d,
      driverIds: rec.driverIds || [],
      drivers: (rec.driverIds || []).map(id => byId.get(id)).filter(Boolean),
      updatedAt: rec.updatedAt || null
    };
  });
  res.json({ ok: true, dispatchers, drivers, assignments: rows });
});

router.put("/assignments/:dispatcherId", async (req, res) => {
  const dispatcherId = req.params.dispatcherId;
  const driverIds = Array.isArray(req.body?.driverIds) ? req.body.driverIds.filter(Boolean) : [];
  const users = await readJson("users.json");
  const dispatcher = users.find(u => u.id === dispatcherId && u.role === "dispatcher");
  if (!dispatcher) return res.status(404).json({ error: "Dispatcher not found" });
  const validDriverIds = new Set(users.filter(u => u.role === "driver" && u.status === "approved").map(u => u.id));
  const cleanIds = Array.from(new Set(driverIds.filter(id => validDriverIds.has(id))));
  await updateJson("assignments.json", (arr) => {
    const idx = arr.findIndex(a => a.dispatcherId === dispatcherId);
    const item = { dispatcherId, driverIds: cleanIds, updatedAt: new Date().toISOString(), updatedBy: req.user.sub };
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    return arr;
  });
  await audit("driver_assignment_updated", { dispatcherId, driverIds: cleanIds });
  await notify.users([dispatcherId], { type: "assignment_updated", title: "Driver list updated", message: "Your driver assignments were updated.", data: { dispatcherId } });
  res.json({ ok: true, dispatcherId, driverIds: cleanIds });
});

router.get("/audit", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const rows = await readJson("audit.json");
  res.json(rows.slice(-limit).reverse());
});

router.delete("/data/:table", async (req, res) => {
  const map = { bids: "bids.json", loads: "loads.json", documents: "documents.json", notifications: "notifications.json", approvals: "approvals.json", audit: "audit.json", assignments: "assignments.json" };
  const file = map[String(req.params.table || "").toLowerCase()];
  if (!file) return res.status(400).json({ error: "Invalid table" });
  await writeJson(file, []);
  await audit("admin_data_cleared", { file });
  res.json({ ok: true });
});

export default router;
