import express from "express";
import { readJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = express.Router();
router.use(requireAuth);

// List users (limited fields) for dispatcher/admin
router.get("/", requireRole("dispatcher", "admin", "broker"), async (req, res) => {
  const role = (req.query.role || "").toLowerCase();
  const users = await readJson("users.json");

  let out = users.filter(u => u.status === "approved");
  if (role) out = out.filter(u => (u.role || "").toLowerCase() === role);

  res.json(out.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    address: u.address,
    companyId: u.companyId,
    role: u.role
  })));
});

export default router;
