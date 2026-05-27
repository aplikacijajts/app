import express from "express";
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

import { errorHandler } from "./src/middleware/error.js";
import { readJson, writeJson } from "./src/services/jsonStore.js";

dotenv.config();

// Local development safety: JWT_SECRET is required for login tokens.
// If .env is missing, use a stable development-only fallback instead of crashing.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "local_dev_jwt_secret_change_before_production_2026";
  console.warn("⚠️ JWT_SECRET is missing. Using local development fallback. Set JWT_SECRET in .env for production.");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

// Serve frontend
app.use(express.static(path.resolve("public")));

// Default homepage
app.get("/", (req, res) => res.sendFile(path.resolve("public/home.html")));

// Health
app.get("/health", (req, res) => res.json({ ok: true, pushConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/loads", loadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bids", bidsRoutes);
app.use("/api/notifications", notificationsRoutes);

// GPS routes
app.use("/gps", gpsRoutes);       // за /gps/ (iframe)
app.use("/api/gps", gpsRoutes);   // опционално

// Push routes
app.use("/api/push", pushRoutes);

app.use(errorHandler);

// Create default admin on first run (if users.json is empty)
async function ensureDefaultAdmin() {
  const users = await readJson("users.json");
  if (Array.isArray(users) && users.length > 0) return;

  const password = "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = {
    id: "u_admin",
    name: "Default Admin",
    email: "admin@local",
    phone: null,
    companyId: "default",
    role: "admin",
    status: "approved",
    passwordHash,
    createdAt: new Date().toISOString()
  };

  await writeJson("users.json", [admin]);
  console.log("✅ Default admin created:");
  console.log("   email: admin@local");
  console.log("   password: admin123");
}

const port = process.env.PORT || 4000;

await ensureDefaultAdmin();

app.listen(port, () => console.log(`✅ API running on http://localhost:${port}`));
