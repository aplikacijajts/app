import fs from "fs";
import path from "path";
import webpush from "web-push";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stored in projectRoot/data/push-subs.json
const SUBS_FILE = path.join(__dirname, "..", "..", "data", "push-subs.json");

let _configured = false;

function ensureConfigured() {
  if (_configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    pub,
    priv
  );
  _configured = true;
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
  if (!ensureConfigured()) return;

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
      // 404/410 = gone
      if (![404, 410].includes(err?.statusCode)) alive.push(s);
    }
  }

  writeSubs(alive);
}
