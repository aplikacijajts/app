import { uid } from "../utils/id.js";
import { readJson, updateJson } from "./jsonStore.js";
import { sendPushToUser } from "./webpushSender.js";

// In-memory SSE clients per user
const clients = new Map(); // userId -> Set(res)

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

async function emitToUser(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const eventName = payload?.event || 'notification';
  const data = `event: ${eventName}
data: ${JSON.stringify(payload)}

`;
  for (const res of set) {
    try { res.write(data); } catch { /* ignore */ }
  }
}

async function createNotification({ toUserId, type, title, message, data }) {
  const n = {
    id: uid("n"),
    toUserId,
    type: type || "info",
    title: title || "Notification",
    message: message || "",
    data: data || null,
    createdAt: new Date().toISOString(),
    readAt: null
  };

  await updateJson("notifications.json", (arr) => {
    arr.push(n);
    return arr;
  });

  await emitToUser(toUserId, { event: "notification", notification: n });

  // Best-effort Web Push (if user has subscribed)
  try {
    await sendPushToUser(toUserId, {
      title: n.title || "Notification",
      body: n.message || "",
      url: (n.data && (n.data.url || n.data.href)) || "/",
      notificationId: n.id,
      tag: `${n.type || "notification"}:${toUserId}:${n.id}`
    });
  } catch {
    // ignore
  }
  return n;
}

async function notifyUsers(userIds, payload) {
  const uniq = Array.from(new Set((userIds || []).filter(Boolean)));
  const out = [];
  for (const uid of uniq) {
    out.push(await createNotification({ toUserId: uid, ...payload }));
  }
  return out;
}

async function notifyRoles(roles, payload) {
  const users = await readJson("users.json");
  const roleSet = new Set((roles || []).filter(Boolean));
  const ids = users.filter(u => roleSet.has(u.role)).map(u => u.id);
  return notifyUsers(ids, payload);
}

export const notify = {
  addClient,
  removeClient,
  users: notifyUsers,
  roles: notifyRoles,
};
