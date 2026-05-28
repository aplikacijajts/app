import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { readJson, writeJson } from "../services/jsonStore.js";
import { audit } from "../services/audit.js";

const router = express.Router();
router.use(requireAuth);

router.get("/company", async (req, res) => {
  const settings = await readJson("settings.json");
  res.json(settings.company || { name: "JTS Logistics", timezone: "Europe/Skopje", locale: "en" });
});

router.put("/company", requireRole("admin"), async (req, res) => {
  const current = await readJson("settings.json");
  current.company = {
    ...(current.company || {}),
    name: String(req.body.name || current.company?.name || "JTS Logistics").trim(),
    timezone: String(req.body.timezone || current.company?.timezone || "Europe/Skopje").trim(),
    locale: String(req.body.locale || current.company?.locale || "en").trim()
  };
  await writeJson("settings.json", current);
  await audit("settings_company_updated", { userId: req.user.sub });
  res.json({ ok: true, company: current.company });
});

router.get("/security", requireRole("admin"), async (req, res) => {
  res.json({ jwt: "enabled", rateLimit: "enabled", passwordHashing: "bcrypt", roles: ["admin","dispatcher","driver","broker"] });
});

export default router;
