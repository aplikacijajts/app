import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBS_FILE = path.join(__dirname, "..", "..", "data", "push-subs.json");

let webpush = null;
let vapidConfigured = false;

async function loadWebPush() {
  if (webpush) return webpush;
  try {
    const mod = await import("web-push");
    webpush = mod.default || mod;
    return webpush;
  } catch {
    return null;
  }
}

function readSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); }
  catch { return []; }
}

function writeSubs(subs) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

async function ensureVapidConfigured() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { ok: false, reason: "missing_keys" };

  const wp = await loadWebPush();
  if (!wp) return { ok: false, reason: "missing_package" };

  if (!vapidConfigured) {
    wp.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@jtslogistics.net",
      pub,
      priv
    );
    vapidConfigured = true;
  }
  return { ok: true, webpush: wp };
}

function disabledResponse(res, status = 200) {
  return res.status(status).json({
    ok: false,
    enabled: false,
    message: "Push notifications are currently disabled. The application is fully usable without push notifications.",
    publicKey: null
  });
}

router.get("/public-key", async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res);
  res.json({ ok: true, enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/subscribe", requireAuth, async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res);

  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ ok: false, error: "Invalid subscription" });
  }

  const userKey = req.user?.sub;
  if (!userKey) return res.status(400).json({ ok: false, error: "Token missing sub" });

  const subs = readSubs();
  const filtered = subs.filter(s => s.endpoint !== sub.endpoint && s.userKey !== userKey);
  filtered.push({ userKey, endpoint: sub.endpoint, keys: sub.keys, createdAt: new Date().toISOString() });
  writeSubs(filtered);
  res.json({ ok: true, enabled: true });
});

router.get("/status", requireAuth, async (req, res) => {
  const vapid = await ensureVapidConfigured();
  const userKey = req.user?.sub;
  const subs = readSubs();
  const mine = subs.filter(s => s.userKey === userKey);
  res.json({ ok: true, enabled: vapid.ok, userKey, subscriptions: mine.length });
});

router.post("/unsubscribe", requireAuth, (req, res) => {
  const userKey = req.user?.sub;
  const subs = readSubs().filter(s => s.userKey !== userKey);
  writeSubs(subs);
  res.json({ ok: true });
});

router.post("/test", requireAuth, async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res);

  const userKey = req.user?.sub;
  const payload = JSON.stringify({
    title: "JTS Notification",
    body: req.body?.body || "Test push notification",
    url: req.body?.url || "/"
  });

  const subs = readSubs();
  const alive = [];

  for (const s of subs) {
    if (s.userKey !== userKey) { alive.push(s); continue; }
    try {
      await vapid.webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      alive.push(s);
    } catch (err) {
      if (![404, 410].includes(err?.statusCode)) alive.push(s);
    }
  }

  writeSubs(alive);
  res.json({ ok: true, enabled: true });
});

export default router;
