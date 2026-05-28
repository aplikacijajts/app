import { updateJson } from "./jsonStore.js";
import { uid } from "../utils/id.js";
import { emitRealtime } from "./realtime.js";

export async function createNotification({ userId = null, role = null, companyId = "default", title, message, type = "info", meta = {} }) {
  const item = {
    id: uid("ntf"),
    userId,
    role,
    companyId,
    title,
    message,
    type,
    meta,
    read: false,
    createdAt: new Date().toISOString()
  };
  await updateJson("notifications.json", (arr) => (arr.push(item), arr));
  emitRealtime("notification:new", item, companyId ? `company:${companyId}` : null);
  return item;
}
