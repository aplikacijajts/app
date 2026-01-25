import express from "express";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = express.Router();

function gpsUrl() {
  return process.env.GPS_URL || "https://time.mk/";
}

// GET /gps/config
router.get("/config", requireAuth, requireRole("driver", "dispatcher", "admin", "broker"), (req, res) => {
  res.json({ url: gpsUrl() });
});

/**
 * GET /gps/embed?token=JWT
 * This route is used ONLY for iframes because they can't send Authorization headers easily.
 * We verify the token manually here and then render the iframe page.
 */
router.get("/embed", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(401).json({ error: "Missing token" });

    const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || "dev_secret_change_me";
    const payload = jwt.verify(token, secret);

    const role = payload?.role;
    if (!["admin", "dispatcher", "broker"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const url = gpsUrl();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>GPS</title>
  <style>
    html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; background: #f8fafc; }
    .top { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#fff; border-bottom:1px solid #e5e7eb; }
    .btn { border:1px solid #e5e7eb; background:#fff; padding:7px 10px; border-radius:8px; font-size:12px; cursor:pointer; }
    .wrap { height: calc(100% - 46px); padding: 10px; }
    iframe { width:100%; height:100%; border:1px solid #e5e7eb; border-radius:10px; background:#fff; }
    .hint { font-size:12px; color:#6b7280; margin-left:10px; }
    a { color: #083978; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <b>GPS</b>
      <span class="hint">If the site is blank, it may block embedding. Use "Open in new tab".</span>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <a class="btn" href="${url}" target="_blank" rel="noopener">Open in new tab</a>
      <button class="btn" onclick="location.reload()">Reload</button>
    </div>
  </div>

  <div class="wrap">
    <iframe src="${url}" referrerpolicy="no-referrer"></iframe>
  </div>
</body>
</html>`);
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// GET /gps/  (normal page access with Authorization header)
router.get("/", requireAuth, requireRole("dispatcher", "admin", "broker"), (req, res) => {
  const url = gpsUrl();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>GPS</title>
</head>
<body style="margin:0;height:100vh;">
  <iframe src="${url}" style="width:100%;height:100%;border:0;"></iframe>
</body>
</html>`);
});

export default router;
