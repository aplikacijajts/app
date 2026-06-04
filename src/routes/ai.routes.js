import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { readJson } from "../services/jsonStore.js";

const router = express.Router();
router.use(requireAuth);

router.post("/assistant", async (req, res) => {
  const q = String(req.body?.message || "").toLowerCase();
  const [loads, docs, users] = await Promise.all([readJson("loads.json"), readJson("documents.json"), readJson("users.json")]);
  const openLoads = loads.filter(l => !["delivered","closed","cancelled"].includes(String(l.status || "").toLowerCase()));
  const drivers = users.filter(u => u.role === "driver" && u.status === "approved");

  let answer = "I can help with loads, drivers, documents, status, and operational suggestions.";
  if (q.includes("load") || q.includes("товар")) answer = `There are ${openLoads.length} active loads in the system.`;
  if (q.includes("driver") || q.includes("возач")) answer = `There are ${drivers.length} approved drivers.`;
  if (q.includes("document") || q.includes("документ")) answer = `There are ${docs.length} documents uploaded.`;
  if (q.includes("suggest") || q.includes("предлог")) answer = "Priority suggestion: review missing documents, assign open loads, and contact drivers with delayed statuses.";

  res.json({ ok: true, answer, context: { activeLoads: openLoads.length, drivers: drivers.length, documents: docs.length } });
});

export default router;
