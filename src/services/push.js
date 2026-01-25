import admin from "firebase-admin";
import { readJson } from "./jsonStore.js";
import { readJson as readUsers } from "./jsonStore.js";

let inited = false;

function initFirebase() {
  if (inited) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log("⚠️ FIREBASE_SERVICE_ACCOUNT not set");
    return;
  }

  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  inited = true;
  console.log("✅ Firebase Admin initialized");
}

export async function sendPushToUser({ userId, title, body, data }) {
  initFirebase();
  if (!inited) return;

  const tokens = await readJson("pushTokens.json");
  const mine = (tokens || []).filter(t => t.userId === userId).map(t => t.token);
  if (!mine.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens: mine,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data || {}).map(([k,v]) => [k, String(v)]))
  });
}

export async function sendPushToRoles({ roles, title, body, data }) {
  initFirebase();
  if (!inited) return;

  const users = await readUsers("users.json");
  const allowed = new Set((users || []).filter(u => roles.includes(u.role)).map(u => u.id));

  const tokens = await readJson("pushTokens.json");
  const list = (tokens || []).filter(t => allowed.has(t.userId)).map(t => t.token);
  if (!list.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens: list,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data || {}).map(([k,v]) => [k, String(v)]))
  });
}
