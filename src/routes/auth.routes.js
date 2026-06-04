import express from "express";
import jwt from "jsonwebtoken";
import { readJson, updateJson } from "../services/jsonStore.js";
import { uid } from "../utils/id.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { normalizeAccountPayload, SELF_REGISTRATION_ROLES } from "../utils/userProfile.js";

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    companyId: user.companyId || "jts-logistics",
    companyName: user.companyName || null,
    role: user.role,
    status: user.status || "approved",
    isOwner: user.isOwner ?? null,
    trailerType: user.trailerType || null,
    truckNumber: user.truckNumber || null,
    trailerNumber: user.trailerNumber || null
  };
}

function sameEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * POST /api/auth/register
 * body: {
 *   firstName, lastName, email, phone, password,
 *   requestedRole, isOwner, trailerType, companyName,
 *   truckNumber, trailerNumber, mcNumber, dotNumber, notes
 * }
 * -> creates pending approval request. Admin must approve before login.
 */
router.post("/register", async (req, res) => {
  const normalized = normalizeAccountPayload(req.body || {}, {
    allowedRoles: SELF_REGISTRATION_ROLES,
    requirePassword: true,
    defaultRole: "driver"
  });

  if (!normalized.ok) {
    return res.status(400).json({ error: normalized.errors.join(". "), errors: normalized.errors });
  }

  const userData = normalized.data;
  const users = await readJson("users.json");
  if (users.some(u => sameEmail(u.email) === userData.email)) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const approvals = await readJson("approvals.json");
  if (approvals.some(a => sameEmail(a.userData?.email) === userData.email && a.status === "pending")) {
    return res.status(409).json({ error: "Approval request already pending" });
  }

  const approvalId = uid("appr");
  const passwordHash = await hashPassword(normalized.password);

  await updateJson("approvals.json", (arr) => {
    arr.push({
      id: approvalId,
      status: "pending",
      requestedRole: userData.requestedRole,
      userData: {
        ...userData,
        passwordHash
      },
      requestedAt: new Date().toISOString()
    });
    return arr;
  });

  await audit("register_pending", {
    approvalId,
    email: userData.email,
    requestedRole: userData.requestedRole,
    isOwner: userData.isOwner,
    trailerType: userData.trailerType
  });

  try {
    await notify.roles(["admin"], {
      type: "approval_pending",
      title: "New account waiting for approval",
      message: `${userData.name} submitted a ${userData.requestedRole} account request.`,
      data: { approvalId, url: "/admin.html" }
    });
  } catch {
    // Notification delivery is best-effort and must not block registration.
  }

  res.json({ ok: true, status: "pending", approvalId });
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  const email = sameEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = await readJson("users.json");
  const user = users.find(u => sameEmail(u.email) === email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.status !== "approved") return res.status(403).json({ error: "Account is not approved yet" });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user.id, role: user.role, companyId: user.companyId, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  await audit("login", { userId: user.id, role: user.role });

  res.json({ ok: true, token, user: publicUser(user) });
});


/**
 * POST /api/auth/forgot-password
 * Stores a reset token in data/passwordResets.json. In production this can be emailed through SMTP integration.
 */
router.post("/forgot-password", async (req, res) => {
  const email = sameEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });
  const users = await readJson("users.json");
  const user = users.find(u => sameEmail(u.email) === email);
  // Never reveal if the email exists.
  if (!user) return res.json({ ok: true, message: "If the account exists, a reset request was created." });
  const token = uid("reset") + "_" + Math.random().toString(36).slice(2);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await updateJson("passwordResets.json", (arr) => {
    arr.push({ id: uid("pr"), userId: user.id, email, token, expiresAt, usedAt: null, createdAt: new Date().toISOString() });
    return arr.slice(-100);
  });
  await audit("password_reset_requested", { userId: user.id, email });
  try {
    await notify.users([user.id], { type: "password_reset", title: "Password reset requested", message: "A password reset was requested for your JTS account.", data: { url: "/index.html" } });
  } catch {}
  res.json({ ok: true, message: "Reset request created.", resetToken: process.env.NODE_ENV === "production" ? undefined : token });
});

/**
 * POST /api/auth/reset-password
 * body: { token, password }
 */
router.post("/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || password.length < 6) return res.status(400).json({ error: "Valid token and a password with at least 6 characters are required" });
  const resets = await readJson("passwordResets.json");
  const rec = resets.find(r => r.token === token && !r.usedAt);
  if (!rec || new Date(rec.expiresAt).getTime() < Date.now()) return res.status(400).json({ error: "Reset token is invalid or expired" });
  const passwordHash = await hashPassword(password);
  await updateJson("users.json", (arr) => {
    const u = arr.find(x => x.id === rec.userId);
    if (u) { u.passwordHash = passwordHash; u.updatedAt = new Date().toISOString(); }
    return arr;
  });
  await updateJson("passwordResets.json", (arr) => {
    const r = arr.find(x => x.token === token);
    if (r) r.usedAt = new Date().toISOString();
    return arr;
  });
  await audit("password_reset_completed", { userId: rec.userId });
  res.json({ ok: true });
});

export default router;
