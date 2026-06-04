import express from "express";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = express.Router();

const GPS_ALLOWED_ROLES = ["admin", "dispatcher", "broker"];
const GPS_LIVE_SHARE_URL = "https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg";

function gpsUrl() {
  // Locked to the public live-share tracking view. This intentionally does not use GPS_URL,
  // so an old Render environment variable cannot override the final production link.
  return GPS_LIVE_SHARE_URL;
}

function allowedGpsRole(role) {
  return GPS_ALLOWED_ROLES.includes(String(role || "").toLowerCase());
}

// Frontend config. Credentials are intentionally not returned to the browser.
router.get("/config", requireAuth, requireRole("admin", "dispatcher", "broker"), (req, res) => {
  res.json({ ok: true, embed: true, url: "/gps/embed" });
});

// Iframe wrapper for the GPS provider. The provider link and credentials are never shown in the UI.
router.get("/embed", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(401).send("Unauthorized");

    const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || "dev_secret_change_me";
    const payload = jwt.verify(token, secret);

    if (!allowedGpsRole(payload?.role)) {
      return res.status(403).send("Forbidden");
    }

    const url = gpsUrl();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>JTS GPS</title>
  <style>
    html,body{height:100%;margin:0;background:#050b18;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#e5edf7;overflow:hidden}
    .shell{height:100%;display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at 20% 0%,rgba(49,130,206,.25),transparent 35%),#050b18}
    .bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:rgba(8,16,32,.82);border-bottom:1px solid rgba(148,163,184,.18);backdrop-filter:blur(16px)}
    .brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.02em}.dot{width:10px;height:10px;border-radius:999px;background:#22c55e;box-shadow:0 0 18px rgba(34,197,94,.8)}
    .status{font-size:12px;color:#9fb0c6}.mapwrap{position:relative;height:100%;padding:0}.mapwrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#07111f}
    .login-helper{position:absolute;right:16px;bottom:16px;max-width:330px;padding:12px 14px;border-radius:16px;background:rgba(5,11,24,.78);border:1px solid rgba(148,163,184,.22);box-shadow:0 18px 60px rgba(0,0,0,.35);font-size:12px;color:#cbd5e1}
    .login-helper b{display:block;color:#fff;margin-bottom:3px}.login-helper span{display:none}
    @media(max-width:720px){.bar{padding:10px 12px}.status{display:none}.login-helper{left:10px;right:10px;bottom:10px}}
  </style>
</head>
<body>
  <div class="shell">
    <div class="bar"><div class="brand"><i class="dot"></i><span>JTS Fleet GPS</span></div><div class="status">Live fleet view</div></div>
    <div class="mapwrap">
      <iframe id="gpsFrame" src="${url}" referrerpolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"></iframe>
      <div class="login-helper" id="helper"><b>GPS map</b>Live tracking is loading inside the portal.</div>
    </div>
  </div>
  <script>
    // Live-share tracking is embedded without exposing the provider URL in the main UI.
    window.JTS_GPS_READY = true;
  </script>
</body>
</html>`);
  } catch (e) {
    return res.status(401).send("Unauthorized");
  }
});

router.get("/", requireAuth, requireRole("admin", "dispatcher", "broker"), (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  res.redirect(`/gps/embed?token=${encodeURIComponent(token)}`);
});

export default router;
