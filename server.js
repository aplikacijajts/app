import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";

import authRoutes from "./src/routes/auth.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";
import documentsRoutes from "./src/routes/documents.routes.js";
import loadsRoutes from "./src/routes/loads.routes.js";
import usersRoutes from "./src/routes/users.routes.js";
import bidsRoutes from "./src/routes/bids.routes.js";
import notificationsRoutes from "./src/routes/notifications.routes.js";
import gpsRoutes from "./src/routes/gps.routes.js";
import pushRoutes from "./src/routes/push.routes.js";
import realtimeRoutes from "./src/routes/realtime.routes.js";
import settingsRoutes from "./src/routes/settings.routes.js";
import aiRoutes from "./src/routes/ai.routes.js";
import mapRoutes from "./src/routes/map.routes.js";
import chatRoutes from "./src/routes/chat.routes.js";

import { errorHandler } from "./src/middleware/error.js";
import { securityHeaders, apiLimiter, authLimiter } from "./src/middleware/security.js";
import { attachRealtime } from "./src/services/realtime.js";
import { readJson, writeJson } from "./src/services/jsonStore.js";

dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "local_dev_jwt_secret_change_before_production_2026";
  console.warn("JWT_SECRET is missing. Using local development fallback. Set JWT_SECRET in .env for production.");
}

const app = express();
app.use(cors());
app.use(securityHeaders);
app.use(express.json({ limit: "3mb" }));
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

app.use(express.static(path.resolve("public")));
app.get("/", (req, res) => res.sendFile(path.resolve("public/home.html")));
app.get("/health", (req, res) => res.json({ ok: true, pushConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/loads", loadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bids", bidsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/chat", chatRoutes);
app.use("/gps", gpsRoutes);
app.use("/api/gps", gpsRoutes);
app.use("/api/push", pushRoutes);
app.use(errorHandler);

async function ensureDefaultAdmin() {
  const users = await readJson("users.json");
  if (Array.isArray(users) && users.length > 0) return;

  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = {
    id: "u_admin",
    name: "JTS Logistics Admin",
    email: "admin@jtslogistics.local",
    phone: null,
    companyId: "jts-logistics",
    role: "admin",
    status: "approved",
    passwordHash,
    createdAt: new Date().toISOString()
  };

  await writeJson("users.json", [admin]);
  console.log("Default admin created: admin@jtslogistics.local / admin123");
}

const port = process.env.PORT || 4000;
await ensureDefaultAdmin();

const server = http.createServer(app);

try {
  const socketModule = await import("socket.io");
  const io = new socketModule.Server(server, { cors: { origin: "*" } });
  attachRealtime(io);
  app.set("io", io);
  console.log("Realtime Socket.IO enabled.");
} catch (err) {
  console.warn("Socket.IO is not installed. Server will continue without realtime sockets.");
  console.warn("Run npm install after network access is restored to enable realtime features.");
}

server.listen(port, () => console.log(`API running on http://localhost:${port}`));
