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
