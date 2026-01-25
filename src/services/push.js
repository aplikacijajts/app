import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { readJson, updateJson } from "./jsonStore.js";

let initialized = false;

function initFirebase() {
  if (initialized) return;

  // Option A: env contains JSON string
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;

  // Option B: env contains path to json file (local dev)
  const fromPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  let serviceAccount = null;

  if (fromEnv && fromEnv.trim()) {
    try {
      serviceAccount = JSON.parse(fromEnv);
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
  } else if (fromPath && fromPath.trim()) {
    const abs = path.resolve(fromPath);
    if (!fs.existsSync(abs)) throw new Error(`Service account file not found: ${abs}`);
    serviceAccount = JSON.parse(fs.readFileSync(abs, "utf8"));
  } else {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  initialized = true;
}

// Save token for a user (avoid duplicates, keep last 20)
export async function savePushToken({ userId, token, platform }) {
  if (!token) return;

  await updateJson("users.json", (arr) => {
    const u = arr.find(x => x.id === userId);
    if (!u) return arr;

    u.pushTokens = Array.isArray(u.pushTokens) ? u.pushTokens : [];
    // remove if already exists
    u.pushTokens = u.pushTokens.filter(t => t.token !== token);

    u.pushTokens.unshift({
      token,
      platform: platform || null,
      addedAt: new Date().toISOString(),
    });

    // keep max 20 tokens per user
    u.pushTokens = u.pushTokens.slice(0, 20);
    return arr;
  });
}

// Find users by roles
export async function getUsersByRoles(roles = []) {
  const users = await readJson("users.json");
  return (users || []).filter(u => roles.includes(u.role) && u.status === "approved");
}

// Find user by id
export async function getUserById(userId) {
  const users = await readJson("users.json");
  return (users || []).find(u => u.id === userId);
}

function extractTokens(users) {
  const tokens = [];
  for (const u of users) {
    const arr = Array.isArray(u.pushTokens) ? u.pushTokens : [];
    for (const t of arr) {
      if (t?.token) tokens.push({ token: t.token, userId: u.id });
    }
  }
  // unique tokens
  const uniq = new Map();
  for (const t of tokens) uniq.set(t.token, t.userId);
  return Array.from(uniq.keys()).map(token => ({ token, userId: uniq.get(token) }));
}

// Send push to token list
export async function sendPushToTokens({ tokens, title, body, data = {} }) {
  if (!tokens?.length) return { ok: true, sent: 0 };

  initFirebase();

  const messages = tokens.map(t => ({
    token: t.token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])),
  }));

  const res = await admin.messaging().sendEach(messages);

  // Remove invalid tokens
  const invalid = [];
  res.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalid.push(messages[idx].token);
      }
    }
  });

  if (invalid.length) {
    await updateJson("users.json", (arr) => {
      for (const u of arr) {
        if (!Array.isArray(u.pushTokens)) continue;
        u.pushTokens = u.pushTokens.filter(t => !invalid.includes(t.token));
      }
      return arr;
    });
  }

  return { ok: true, sent: tokens.length, firebase: res };
}

// Convenience: send push to roles
export async function sendPushToRoles({ roles, title, body, data = {} }) {
  const users = await getUsersByRoles(roles);
  const tokens = extractTokens(users);
  return sendPushToTokens({ tokens, title, body, data });
}

// Convenience: send push to a single user
export async function sendPushToUser({ userId, title, body, data = {} }) {
  const u = await getUserById(userId);
  if (!u) return { ok: true, sent: 0 };
  const tokens = extractTokens([u]);
  return sendPushToTokens({ tokens, title, body, data });
}
