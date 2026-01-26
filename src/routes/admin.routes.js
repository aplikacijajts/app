import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { hashPassword } from "../utils/password.js";
import { audit } from "../services/audit.js";

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

// GET /api/admin/approvals?status=pending
router.get("/approvals", async (req, res) => {
  const approvals = await readJson("approvals.json");
  const status = req.query.status || "pending";
  res.json(approvals.filter(a => a.status === status));
});

// POST /api/admin/approvals/:id/approve
router.post("/approvals/:id/approve", async (req, res) => {
  const id = req.params.id;

  const approvals = await readJson("approvals.json");
  const approval = approvals.find(a => a.id === id);
  if (!approval) return res.status(404).json({ error: "Not found" });
  if (approval.status !== "pending") return res.status(400).json({ error: "Not pending" });

  const { role } = req.body || {};
  const desiredRole = (role && ["driver","dispatcher","broker"].includes(role)) ? role : (approval.requestedRole || "driver");

  // create user
  await updateJson("users.json", (users) => {
    users.push({
      id: uid("u"),
      name: approval.userData.name,
      email: approval.userData.email,
      phone: approval.userData.phone,
      companyId: approval.userData.companyId,
      role: desiredRole,
      status: "approved",
      passwordHash: approval.userData.passwordHash,
      createdAt: new Date().toISOString()
    });
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

  await audit("approval_approved", { approvalId: id });

  res.json({ ok: true });
});

// POST /api/admin/approvals/:id/reject  body: {reason}
router.post("/approvals/:id/reject", async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};

  await updateJson("approvals.json", (arr) => {
    const a = arr.find(x => x.id === id);
    if (!a) return arr;
    if (a.status !== "pending") return arr;
    a.status = "rejected";
    a.reason = reason || "Rejected";
    a.decidedAt = new Date().toISOString();
    a.decidedBy = req.user.sub;
    return arr;
  });

  await audit("approval_rejected", { approvalId: id, reason });

  res.json({ ok: true });
});

// GET /api/admin/users?role=driver
router.get("/users", async (req, res) => {
  const role = (req.query.role || "").toLowerCase();
  const users = await readJson("users.json");

  let out = users.filter(u => u.status === "approved");
  if (role) out = out.filter(u => (u.role || "").toLowerCase() === role);

  res.json(out.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    companyId: u.companyId,
    role: u.role
  })));
});

// POST /api/admin/users  (create an approved user directly from Admin UI)
// body: { name, email, phone?, companyId?, role: 'dispatcher'|'driver'|'admin', password }
router.post("/users", async (req, res) => {
  const { name, email, phone, address, companyId, role, password } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: "Missing fields" });

  const desiredRole = String(role).toLowerCase();
  const allowedRoles = ["driver", "dispatcher", "admin", "broker"];
  if (!allowedRoles.includes(desiredRole)) return res.status(400).json({ error: "Invalid role" });

  const normEmail = String(email).trim().toLowerCase();
  const users = await readJson("users.json");
  if (users.some(u => (u.email || "").toLowerCase() === normEmail)) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const passwordHash = await hashPassword(password);
  const user = {
    id: uid("u"),
    name: String(name).trim(),
    email: normEmail,
    phone: phone ? String(phone).trim() : null,
    address: address ? String(address).trim() : null,
    companyId: companyId ? String(companyId).trim() : "default",
    role: desiredRole,
    status: "approved",
    passwordHash,
    createdAt: new Date().toISOString()
  };

  await updateJson("users.json", (arr) => (arr.push(user), arr));
  await audit("admin_user_created", { userId: user.id, role: user.role, email: user.email });

  // return safe payload
  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      companyId: user.companyId,
      role: user.role,
      status: user.status
    }
  });
});

// DELETE /api/admin/users/:id (delete user)
router.delete("/users/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  // Prevent deleting the currently logged in admin
  if (id === req.user.sub) return res.status(400).json({ error: "Cannot delete current user" });

  const users = await readJson("users.json");
  const target = users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: "Not found" });
  if ((target.role || "").toLowerCase() === "admin") {
    return res.status(400).json({ error: "Refusing to delete an admin user" });
  }

  await updateJson("users.json", (arr) => arr.filter(u => u.id !== id));
  await audit("admin_user_deleted", { userId: id });
  res.json({ ok: true });
});

// DELETE /api/admin/data/:table  (clear JSON tables)
router.delete("/data/:table", async (req, res) => {
  const t = String(req.params.table || "").toLowerCase();
  const map = {
    bids: "bids.json",
    loads: "loads.json",
    documents: "documents.json",
    notifications: "notifications.json",
    approvals: "approvals.json",
    audit: "audit.json",
  };
  const file = map[t];
  if (!file) return res.status(400).json({ error: "Invalid table" });

  await updateJson(file, () => []);
  await audit("admin_data_cleared", { table: t, file });
  res.json({ ok: true });
});

export default router;
