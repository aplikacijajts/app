import { api, getToken } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    // Ensure the Service Worker becomes active
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.error("SW register failed", e);
    return null;
  }
}

async function subscribeIfPossible({ forcePrompt=false } = {}) {
  const token = getToken();
  if (!token) return { ok:false, reason:"not_logged_in" };

  // Web Push requires HTTPS (except localhost)
  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (location.protocol !== "https:" && !isLocalhost) {
    return { ok:false, reason:"requires_https" };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok:false, reason:"not_supported" };
  }

  const reg = await registerSW();
  if (!reg) return { ok:false, reason:"sw_failed" };

  // If not granted, optionally prompt
  if (Notification.permission !== "granted") {
    if (!forcePrompt) return { ok:false, reason:"not_granted" };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok:false, reason:"denied" };
  }

  // Get VAPID public key
  const { publicKey } = await api("/api/push/public-key");
  if (!publicKey) return { ok:false, reason:"missing_vapid" };
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  await api("/api/push/subscribe", { method:"POST", body: sub });
  // quick sanity check (optional)
  try { await api("/api/push/status"); } catch {}
  return { ok:true };
}

function ensureBanner() {
  if (document.getElementById("pushBanner")) return;

  const el = document.createElement("div");
  el.id = "pushBanner";
  el.className = "fixed bottom-4 right-4 bg-white border shadow-lg rounded-lg p-4 w-[320px] z-50";
  el.innerHTML = `
    <div class="font-semibold mb-1">Enable notifications</div>
    <div class="text-sm text-gray-600 mb-3">Get alerts for new loads, bids and updates.</div>
    <div class="flex gap-2">
      <button id="pushEnableBtn" class="jts-btn px-3 py-2 rounded text-sm flex-1">Enable</button>
      <button id="pushLaterBtn" class="px-3 py-2 rounded text-sm border flex-1">Later</button>
    </div>
    <div id="pushError" class="mt-3 text-xs text-red-600 hidden"></div>
  `;
  document.body.appendChild(el);

  document.getElementById("pushLaterBtn").onclick = () => el.remove();
  document.getElementById("pushEnableBtn").onclick = async () => {
    document.getElementById("pushEnableBtn").disabled = true;
    document.getElementById("pushEnableBtn").textContent = "Working...";
    try {
      const r = await subscribeIfPossible({ forcePrompt:true });
      if (r.ok) el.remove();
      else {
        const err = document.getElementById("pushError");
        err.classList.remove("hidden");
        err.textContent = explainReason(r.reason);
        document.getElementById("pushEnableBtn").disabled = false;
        document.getElementById("pushEnableBtn").textContent = "Enable";
      }
    } catch (e) {
      console.error("Push subscribe failed", e);
      const err = document.getElementById("pushError");
      err.classList.remove("hidden");
      err.textContent = (e?.message && String(e.message).length<160) ? e.message : "Failed to enable notifications. Please check your browser settings and try again.";
      document.getElementById("pushEnableBtn").disabled = false;
      document.getElementById("pushEnableBtn").textContent = "Enable";
    }
  };
}

function explainReason(reason) {
  switch (reason) {
    case "requires_https":
      return "Web Push requires HTTPS (or localhost). Open the site using https://";
    case "not_supported":
      return "This browser does not support Web Push notifications.";
    case "sw_failed":
      return "Service Worker failed to register. Try hard refresh (Ctrl+F5) or check DevTools > Application > Service Workers.";
    case "denied":
      return "Notifications were blocked. Enable them in your browser site settings.";
    case "missing_vapid":
      return "Server is missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.";
    default:
      return "Failed to enable notifications. Please check your browser settings and try again.";
  }
}

export async function initPushUI() {
  const token = getToken();
  if (!token) return;

  // If already granted, auto-subscribe silently (best effort)
  if (Notification?.permission === "granted") {
    try { await subscribeIfPossible({ forcePrompt:false }); } catch {}
    return;
  }

  // Not granted yet -> show banner (only on role pages)
  ensureBanner();
}

export async function sendTestPush() {
  return api("/api/push/test", { method:"POST", body:{ body:"Test from UI ✅" }});
}
