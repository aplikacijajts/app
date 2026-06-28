import { api, getToken } from "./api.js";

const CONTEXT = location.pathname.split("/").pop() || "loads";
const STORE_KEY = `jts-load-draft:${CONTEXT}`;
const FIELD_TARGETS = {
  loadNumber: ["newLoadNumber", "loadNumber"],
  customer: ["newCustomer", "customer"],
  driverId: ["newDriverId", "driverId"],
  pickup: ["newPickup", "pickup"],
  delivery: ["newDelivery", "delivery"],
  rate: ["newRate", "rate"],
  notes: ["newNotes", "notes"]
};

function ready(fn) {
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn();
}
function $(sel, root = document) { return root.querySelector(sel); }
function all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function readLocal() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}
function writeLocal(draft) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(draft || {})); } catch {}
}
function getDraftFields(panel) {
  return all("[data-load-draft]", panel).reduce((map, el) => {
    map[el.dataset.loadDraft] = el;
    return map;
  }, {});
}
function targetFor(key) {
  for (const id of FIELD_TARGETS[key] || []) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}
function currentFromPanel(panel) {
  const out = {};
  all("[data-load-draft]", panel).forEach(el => { out[el.dataset.loadDraft] = el.value || ""; });
  return out;
}
function fillPanel(panel, draft = {}) {
  const fields = getDraftFields(panel);
  Object.entries(fields).forEach(([key, el]) => {
    if (draft[key] != null) el.value = draft[key];
  });
}
function fillTargets(draft = {}, onlyEmpty = false) {
  Object.entries(draft).forEach(([key, value]) => {
    const target = targetFor(key);
    if (!target) return;
    if (onlyEmpty && target.value) return;
    target.value = value || "";
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function pullTargetsIntoPanel(panel) {
  const fields = getDraftFields(panel);
  Object.keys(fields).forEach(key => {
    const target = targetFor(key);
    if (target && target.value && !fields[key].value) fields[key].value = target.value;
  });
}
function status(panel, text, kind = "") {
  const el = $("[data-load-draft-status]", panel);
  if (!el) return;
  el.textContent = text || "";
  el.dataset.state = kind;
}

function cleanValue(v) { return String(v || "").replace(/^[#:\-\s]+/, "").replace(/\s+/g, " ").trim(); }
function pick(patterns, text) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return cleanValue(m[1]);
  }
  return "";
}
function parseItsText(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const one = raw.replace(/\n+/g, " | ");
  const out = {
    loadNumber: pick([new RegExp("(?:load\\s*(?:no\\.?|number|#)?|pro\\s*(?:no\\.?|number|#)?)\\s*[:#-]?\\s*([A-Z0-9-]{3,})", "i"), new RegExp("(?:ref(?:erence)?\\s*(?:no\\.?|#)?)\\s*[:#-]?\\s*([A-Z0-9-]{3,})", "i")], one),
    customer: pick([new RegExp("(?:customer|broker|shipper)\\s*[:#-]?\\s*([^|\\n]{2,80})", "i")], one),
    pickup: pick([new RegExp("(?:pickup|pick\\s*up|origin|from)\\s*[:#-]?\\s*([^|\\n]{2,120})", "i")], one),
    delivery: pick([new RegExp("(?:delivery|deliver|destination|drop\\s*off|to)\\s*[:#-]?\\s*([^|\\n]{2,120})", "i")], one),
    rate: pick([new RegExp("(?:rate|pay|price|amount)\\s*[:#-]?\\s*\\$?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)", "i")], one),
    notes: raw.trim()
  };
  if ((!out.pickup || !out.delivery) && /\s(?:->|→| to )\s/i.test(one)) {
    const m = one.match(/([^|]{3,80})\s(?:->|→| to )\s([^|]{3,80})/i);
    if (m) { out.pickup = out.pickup || cleanValue(m[1]); out.delivery = out.delivery || cleanValue(m[2]); }
  }
  Object.keys(out).forEach(k => { if (!out[k]) delete out[k]; });
  return out;
}
function applyDraftToPanel(panel, draft, overwrite = true) {
  const fields = getDraftFields(panel);
  Object.entries(draft || {}).forEach(([key, value]) => {
    const el = fields[key];
    if (!el) return;
    if (!overwrite && el.value) return;
    el.value = value || "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function debounce(fn, wait = 500) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
async function saveRemote(panel) {
  if (!getToken()) return;
  const draft = currentFromPanel(panel);
  writeLocal(draft);
  status(panel, "Saving draft...", "saving");
  try {
    await api("/api/loads/draft", { method: "PUT", body: { context: CONTEXT, draft } });
    status(panel, "Draft saved", "ok");
  } catch (err) {
    status(panel, "Local draft saved", "warn");
  }
}
async function loadRemote(panel) {
  const local = readLocal();
  fillPanel(panel, local);
  pullTargetsIntoPanel(panel);
  if (!getToken()) return;
  try {
    const data = await api(`/api/loads/draft?context=${encodeURIComponent(CONTEXT)}`);
    if (data?.draft && Object.keys(data.draft).length) {
      fillPanel(panel, { ...local, ...data.draft });
      writeLocal({ ...local, ...data.draft });
    }
  } catch {}
  fillTargets(currentFromPanel(panel), true);
}
function initDriverOptions(panel) {
  const captureDriver = panel.querySelector('[data-load-draft="driverId"]');
  const source = targetFor("driverId");
  if (!captureDriver || !source || captureDriver.tagName !== "SELECT") return;
  const copy = () => {
    const current = captureDriver.value;
    captureDriver.innerHTML = source.innerHTML;
    if (current) captureDriver.value = current;
  };
  copy();
  new MutationObserver(copy).observe(source, { childList: true, subtree: true });
}
function bindTargetBackfill(panel, saveDebounced) {
  Object.keys(FIELD_TARGETS).forEach(key => {
    const target = targetFor(key);
    const field = panel.querySelector(`[data-load-draft="${key}"]`);
    if (!target || !field) return;
    ["input", "change"].forEach(evt => target.addEventListener(evt, () => {
      field.value = target.value || "";
      writeLocal(currentFromPanel(panel));
      saveDebounced(panel);
    }));
  });
}
function bindPostMessage(panel, saveDebounced) {
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    const payload = data.payload || data.draft || data.load || null;
    if (!payload || (data.type && !String(data.type).includes("load"))) return;
    fillPanel(panel, payload);
    fillTargets(currentFromPanel(panel), false);
    writeLocal(currentFromPanel(panel));
    saveDebounced(panel);
  });
}
function initPanel(panel) {
  const saveDebounced = debounce(saveRemote, 650);
  const auto = $("[data-load-draft-auto]", panel);
  initDriverOptions(panel);
  loadRemote(panel).then(() => status(panel, "Draft ready", "ok"));

  all("[data-load-draft]", panel).forEach(el => {
    ["input", "change"].forEach(evt => el.addEventListener(evt, () => {
      const draft = currentFromPanel(panel);
      writeLocal(draft);
      if (!auto || auto.checked) fillTargets(draft, false);
      saveDebounced(panel);
    }));
  });

  const rawBox = $("[data-load-draft-raw]", panel);
  const parseBtn = $("[data-load-draft-parse]", panel);
  const pasteBtn = $("[data-load-draft-paste]", panel);
  const runParse = () => {
    if (!rawBox) return;
    const parsed = parseItsText(rawBox.value || "");
    if (!Object.keys(parsed).length) { status(panel, "No load data detected yet", "warn"); return; }
    applyDraftToPanel(panel, parsed, true);
    const draft = currentFromPanel(panel);
    writeLocal(draft);
    if (!auto || auto.checked) fillTargets(draft, false);
    saveDebounced(panel);
    status(panel, "ITS data mirrored to Create Load", "ok");
  };
  if (rawBox) rawBox.addEventListener("input", debounce(runParse, 450));
  if (parseBtn) parseBtn.addEventListener("click", runParse);
  if (pasteBtn) pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      rawBox.value = text || rawBox.value || "";
      runParse();
    } catch (err) {
      status(panel, "Clipboard blocked by browser. Paste manually with Ctrl+V / long press Paste.", "warn");
    }
  });

  const copyBtn = $("[data-load-draft-copy]", panel);
  if (copyBtn) copyBtn.addEventListener("click", () => {
    fillTargets(currentFromPanel(panel), false);
    saveRemote(panel);
    status(panel, "Copied to Create Load", "ok");
  });

  const clearBtn = $("[data-load-draft-clear]", panel);
  if (clearBtn) clearBtn.addEventListener("click", () => {
    all("[data-load-draft]", panel).forEach(el => { el.value = ""; });
    writeLocal({});
    saveRemote(panel);
    status(panel, "Draft cleared", "ok");
  });

  bindTargetBackfill(panel, saveDebounced);
  bindPostMessage(panel, saveDebounced);
}

ready(() => {
  all(".jts-load-draft-panel").forEach(initPanel);
});
