import express from "express";

import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

function fmtUserLabel(u) {
  if (!u) return "-";
  return u.name || u.email || u.id || "-";
}

function clean(value, max = 180) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function routeText(bid) {
  const from = bid.origin || bid.pickup || "-";
  const to = bid.destination || bid.delivery || "-";
  return `${from} → ${to}`;
}

// Create route offer / bid (broker)
router.post("/", requireRole("broker"), async (req, res) => {
  const { driverId } = req.body || {};
  const origin = clean(req.body?.origin ?? req.body?.pickup, 160);
  const destination = clean(req.body?.destination ?? req.body?.delivery, 160);
  const notes = clean(req.body?.notes, 500);
  const numPrice = money(req.body?.price ?? req.body?.rate);
  const brokerContactName = clean(req.body?.brokerName, 160);
  const brokerContactEmail = clean(req.body?.brokerEmail, 160).toLowerCase();
  const brokerContactPhone = clean(req.body?.brokerPhone, 60);

  if (!driverId) return res.status(400).json({ error: "Truck/driver is required" });
  if (!origin) return res.status(400).json({ error: "Origin / From is required" });
  if (!destination) return res.status(400).json({ error: "Destination / To is required" });
  if (!brokerContactName) return res.status(400).json({ error: "Broker first and last name is required" });
  if (!brokerContactEmail || !brokerContactEmail.includes("@")) return res.status(400).json({ error: "Valid broker email is required" });
  if (!brokerContactPhone) return res.status(400).json({ error: "Broker phone is required" });
  if (!Number.isFinite(numPrice) || numPrice <= 0) return res.status(400).json({ error: "Valid price is required" });

  const users = await readJson("users.json");
  const broker = users.find(u => u.id === req.user.sub);
  const driver = users.find(u => u.id === driverId && u.status === "approved");
  if (!driver || driver.role !== "driver") return res.status(400).json({ error: "Driver not found" });

  const now = new Date().toISOString();
  const bid = {
    id: uid("bid"),
    brokerId: broker?.id || req.user.sub,
    brokerName: brokerContactName,
    brokerEmail: brokerContactEmail,
    brokerPhone: brokerContactPhone,
    brokerAddress: broker?.address || null,

    driverId: driver.id,
    driverName: fmtUserLabel(driver),
    driverPhone: driver.phone || null,
    truckNumber: driver.truckNumber || null,
    trailerNumber: driver.trailerNumber || null,
    trailerType: driver.trailerType || null,
    isOwner: driver.isOwner ?? null,

    origin,
    destination,
    pickup: origin,
    delivery: destination,
    route: `${origin} → ${destination}`,
    notes: notes || null,
    price: numPrice,
    status: "submitted",
    createdAt: now,
    updatedAt: now
  };

  await updateJson("bids.json", (arr) => {
    arr.push(bid);
    return arr;
  });

  await audit("bid_created", {
    bidId: bid.id,
    brokerId: bid.brokerId,
    driverId: bid.driverId,
    route: bid.route,
    price: bid.price
  });

  await notify.roles(["dispatcher", "admin"], {
    type: "bid_created",
    title: "New Broker Bid",
    message: `${bid.brokerName} submitted ${routeText(bid)} for ${bid.driverName}: $${bid.price}`,
    data: { bidId: bid.id, url: "/admin.html?tab=bids" }
  });

  res.json({ ok: true, bid });
});

// List all bids (dispatcher/admin)
router.get("/", requireRole("dispatcher", "admin"), async (req, res) => {
  const rows = await readJson("bids.json");
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(rows);
});

// My bids (broker)
router.get("/my", requireRole("broker"), async (req, res) => {
  const rows = await readJson("bids.json");
  const mine = rows.filter(b => b.brokerId === req.user.sub);
  mine.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(mine);
});

// Update bid status (admin/dispatcher)
router.patch("/:id/status", requireRole("dispatcher", "admin"), async (req, res) => {
  const id = req.params.id;
  const status = String(req.body?.status || "").trim().toLowerCase();
  const allowed = ["submitted", "reviewed", "accepted", "rejected", "booked", "completed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid bid status" });

  let updated = null;
  await updateJson("bids.json", (arr) => {
    const b = arr.find(x => x.id === id);
    if (!b) return arr;
    b.status = status;
    b.updatedAt = new Date().toISOString();
    b.statusHistory = Array.isArray(b.statusHistory) ? b.statusHistory : [];
    b.statusHistory.push({ status, byUserId: req.user.sub, at: b.updatedAt, note: clean(req.body?.note, 500) || null });
    updated = b;
    return arr;
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  await audit("bid_status_updated", { bidId: id, status, by: req.user.sub });
  await notify.users([updated.brokerId].filter(Boolean), {
    type: "bid_status",
    title: "Bid status updated",
    message: `Your bid ${updated.route || routeText(updated)} is now ${status}.`,
    data: { bidId: id, url: "/broker.html#bids" }
  });
  res.json({ ok: true, bid: updated });
});

// Delete bid (broker can delete own, admin can delete any)
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const role = req.user?.role;

  const rows = await readJson("bids.json");
  const bid = rows.find(b => b.id === id);
  if (!bid) return res.status(404).json({ error: "Not found" });

  const isAdmin = role === "admin";
  const isOwner = role === "broker" && bid.brokerId === req.user.sub;
  if (!isAdmin && !isOwner) return res.status(403).json({ error: "Forbidden" });

  await updateJson("bids.json", (arr) => arr.filter(b => b.id !== id));
  await audit("bid_deleted", { bidId: id, by: req.user.sub, role: role || "" });

  res.json({ ok: true });
});

export default router;
