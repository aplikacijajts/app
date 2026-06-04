import express from "express";
import { readJson, updateJson, writeJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { hashPassword } from "../utils/password.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { normalizeAccountPayload, ADMIN_USER_ROLES, SELF_REGISTRATION_ROLES, cleanString, parseOwnerFlag } from "../utils/userProfile.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

function sameEmail(value) {
  return String(value || "").trim().toLowerCase();
}


async function getPrimaryDispatcherIdForDriver(driverId) {
  const assignments = await readJson("assignments.json");
  const rec = assignments.find(a => Array.isArray(a.driverIds) && a.driverIds.includes(driverId));
  return rec?.dispatcherId || null;
}

async function setPrimaryDispatcherForDriver(driverId, dispatcherId, updatedBy = null) {
  if (!driverId) return;
  const users = await readJson("users.json");
  const validDispatcher = dispatcherId ? users.find(u => u.id === dispatcherId && u.role === "dispatcher" && u.status === "approved") : null;
  const now = new Date().toISOString();
  await updateJson("assignments.json", (arr) => {
    const next = (arr || []).map(a => ({ ...a, driverIds: Array.isArray(a.driverIds) ? a.driverIds.filter(id => id !== driverId) : [] }));
    if (validDispatcher) {
      let rec = next.find(a => a.dispatcherId === dispatcherId);
      if (!rec) {
        rec = { dispatcherId, driverIds: [], updatedAt: now, updatedBy };
        next.push(rec);
      }
      if (!rec.driverIds.includes(driverId)) rec.driverIds.push(driverId);
      rec.updatedAt = now;
      rec.updatedBy = updatedBy;
    }
    return next.filter(a => a.dispatcherId && Array.isArray(a.driverIds) && a.driverIds.length);
  });
}

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
    notes: u.notes || null,
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null
  };
}

function safeApproval(a = {}) {
  const { passwordHash, ...userData } = a.userData || {};
  return {
    id: a.id,
    status: a.status,
    requestedRole: a.requestedRole || userData.requestedRole || "driver",
    userData,
    requestedAt: a.requestedAt || null,
    decidedAt: a.decidedAt || null,
    decidedBy: a.decidedBy || null,
    reason: a.reason || null
  };
}

function userFromApproval(approval, desiredRole) {
  const ud = approval.userData || {};
  const fullName = cleanString(ud.name || `${ud.firstName || ""} ${ud.lastName || ""}`.trim(), 160);
  return {
    id: uid("u"),
    firstName: cleanString(ud.firstName || fullName.split(" ")[0], 80) || null,
    lastName: cleanString(ud.lastName || fullName.split(" ").slice(1).join(" "), 80) || null,
    name: fullName,
    email: sameEmail(ud.email),
    phone: cleanString(ud.phone, 40) || null,
    address: cleanString(ud.address, 180) || null,
    companyId: cleanString(ud.companyId, 80) || "jts-logistics",
    companyName: cleanString(ud.companyName, 120) || null,
    role: desiredRole,
    status: "approved",
    isOwner: ud.isOwner ?? null,
    trailerType: cleanString(ud.trailerType, 80) || null,
    truckNumber: cleanString(ud.truckNumber, 80) || null,
    trailerNumber: cleanString(ud.trailerNumber, 80) || null,
    mcNumber: cleanString(ud.mcNumber, 80) || null,
    dotNumber: cleanString(ud.dotNumber, 80) || null,
    notes: cleanString(ud.notes, 500) || null,
    passwordHash: ud.passwordHash,
    createdAt: new Date().toISOString()
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
      missingDocsLoads: loads.filter(l => !["closed", "cancelled"].includes(String(l.status || "").toLowerCase())).filter(l => {
        const loadDocs = documents.filter(d => d.loadId === l.id);
        const cats = new Set(loadDocs.map(d => String(d.category || "").toUpperCase()));
        return !cats.has("POD") || !cats.has("BOL");
      }).length,
      submittedBids: (await readJson("bids.json")).filter(b => String(b.status || "submitted") === "submitted").length,
      unreadNotifications: notifications.filter(n => !n.readAt && !n.read).length,
      assignments: assignments.length
    },
    timeline: auditRows.slice(-20).reverse(),
    recentLoads: loads.slice(-10).reverse()
  });
});

router.get("/approvals", async (req, res) => {
  const approvals = await readJson("approvals.json");
  const status = String(req.query.status || "pending").toLowerCase();
  res.json(approvals.filter(a => String(a.status || "").toLowerCase() === status).map(safeApproval));
});

router.post("/approvals/:id/approve", async (req, res) => {
  const id = req.params.id;
  const approvals = await readJson("approvals.json");
  const approval = approvals.find(a => a.id === id);
  if (!approval) return res.status(404).json({ error: "Not found" });
  if (approval.status !== "pending") return res.status(400).json({ error: "Not pending" });
  if (!approval.userData?.passwordHash || !approval.userData?.email) return res.status(400).json({ error: "Approval data is incomplete" });

  const requested = String(req.body?.role || approval.requestedRole || "driver").toLowerCase();
  const desiredRole = SELF_REGISTRATION_ROLES.includes(requested) ? requested : (approval.requestedRole || "driver");

  const users = await readJson("users.json");
  if (users.some(u => sameEmail(u.email) === sameEmail(approval.userData.email))) {
    return res.status(409).json({ error: "A user with this email already exists" });
  }

  let createdUser = null;
  await updateJson("users.json", (arr) => {
    createdUser = userFromApproval(approval, desiredRole);
    arr.push(createdUser);
    return arr;
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
  try {
    await notify.users([createdUser.id], {
      type: "account_approved",
      title: "Account approved",
      message: "Your JTS Logistics account has been approved. You can now sign in.",
      data: { url: "/index.html" }
    });
  } catch {}

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
    a.reason = cleanString(reason, 500) || "Rejected";
    a.decidedAt = new Date().toISOString();
    a.decidedBy = req.user.sub;
    return arr;
  });
  if (!found) return res.status(404).json({ error: "Not found" });
  await audit("approval_rejected", { approvalId: id, reason: cleanString(reason, 500) || "Rejected" });
  res.json({ ok: true });
});

router.get("/users", async (req, res) => {
  const role = String(req.query.role || "").toLowerCase();
  const users = await readJson("users.json");
  let out = users.filter(u => u.status === "approved");
  if (role) out = out.filter(u => String(u.role || "").toLowerCase() === role);
  const assignments = await readJson("assignments.json");
  const primaryByDriver = new Map();
  for (const a of assignments) for (const driverId of (a.driverIds || [])) if (!primaryByDriver.has(driverId)) primaryByDriver.set(driverId, a.dispatcherId);
  res.json(out.map(u => ({ ...safeUser(u), assignedDispatcherId: u.role === "driver" ? (primaryByDriver.get(u.id) || null) : null })));
});

router.post("/users", async (req, res) => {
  const normalized = normalizeAccountPayload(req.body || {}, {
    allowedRoles: ADMIN_USER_ROLES,
    requirePassword: true,
    defaultRole: "driver"
  });
  if (!normalized.ok) {
    return res.status(400).json({ error: normalized.errors.join(". "), errors: normalized.errors });
  }

  const data = normalized.data;
  const users = await readJson("users.json");
  if (users.some(u => sameEmail(u.email) === data.email)) return res.status(409).json({ error: "Email already exists" });

  const user = {
    id: uid("u"),
    ...data,
    role: data.role,
    status: "approved",
    passwordHash: await hashPassword(normalized.password),
    createdAt: new Date().toISOString()
  };
  delete user.requestedRole;

  await updateJson("users.json", arr => (arr.push(user), arr));
  if (user.role === "driver" && req.body?.dispatcherId) {
    await setPrimaryDispatcherForDriver(user.id, cleanString(req.body.dispatcherId, 120), req.user.sub);
  }
  await audit("admin_user_created", { userId: user.id, role: user.role, email: user.email, dispatcherId: user.role === "driver" ? (req.body?.dispatcherId || null) : null });
  res.json({ ok: true, user: safeUser(user) });
});

router.patch("/users/:id", async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const patch = {};
  const errors = [];

  for (const key of ["firstName", "lastName", "name", "phone", "address", "companyId", "companyName", "trailerType", "truckNumber", "trailerNumber", "mcNumber", "dotNumber", "notes", "status"]) {
    if (body[key] !== undefined) patch[key] = cleanString(body[key], key === "notes" ? 500 : 180) || null;
  }
  if (body.role !== undefined) {
    const role = String(body.role || "").toLowerCase();
    if (!ADMIN_USER_ROLES.includes(role)) errors.push("Invalid role");
    else patch.role = role;
  }
  if (body.isOwner !== undefined) {
    if (body.isOwner === null || body.isOwner === "") {
      patch.isOwner = null;
    } else {
      const owner = parseOwnerFlag(body.isOwner);
      if (owner === null) errors.push("Invalid owner status");
      else patch.isOwner = owner;
    }
  }
  if (patch.status && !["approved", "disabled", "suspended"].includes(String(patch.status).toLowerCase())) errors.push("Invalid status");
  if (errors.length) return res.status(400).json({ error: errors.join(". "), errors });

  let updated = null;
  await updateJson("users.json", (arr) => {
    const u = arr.find(x => x.id === id);
    if (!u) return arr;
    Object.assign(u, patch);
    if ((patch.firstName !== undefined || patch.lastName !== undefined) && (u.firstName || u.lastName)) {
      u.name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
    if (!u.name && (u.firstName || u.lastName)) u.name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
    u.updatedAt = new Date().toISOString();
    updated = u;
    return arr;
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  if ((updated.role === "driver" || patch.role === "driver") && body.dispatcherId !== undefined) {
    await setPrimaryDispatcherForDriver(id, cleanString(body.dispatcherId, 120), req.user.sub);
  }
  await audit("admin_user_updated", { userId: id, fields: Object.keys(patch), dispatcherId: body.dispatcherId ?? undefined });
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


router.get("/reports/:table.csv", async (req, res) => {
  const table = String(req.params.table || "").toLowerCase();
  const allowed = { users: "users.json", loads: "loads.json", bids: "bids.json", documents: "documents.json" };
  const file = allowed[table];
  if (!file) return res.status(400).json({ error: "Invalid report" });
  const rows = await readJson(file);
  const safeRows = rows.map(r => { const { passwordHash, ...rest } = r || {}; return rest; });
  const columns = Array.from(safeRows.reduce((set, row) => { Object.keys(row || {}).forEach(k => set.add(k)); return set; }, new Set()));
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [columns.join(","), ...safeRows.map(row => columns.map(c => esc(row[c])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="jts-${table}.csv"`);
  res.send(csv);
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
