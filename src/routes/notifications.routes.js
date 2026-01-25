import express from "express";

import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications/my?limit=20
router.get("/my", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const rows = await readJson("notifications.json");
  const mine = rows
    .filter(n => n.toUserId === req.user.sub)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
  res.json(mine);
});

// POST /api/notifications/:id/read
router.post("/:id/read", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const id = req.params.id;
  let found = false;
  await updateJson("notifications.json", (arr) => {
    const n = arr.find(x => x.id === id);
    if (!n) return arr;
    if (n.toUserId !== req.user.sub) return arr;
    found = true;
    n.readAt = new Date().toISOString();
    return arr;
  });
  if (!found) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// GET /api/notifications/stream (SSE)
router.get("/stream", requireRole("driver", "dispatcher", "admin", "broker"), (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // initial ping
  res.write(`data: ${JSON.stringify({ event: "hello" })}\n\n`);

  notify.addClient(req.user.sub, res);

  req.on("close", () => {
    notify.removeClient(req.user.sub, res);
  });
});

export default router;
