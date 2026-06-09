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
let lastVapidSignature = "";

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

function cleanKey(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function vapidKeys() {
  return {
    publicKey: cleanKey(process.env.VAPID_PUBLIC_KEY),
    privateKey: cleanKey(process.env.VAPID_PRIVATE_KEY),
    subject: String(process.env.VAPID_SUBJECT || "mailto:admin@jtslogistics.net").trim()
  };
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
  const { publicKey, privateKey, subject } = vapidKeys();
  if (!publicKey || !privateKey) return { ok: false, reason: "missing_keys" };

  const wp = await loadWebPush();
  if (!wp) return { ok: false, reason: "missing_package" };

  const sig = `${subject}|${publicKey}|${privateKey}`;
  if (!vapidConfigured || lastVapidSignature !== sig) {
    try {
      wp.setVapidDetails(subject, publicKey, privateKey);
    } catch (err) {
      vapidConfigured = false;
      lastVapidSignature = "";
      return { ok: false, reason: "invalid_keys", error: err?.message || "Invalid VAPID keys" };
    }
    vapidConfigured = true;
    lastVapidSignature = sig;
  }
  return { ok: true, webpush: wp, publicKey };
}

function disabledResponse(res, reason, status = 200) {
  return res.status(status).json({
    ok: false,
    enabled: false,
    reason,
    message: reason === "missing_package"
      ? "Server is missing the web-push package. Redeploy after npm install."
      : reason === "invalid_keys"
        ? "Push notifications are disabled because the configured VAPID keys are invalid. Regenerate them and redeploy."
        : "Push notifications are currently disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
    publicKey: null
  });
}

router.get("/public-key", async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res, vapid.reason);
  res.json({ ok: true, enabled: true, publicKey: vapid.publicKey });
});

router.post("/subscribe", requireAuth, async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res, vapid.reason);

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
  res.json({ ok: true, enabled: vapid.ok, reason: vapid.ok ? null : vapid.reason, userKey, subscriptions: mine.length });
});

router.post("/unsubscribe", requireAuth, (req, res) => {
  const userKey = req.user?.sub;
  const subs = readSubs().filter(s => s.userKey !== userKey);
  writeSubs(subs);
  res.json({ ok: true });
});

router.post("/test", requireAuth, async (req, res) => {
  const vapid = await ensureVapidConfigured();
  if (!vapid.ok) return disabledResponse(res, vapid.reason);

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
