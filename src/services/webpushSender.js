import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBS_FILE = path.join(__dirname, "..", "..", "data", "push-subs.json");

let webpush = null;
let configured = false;

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

async function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;

  const wp = await loadWebPush();
  if (!wp) return false;

  wp.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@jtslogistics.net",
    pub,
    priv
  );
  configured = true;
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

const DEBUG_PUSH = process.env.DEBUG_PUSH === "1";

export async function sendPushToUser(userKey, payloadObj) {
  if (!userKey) return;
  const ready = await ensureConfigured();
  if (!ready) return;

  const subs = readSubs();
  if (DEBUG_PUSH) {
    const c = subs.filter(s => s.userKey === userKey).length;
    console.log(`[webpush] user ${userKey}: ${c} subscription(s)`);
  }

  const alive = [];
  for (const s of subs) {
    if (s.userKey !== userKey) {
      alive.push(s);
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payloadObj));
      alive.push(s);
    } catch (err) {
      if (![404, 410].includes(err?.statusCode)) alive.push(s);
    }
  }
  writeSubs(alive);
}
