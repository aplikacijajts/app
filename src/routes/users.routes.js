import express from "express";
import { readJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { filterUsersForUser } from "../services/access.js";

const router = express.Router();
router.use(requireAuth);

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone || null, address: u.address || null, companyId: u.companyId || "jts-logistics", role: u.role, status: u.status || "approved" };
}

router.get("/me", async (req, res) => {
  const users = await readJson("users.json");
  const user = users.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(safeUser(user));
});

router.get("/", requireRole("dispatcher", "admin", "broker", "driver"), async (req, res) => {
  const role = String(req.query.role || "").toLowerCase();
  const users = await readJson("users.json");
  let visible = await filterUsersForUser(req.user, users.filter(u => u.status === "approved"));
  if (role) visible = visible.filter(u => String(u.role || "").toLowerCase() === role);
  res.json(visible.map(safeUser));
});

export default router;
