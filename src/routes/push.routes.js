import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { savePushToken } from "../services/push.js";

const router = express.Router();
router.use(requireAuth);

// Client sends FCM token after login
router.post("/register", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token) return res.status(400).json({ error: "Missing token" });

  await savePushToken({ userId: req.user.sub, token, platform });
  res.json({ ok: true });
});

export default router;
