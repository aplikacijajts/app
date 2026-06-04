import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { readJson } from "../services/jsonStore.js";

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("admin", "dispatcher", "broker"));

function labelDriver(d) {
  return d.name || d.email || d.id || "Driver";
}

function equipmentLabel(d) {
  return [d.truckNumber && `Truck ${d.truckNumber}`, d.trailerNumber && `Trailer ${d.trailerNumber}`, d.trailerType].filter(Boolean).join(" • ") || "No equipment entered";
}

router.get("/vehicles", async (req, res) => {
  const [loads, users] = await Promise.all([readJson("loads.json"), readJson("users.json")]);
  let drivers = users.filter(u => u.role === "driver" && u.status === "approved");

  // Admins, dispatchers and brokers see the approved fleet map.

  const baseLat = Number(process.env.MAP_DEFAULT_LAT || 41.9981);
  const baseLng = Number(process.env.MAP_DEFAULT_LNG || 21.4254);
  const activeStatuses = new Set(["in_progress", "picked_up", "in_transit", "delayed"]);

  const vehicles = drivers.slice(0, 100).map((d, i) => {
    const activeLoad = loads.find(l => l.driverId === d.id && activeStatuses.has(String(l.status || "").toLowerCase())) || null;
    return {
      id: d.id,
      driverId: d.id,
      driver: labelDriver(d),
      phone: d.phone || null,
      truckNumber: d.truckNumber || null,
      trailerNumber: d.trailerNumber || null,
      trailerType: d.trailerType || null,
      equipment: equipmentLabel(d),
      status: activeLoad ? "In transit" : "Available",
      lat: Number(d.lat || d.latitude || (baseLat + (i % 7) * 0.018)),
      lng: Number(d.lng || d.longitude || (baseLng + (i % 5) * 0.021)),
      activeLoad: activeLoad?.id || null,
      activeLoadNumber: activeLoad?.loadNumber || null,
      eta: activeLoad ? "Active route" : "Ready",
      companyName: d.companyName || null
    };
  });

  res.json({ ok: true, vehicles });
});

export default router;
