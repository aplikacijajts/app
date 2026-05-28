import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { readJson } from "../services/jsonStore.js";

const router = express.Router();
router.use(requireAuth);

router.get("/vehicles", async (req, res) => {
  const loads = await readJson("loads.json");
  const users = await readJson("users.json");
  const drivers = users.filter(u => u.role === "driver");
  const baseLat = Number(process.env.MAP_DEFAULT_LAT || 41.9981);
  const baseLng = Number(process.env.MAP_DEFAULT_LNG || 21.4254);
  const vehicles = drivers.slice(0, 50).map((d, i) => ({
    id: d.id,
    driver: d.name,
    status: i % 3 === 0 ? "Available" : i % 3 === 1 ? "In transit" : "Waiting documents",
    lat: baseLat + (i % 7) * 0.018,
    lng: baseLng + (i % 5) * 0.021,
    activeLoad: loads.find(l => l.driverId === d.id)?.id || null,
    eta: i % 2 === 0 ? "Today" : "Tomorrow"
  }));
  res.json({ ok: true, vehicles });
});

export default router;
