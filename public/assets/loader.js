// JTS standalone splash loader (shows only when opened as installed app)
(function () {
  function isStandalone() {
    var standaloneDisplay = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    var iosStandalone = window.navigator.standalone === true;
    return !!(standaloneDisplay || iosStandalone);
  }

  // Only in installed/standalone mode (no browser)
  if (!isStandalone()) return;

  var duration = 560 + Math.random() * (2780 - 560); // ms, random each launch

  function ensureStyles() {
    if (document.getElementById("jts-splash-style")) return;
    var style = document.createElement("style");
    style.id = "jts-splash-style";
    style.textContent = `
      #jts-splash {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a1a2f;
      }
      #jts-splash .jts-inner {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 22px;
        padding: 24px;
      }
      #jts-splash img {
        width: 120px;
        height: auto;
        max-width: 55vw;
        filter: drop-shadow(0 10px 30px rgba(0,0,0,.35));
        user-select: none;
        -webkit-user-drag: none;
      }
      #jts-splash .dots {
        position: absolute;
        bottom: 26px;
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: center;
      }
      #jts-splash .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,.85);
        animation: jtsDot 1.05s infinite ease-in-out;
      }
      #jts-splash .dot:nth-child(2) { animation-delay: .15s; }
      #jts-splash .dot:nth-child(3) { animation-delay: .30s; }
      @keyframes jtsDot {
        0%, 80%, 100% { transform: scale(0.6); opacity: .35; }
        40% { transform: scale(1.05); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        #jts-splash .dot { animation: none; opacity: .7; }
      }
    `;
    document.head.appendChild(style);
  }

  function showSplash() {
    if (document.getElementById("jts-splash")) return;

    ensureStyles();

    var splash = document.createElement("div");
    splash.id = "jts-splash";

    // Prefer existing logo from assets; fall back to inline text if missing
    var logoSrc = "/assets/jts-logo.png";
    // If running from file:// (rare), keep relative
    if (location.protocol === "file:") logoSrc = "assets/jts-logo.png";

    splash.innerHTML = `
      <div class="jts-inner" aria-label="Loading">
        <img src="${logoSrc}" alt="JTS" onerror="this.style.display='none'">
        <div class="dots" aria-hidden="true">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    `;

    // Insert as early as possible
    document.body.appendChild(splash);

    // Hide after randomized duration
    setTimeout(function () {
      splash.style.opacity = "0";
      splash.style.transition = "opacity 220ms ease";
      setTimeout(function () {
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
      }, 260);
    }, duration);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showSplash, { once: true });
  } else {
    showSplash();
  }
})();
