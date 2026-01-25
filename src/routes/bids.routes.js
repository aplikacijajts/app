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

// Create bid (broker)
router.post("/", requireRole("broker"), async (req, res) => {
  const { driverId, price } = req.body || {};
  const numPrice = Number(price);
  if (!driverId) return res.status(400).json({ error: "Missing driverId" });
  if (!Number.isFinite(numPrice) || numPrice <= 0) return res.status(400).json({ error: "Invalid price" });

  const users = await readJson("users.json");
  const broker = users.find(u => u.id === req.user.sub);
  const driver = users.find(u => u.id === driverId);
  if (!driver || driver.role !== "driver") return res.status(400).json({ error: "Driver not found" });

  const now = new Date().toISOString();
  const bid = {
    id: uid("bid"),
    brokerId: broker?.id || req.user.sub,
    brokerName: broker?.name || req.user.name || "Broker",
    brokerEmail: broker?.email || null,
    brokerPhone: broker?.phone || null,
    brokerAddress: broker?.address || null,

    driverId: driver.id,
    driverName: fmtUserLabel(driver),

    price: numPrice,
    status: "submitted",
    createdAt: now
  };

  await updateJson("bids.json", (arr) => {
    arr.push(bid);
    return arr;
  });

  await audit("bid_created", { bidId: bid.id, brokerId: bid.brokerId, driverId: bid.driverId, price: bid.price });

  // Notify dispatchers/admins
  await notify.roles(["dispatcher", "admin"], {
    type: "bid_created",
    title: "New Bid",
    message: `${bid.brokerName} submitted a bid for ${bid.driverName}: $${bid.price}`,
    data: { bidId: bid.id }
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

export default router;
