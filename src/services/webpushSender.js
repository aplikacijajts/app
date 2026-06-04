import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBS_FILE = path.join(__dirname, "..", "..", "data", "push-subs.json");

let webpush = null;
let configured = false;
let lastSignature = "";

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

async function ensureConfigured() {
  const pub = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const priv = cleanKey(process.env.VAPID_PRIVATE_KEY);
  const subject = String(process.env.VAPID_SUBJECT || "mailto:admin@jtslogistics.net").trim();
  if (!pub || !priv) return false;

  const wp = await loadWebPush();
  if (!wp) return false;

  const sig = `${subject}|${pub}|${priv}`;
  if (!configured || sig !== lastSignature) {
    wp.setVapidDetails(subject, pub, priv);
    configured = true;
    lastSignature = sig;
  }
  return true;
}

function readSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); }
  catch { return []; }
}

function writeSubs(subs) {
  fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

function uniqueSubs(subs) {
  const seen = new Set();
  const out = [];
  for (const sub of subs || []) {
    const key = `${sub.userKey || ""}|${sub.endpoint || ""}`;
    if (!sub.userKey || !sub.endpoint || seen.has(key)) continue;
    seen.add(key);
    out.push(sub);
  }
  return out;
}

const DEBUG_PUSH = process.env.DEBUG_PUSH === "1";

export async function sendPushToUser(userKey, payloadObj) {
  if (!userKey) return;
  const ready = await ensureConfigured();
  if (!ready) return;

  const subs = uniqueSubs(readSubs());
  if (DEBUG_PUSH) {
    const c = subs.filter(s => s.userKey === userKey).length;
    console.log(`[webpush] user ${userKey}: ${c} unique subscription(s)`);
  }

  const alive = [];
  const sentEndpoints = new Set();
  for (const s of subs) {
    if (s.userKey !== userKey) {
      alive.push(s);
      continue;
    }
    if (sentEndpoints.has(s.endpoint)) {
      alive.push(s);
      continue;
    }
    try {
      sentEndpoints.add(s.endpoint);
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payloadObj));
      alive.push(s);
    } catch (err) {
      if (![404, 410].includes(err?.statusCode)) alive.push(s);
    }
  }
  writeSubs(alive);
}
