import { Router } from "express";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stored in projectRoot/data/push-subs.json
const SUBS_FILE = path.join(__dirname, "..", "..", "data", "push-subs.json");

function readSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); }
  catch { return []; }
}

function writeSubs(subs) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

function ensureVapidConfigured() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    pub,
    priv
  );
  return true;
}

// Public key (no auth)
router.get("/public-key", (req, res) => {
  if (!ensureVapidConfigured()) {
    return res.status(500).json({ error: "VAPID keys are not configured on the server" });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Subscribe (auth required) - store one active subscription per user
router.post("/subscribe", requireAuth, (req, res) => {
  if (!ensureVapidConfigured()) {
    return res.status(500).json({ ok: false, error: "VAPID keys are not configured on the server" });
  }
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ ok: false, error: "Invalid subscription" });
  }

  // Your JWT payload uses { sub: user.id, role, companyId, name }
  const userKey = req.user?.sub;
  if (!userKey) return res.status(400).json({ ok: false, error: "Token missing sub" });

  const subs = readSubs();

  // Remove duplicates (same endpoint or same user)
  const filtered = subs.filter(s => s.endpoint !== sub.endpoint && s.userKey !== userKey);

  filtered.push({
    userKey,
    endpoint: sub.endpoint,
    keys: sub.keys,
    createdAt: new Date().toISOString()
  });

  writeSubs(filtered);
  res.json({ ok: true });
});

// Optional: Unsubscribe
// Debug: subscription status for current user (auth required)
router.get("/status", requireAuth, (req, res) => {
  const userKey = req.user?.sub;
  const subs = readSubs();
  const mine = subs.filter(s => s.userKey === userKey);
  res.json({ ok: true, userKey, subscriptions: mine.length });
});

 (auth required)
router.post("/unsubscribe", requireAuth, (req, res) => {
  const userKey = req.user?.sub;
  const subs = readSubs().filter(s => s.userKey !== userKey);
  writeSubs(subs);
  res.json({ ok: true });
});

// Test push to current user (auth required)
router.post("/test", requireAuth, async (req, res) => {
  if (!ensureVapidConfigured()) {
    return res.status(500).json({ ok: false, error: "VAPID keys are not configured on the server" });
  }
  const userKey = req.user?.sub;

  const payload = JSON.stringify({
    title: "JTS Notification",
    body: req.body?.body || "This is a test push notification for the logged-in user ✅",
    url: req.body?.url || "/"
  });

  const subs = readSubs();
  const alive = [];

  for (const s of subs) {
    if (s.userKey !== userKey) { alive.push(s); continue; }

    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      alive.push(s);
    } catch (err) {
      // 404/410 = gone
      if (![404, 410].includes(err?.statusCode)) alive.push(s);
    }
  }

  writeSubs(alive);
  res.json({ ok: true });
});

export default router;
