import express from "express";
import jwt from "jsonwebtoken";
import { readJson, updateJson } from "../services/jsonStore.js";
import { uid } from "../utils/id.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { audit } from "../services/audit.js";

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { name, email, phone, companyId, password }
 * -> creates pending approval request
 */
router.post("/register", async (req, res) => {
  const { name, email, phone, companyId, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = await readJson("users.json");
  if (users.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const approvals = await readJson("approvals.json");
  if (approvals.some(a => a.userData?.email === email.toLowerCase() && a.status === "pending")) {
    return res.status(409).json({ error: "Approval request already pending" });
  }

  const approvalId = uid("appr");
  const passwordHash = await hashPassword(password);

  await updateJson("approvals.json", (arr) => {
    arr.push({
      id: approvalId,
      status: "pending",
      requestedRole: "driver",
      userData: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        companyId: companyId || "default",
        passwordHash
      },
      requestedAt: new Date().toISOString()
    });
    return arr;
  });

  await audit("register_pending", { approvalId, email: email.toLowerCase() });

  res.json({ ok: true, status: "pending", approvalId });
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = await readJson("users.json");
  const user = users.find(u => u.email === email.toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.status !== "approved") return res.status(403).json({ error: "Not approved" });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user.id, role: user.role, companyId: user.companyId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  await audit("login", { userId: user.id, role: user.role });

  res.json({ ok: true, token, user: { id: user.id, name: user.name, role: user.role } });
});

export default router;
