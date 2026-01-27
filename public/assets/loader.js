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
      #jts-splash{
        position:fixed;
        inset:0;
        z-index:2147483647;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#fff;
        background:rgba(255,255,255,0.92);
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
        opacity:0;
        transform: translateZ(0);
        animation: jtsFadeIn 260ms ease forwards;
      }
      #jts-splash .jts-inner{
        width:100%;
        height:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:22px;
        padding:24px;
      }
      #jts-splash img{
        width:128px;
        height:auto;
        max-width:52vw;
        object-fit:contain;
        transform: scale(0.92);
        opacity:0;
        animation: jtsLogoPop 620ms cubic-bezier(.2,.8,.2,1) 120ms forwards;
        will-change: transform, opacity;
      }
      #jts-splash .dots{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
      }
      #jts-splash .dot{
        width:10px;
        height:10px;
        border-radius:999px;
        background:#0a1a2f;
        opacity:.35;
        animation:jtsDotPulse 1.0s ease-in-out infinite;
      }
      #jts-splash .dot:nth-child(2){ animation-delay: 140ms; }
      #jts-splash .dot:nth-child(3){ animation-delay: 280ms; }

      #jts-splash.jts-hide{
        animation: jtsFadeOut 240ms ease forwards;
      }
      #jts-splash.jts-hide img{
        animation: jtsLogoOut 220ms ease forwards;
      }

      @keyframes jtsFadeIn{
        from{ opacity:0; }
        to{ opacity:1; }
      }
      @keyframes jtsFadeOut{
        from{ opacity:1; }
        to{ opacity:0; }
      }
      @keyframes jtsLogoPop{
        0%{ opacity:0; transform:scale(0.90); }
        60%{ opacity:1; transform:scale(1.04); }
        100%{ opacity:1; transform:scale(1.00); }
      }
      @keyframes jtsLogoOut{
        from{ opacity:1; transform:scale(1.00); }
        to{ opacity:0; transform:scale(0.98); }
      }
      @keyframes jtsDotPulse{
        0%,100%{ transform:scale(0.78); opacity:.30; }
        50%{ transform:scale(1.12); opacity:.95; }
      }

      @media (prefers-reduced-motion: reduce){
        #jts-splash, #jts-splash img, #jts-splash .dot{
          animation:none !important;
          transition:none !important;
        }
        #jts-splash{ opacity:1; }
        #jts-splash img{ opacity:1; transform:none; }
        #jts-splash .dot{ opacity:.7; }
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
      splash.classList.add("jts-hide");
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
