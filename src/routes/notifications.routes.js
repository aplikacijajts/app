import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

function visibleForUser(n, user) {
  return n.toUserId === user.sub || n.userId === user.sub || n.role === user.role || (Array.isArray(n.roles) && n.roles.includes(user.role));
}

router.get("/my", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const notifications = await readJson("notifications.json");
  res.json(notifications.filter(n => visibleForUser(n, req.user)).sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit));
});

router.post("/:id/read", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  const id = req.params.id;
  let found = false;
  await updateJson("notifications.json", (arr) => {
    const n = arr.find(x => x.id === id);
    if (!n || !visibleForUser(n, req.user)) return arr;
    found = true;
    n.readAt = new Date().toISOString();
    n.read = true;
    return arr;
  });
  if (!found) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.post("/read-all", requireRole("driver", "dispatcher", "admin", "broker"), async (req, res) => {
  await updateJson("notifications.json", (arr) => arr.map(n => visibleForUser(n, req.user) ? { ...n, read: true, readAt: n.readAt || new Date().toISOString() } : n));
  res.json({ ok: true });
});

router.get("/stream", requireRole("driver", "dispatcher", "admin", "broker"), (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`data: ${JSON.stringify({ event: "hello" })}\n\n`);
  notify.addClient(req.user.sub, res);
  req.on("close", () => notify.removeClient(req.user.sub, res));
});

export default router;
