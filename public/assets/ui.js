export function token() {
  return localStorage.getItem("token") || "";
}

export function buildDocUrl(docId, mode="view") {
  const t = token();
  const base = `/api/documents/${docId}/file`;
  const params = new URLSearchParams();
  if (t) params.set("token", t);
  if (mode === "download") params.set("dl", "1");
  return base + "?" + params.toString();
}

export function ensurePreviewModal() {
  if (document.getElementById("jtsPreviewModal")) return;

  const modal = document.createElement("div");
  modal.id = "jtsPreviewModal";
  modal.className = "fixed inset-0 bg-black/60 hidden items-center justify-center p-4 z-50";
  modal.innerHTML = `
    <div class="bg-white rounded-lg w-full max-w-5xl overflow-hidden shadow-xl">
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <div class="flex items-center gap-3">
          <img src="/assets/jts-logo.png" class="h-8" alt="JTS">
          <div>
            <div class="font-semibold" id="jtsPreviewTitle">Document Preview</div>
            <div class="text-xs text-gray-500" id="jtsPreviewSub">Preview</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a id="jtsPreviewDownload" class="px-3 py-2 rounded text-sm jts-btn" href="#" target="_blank" rel="noopener">Download</a>
          <button id="jtsPreviewClose" class="px-3 py-2 rounded border text-sm">Close</button>
        </div>
      </div>
      <div class="bg-gray-50" style="height:75vh">
        <iframe id="jtsPreviewFrame" class="w-full h-full" src="about:blank"></iframe>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.getElementById("jtsPreviewFrame").src = "about:blank";
  };

  document.getElementById("jtsPreviewClose").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

export function openPreview({ docId, title="Document Preview", subtitle="" }) {
  ensurePreviewModal();
  const modal = document.getElementById("jtsPreviewModal");
  const frame = document.getElementById("jtsPreviewFrame");
  const ttl = document.getElementById("jtsPreviewTitle");
  const sub = document.getElementById("jtsPreviewSub");
  const dl = document.getElementById("jtsPreviewDownload");

  ttl.textContent = title;
  sub.textContent = subtitle || "";

  const viewUrl = buildDocUrl(docId, "view");
  const downloadUrl = buildDocUrl(docId, "download");
  frame.src = viewUrl;
  dl.href = downloadUrl;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// Realtime notifications (SSE)
let _notifInit = false;

export function initNotifications() {
  if (_notifInit) return;
  _notifInit = true;

  const token = localStorage.getItem("token") || "";
  if (!token) return;

  // Toast container
  let wrap = document.getElementById("jtsToasts");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "jtsToasts";
    wrap.className = "fixed bottom-4 right-4 z-50 space-y-2";
    document.body.appendChild(wrap);
  }

  const toast = (t, msg) => {
    const el = document.createElement("div");
    el.className = "bg-white border shadow-lg rounded-lg px-4 py-3 max-w-sm";
    el.innerHTML = `<div class="font-semibold text-sm">${escapeHtml(t || "Notification")}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(msg || "")}</div>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };

  // Connect SSE
  try {
    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("notification", (ev) => {
      try {
        const n = JSON.parse(ev.data || "{}") || {};
        toast(n.title, n.message);
      } catch {
        toast("Notification", ev.data);
      }
    });
  } catch {
    // ignore
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
