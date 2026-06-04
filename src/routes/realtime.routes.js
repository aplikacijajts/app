import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { readJson } from "../services/jsonStore.js";
import { filterLoadsForUser, filterUsersForUser } from "../services/access.js";

const router = express.Router();
router.use(requireAuth);

router.get("/dashboard", async (req, res) => {
  const [loads, users, docs, notifications, auditRows] = await Promise.all([
    readJson("loads.json"), readJson("users.json"), readJson("documents.json"), readJson("notifications.json"), readJson("audit.json")
  ]);
  const visibleLoads = await filterLoadsForUser(req.user, loads);
  const visibleUsers = await filterUsersForUser(req.user, users.filter(u => u.status === "approved"));
  const userIds = new Set(visibleUsers.map(u => u.id));
  const visibleDocs = docs.filter(d => !d.driverId || userIds.has(d.driverId) || req.user.role === "admin");
  const myNotifications = notifications.filter(n => n.toUserId === req.user.sub || n.userId === req.user.sub || (n.role && n.role === req.user.role));
  res.json({
    ok: true,
    at: new Date().toISOString(),
    role: req.user.role,
    metrics: {
      activeLoads: visibleLoads.filter(l => !["delivered", "closed", "cancelled"].includes(String(l.status || "").toLowerCase())).length,
      deliveredLoads: visibleLoads.filter(l => ["delivered", "closed"].includes(String(l.status || "").toLowerCase())).length,
      drivers: visibleUsers.filter(u => u.role === "driver").length,
      dispatchers: req.user.role === "admin" ? users.filter(u => u.role === "dispatcher" && u.status === "approved").length : 0,
      documents: visibleDocs.length,
      unreadNotifications: myNotifications.filter(n => !n.readAt && !n.read).length
    },
    timeline: auditRows.slice(-25).reverse(),
    notifications: myNotifications.slice(-10).reverse(),
    loads: visibleLoads.slice(-10).reverse()
  });
});

export default router;
