import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { readJson } from "../services/jsonStore.js";

const router = express.Router();
router.use(requireAuth);

router.get("/dashboard", async (req, res) => {
  const [loads, users, docs, notifications, audit] = await Promise.all([
    readJson("loads.json"), readJson("users.json"), readJson("documents.json"), readJson("notifications.json"), readJson("audit.json")
  ]);

  const companyId = req.user.companyId || "default";
  const visibleLoads = loads.filter(x => !x.companyId || x.companyId === companyId);
  const visibleUsers = users.filter(x => !x.companyId || x.companyId === companyId);
  const visibleDocs = docs.filter(x => !x.companyId || x.companyId === companyId);
  const unread = notifications.filter(n => !n.read && (!n.companyId || n.companyId === companyId));

  res.json({
    ok: true,
    at: new Date().toISOString(),
    metrics: {
      activeLoads: visibleLoads.filter(l => !["delivered","closed","cancelled"].includes(String(l.status || "").toLowerCase())).length,
      drivers: visibleUsers.filter(u => u.role === "driver" && u.status === "approved").length,
      dispatchers: visibleUsers.filter(u => u.role === "dispatcher" && u.status === "approved").length,
      documents: visibleDocs.length,
      unreadNotifications: unread.length
    },
    timeline: audit.slice(-25).reverse(),
    notifications: unread.slice(-10).reverse(),
    loads: visibleLoads.slice(-10).reverse()
  });
});

export default router;
