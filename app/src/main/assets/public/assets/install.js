// PWA Install UX (Android install prompt + iOS instructions)
// Shows on every visit until the app is installed (standalone display-mode).

function isIOS() {
  const ua = navigator.userAgent || "";
  const iOSUA = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ sometimes reports as Macintosh
  const iPadOS = (navigator.platform === "MacIntel" && navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
  return iOSUA || iPadOS;
}

function isAppInstalled() {
  const standaloneDisplay = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = window.navigator.standalone === true;
  return standaloneDisplay || iosStandalone;
}

function isMobileDevice() {
  const ua = (navigator.userAgent || "").toLowerCase();
  return isIOS() || ua.includes("android") || ua.includes("mobile") || ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
}



async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    // ignore
  }
}


function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

function mountBanner({ mode, onInstall } = {}) {
  // mode: "android" | "ios" | "generic"
  if (document.getElementById("jts-install-banner")) return;

  const wrapper = el("div", {
    id: "jts-install-banner",
    style: [
      "position:fixed",
      "left:12px",
      "right:12px",
      "bottom:calc(12px + env(safe-area-inset-bottom))",
      "z-index:99999",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial",
    ].join(";")
  });

  const card = el("div", {
    style: [
      "display:flex",
      "gap:12px",
      "align-items:center",
      "padding:12px 12px",
      "border-radius:16px",
      "background:rgba(11,18,32,.96)",
      "border:1px solid rgba(255,255,255,.10)",
      "box-shadow:0 10px 30px rgba(0,0,0,.35)",
      "color:#fff"
    ].join(";")
  });

  const logo = el("img", {
    src: "/assets/jts-logo.png",
    alt: "JTS",
    style: "width:44px;height:44px;border-radius:12px;object-fit:contain;background:rgba(255,255,255,.06);padding:6px;"
  });

  const textWrap = el("div", { style:"flex:1;min-width:0" });
  const title = el("div", { style:"font-weight:700;font-size:14px;line-height:1.2;margin-bottom:2px;" }, ["Install JTS App"]);
  const desc = el("div", { style:"opacity:.88;font-size:12px;line-height:1.2" });

  if (mode === "ios") {
    desc.textContent = "On iPhone/iPad: Share → Add to Home Screen.";
  } else if (mode === "android") {
    desc.textContent = "Add it to your home screen for faster access and full-screen mode.";
  } else {
    desc.textContent = "Add it to your home screen for faster access.";
  }

  textWrap.appendChild(title);
  textWrap.appendChild(desc);

  const btn = el("button", {
    type: "button",
    style: [
      "background:#1f6feb",
      "border:0",
      "color:#fff",
      "font-weight:700",
      "padding:10px 12px",
      "border-radius:14px",
      "font-size:13px",
      "cursor:pointer",
      "white-space:nowrap"
    ].join(";")
  }, [mode === "ios" ? "How?" : "Install"]);

  const close = el("button", {
    type:"button",
    "aria-label":"Close",
    style:[
      "background:transparent",
      "border:0",
      "color:rgba(255,255,255,.85)",
      "font-size:18px",
      "padding:6px 8px",
      "cursor:pointer",
      "line-height:1"
    ].join(";")
  }, ["×"]);

  close.addEventListener("click", () => wrapper.remove());

  btn.addEventListener("click", async () => {
    if (mode === "android" && typeof onInstall === "function") {
      await onInstall();
      return;
    }
    // iOS: show a small helper tooltip
    if (mode === "ios") {
      alert("iPhone/iPad:\n1) Tap Share (square with an arrow)\n2) Choose \"Add to Home Screen\"\n3) Confirm Add");
    } else {
      alert("Open your browser menu and choose 'Add to Home Screen' / 'Install app'.");
    }
  });

  card.appendChild(logo);
  card.appendChild(textWrap);
  card.appendChild(btn);
  card.appendChild(close);
  wrapper.appendChild(card);
  document.body.appendChild(wrapper);
}

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  // Android / Chromium browsers
  if (!isMobileDevice()) return; // don't show on desktop
  e.preventDefault();
  deferredPrompt = e;

  if (!isAppInstalled()) {
    mountBanner({
      mode: "android",
      onInstall: async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
      }
    });
  }
});

window.addEventListener("appinstalled", () => {
  const b = document.getElementById("jts-install-banner");
  if (b) b.remove();
});

// On every load, if NOT installed show banner:
// - iOS: always show instructions
// - Android: show a generic banner immediately; if/when beforeinstallprompt fires it will be replaced/kept
window.addEventListener("load", () => {
  if (!isMobileDevice()) return; // don't show on desktop
  ensureServiceWorker();
  if (isAppInstalled()) return;

  if (isIOS()) {
    mountBanner({ mode: "ios" });
  } else {
    // Generic banner (works even when beforeinstallprompt is not yet fired/eligible)
    mountBanner({
      mode: "generic",
      onInstall: async () => {
        // will only work if deferredPrompt exists later, but keep UX consistent
        if (!deferredPrompt) {
          alert("Open your browser menu and choose 'Install app' or 'Add to Home Screen'.");
          return;
        }
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
      }
    });
  }
});
