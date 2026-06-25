import { api, getToken } from "./api.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["confirmationNumber", "confirmationDate", "loadNumber", "customer", "brokerName", "contactName", "contactPhone", "contactEmail", "pickup", "delivery", "driverName", "truckNumber", "trailerNumber", "rate", "commodity", "weight", "pickupDate", "deliveryDate", "notes"];
const DRAFT_KEY = "jts-confirmation-draft";

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
}
function tokenQuery() {
  return `token=${encodeURIComponent(getToken() || "")}`;
}
function setStatus(text, state = "") {
  const el = $("confirmationStatus");
  if (el) { el.textContent = text || ""; el.dataset.state = state; }
}
function getFormData() {
  return FIELDS.reduce((out, key) => {
    const el = $(key);
    out[key] = el ? el.value.trim() : "";
    return out;
  }, {});
}
function setFormData(data = {}) {
  FIELDS.forEach(key => { const el = $(key); if (el && data[key] != null) el.value = data[key] || ""; });
}
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(getFormData())); } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (d) setFormData(d);
  } catch {}
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function renderPreview(row) {
  const data = row || getFormData();
  const pairs = [
    ["Confirmation No.", data.confirmationNumber], ["Date", data.confirmationDate], ["Load Number", data.loadNumber], ["Customer", data.customer], ["Broker", data.brokerName], ["Contact", [data.contactName, data.contactPhone, data.contactEmail].filter(Boolean).join(" • ")], ["Pickup", data.pickup], ["Delivery", data.delivery], ["Driver", data.driverName], ["Truck / Trailer", [data.truckNumber && `Truck ${data.truckNumber}`, data.trailerNumber && `Trailer ${data.trailerNumber}`].filter(Boolean).join(" • ")], ["Rate", data.rate], ["Commodity", data.commodity], ["Weight", data.weight], ["Pickup Date/Time", data.pickupDate], ["Delivery Date/Time", data.deliveryDate]
  ].filter(([,v]) => String(v || "").trim());
  const notes = data.notes ? `<div class="jts-confirm-notes"><b>Special instructions</b><p>${esc(data.notes)}</p></div>` : "";
  $("confirmationPreview").innerHTML = `
    <div class="jts-confirm-doc">
      <div class="jts-confirm-doc-head"><img src="/assets/jts-logo.png" alt="JTS"><div><b>JTS LOGISTICS INC</b><span>Professional Load Confirmation</span></div></div>
      <h2>Rate / Load Confirmation</h2>
      <div class="jts-confirm-rows">${pairs.map(([label, value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("")}</div>
      ${notes}
      <div class="jts-confirm-footer">Generated electronically from JTS Logistics Portal</div>
    </div>`;
}
async function loadHistory() {
  const list = $("confirmationsList");
  if (!list) return;
  try {
    const rows = await api("/api/confirmations");
    if (!rows.length) { list.innerHTML = `<div class="text-sm text-slate-500">No confirmations generated yet.</div>`; return; }
    list.innerHTML = rows.slice(0, 8).map(r => `<button type="button" class="jts-history-item" data-id="${esc(r.id)}"><b>${esc(r.confirmationNumber || r.loadNumber || r.id)}</b><span>${esc([r.customer, r.pickup && r.delivery ? `${r.pickup} → ${r.delivery}` : ""].filter(Boolean).join(" • "))}</span></button>`).join("");
    list.querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", async () => {
      const data = await api(`/api/confirmations/${encodeURIComponent(btn.dataset.id)}`);
      if (data?.confirmation) {
        setFormData(data.confirmation);
        renderGenerated(data.confirmation);
      }
    }));
  } catch (err) {
    list.innerHTML = `<div class="text-sm text-red-600">${esc(err.message || "Could not load confirmations")}</div>`;
  }
}
function renderGenerated(row) {
  renderPreview(row);
  const pdfUrl = `/api/confirmations/${encodeURIComponent(row.id)}/pdf?${tokenQuery()}`;
  const previewFrame = $("pdfPreview");
  if (previewFrame) previewFrame.src = pdfUrl;
  const box = $("pdfBox");
  if (box) box.classList.remove("hidden");
  const download = $("downloadPdf");
  if (download) {
    download.href = `${pdfUrl}&download=1`;
    download.setAttribute("download", `JTS-confirmation-${row.confirmationNumber || row.id}.pdf`);
  }
  setStatus("Confirmation generated", "ok");
}
async function generate() {
  const body = getFormData();
  if (!body.loadNumber && !body.customer && !body.pickup && !body.delivery) {
    setStatus("Enter load number, customer, pickup or delivery first.", "error");
    return;
  }
  setStatus("Generating PDF...", "saving");
  saveDraft();
  try {
    const res = await api("/api/confirmations", { method: "POST", body });
    renderGenerated(res.confirmation);
    await loadHistory();
  } catch (err) {
    setStatus(err.message || "Could not generate confirmation", "error");
  }
}
function init() {
  if (!getToken()) location.href = "/index.html";
  const date = $("confirmationDate");
  if (date && !date.value) date.value = today();
  const no = $("confirmationNumber");
  if (no && !no.value) no.value = `JTS-${Date.now().toString().slice(-8)}`;
  loadDraft();
  renderPreview();
  FIELDS.forEach(key => $(key)?.addEventListener("input", () => { saveDraft(); renderPreview(); }));
  $("generateConfirmation")?.addEventListener("click", generate);
  $("clearConfirmation")?.addEventListener("click", () => {
    FIELDS.forEach(key => { const el = $(key); if (el) el.value = ""; });
    if (date) date.value = today();
    if (no) no.value = `JTS-${Date.now().toString().slice(-8)}`;
    saveDraft();
    renderPreview();
    setStatus("Draft cleared", "ok");
  });
  loadHistory();
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
