import { updateJson } from "./jsonStore.js";
import { uid } from "../utils/id.js";

export async function audit(event, meta = {}) {
  await updateJson("audit.json", (arr) => {
    arr.push({
      id: uid("log"),
      event,
      meta,
      at: new Date().toISOString()
    });
    return arr;
  });
}
