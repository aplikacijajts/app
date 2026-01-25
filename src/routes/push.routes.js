import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { readJson, updateJson } from "../services/jsonStore.js";

const router = express.Router();
router.use(requireAuth);

// body: { token, platform }
router.post("/register", async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token) return res.status(400).json({ error: "Missing token" });

  const userId = req.user.sub;

  await updateJson("pushTokens.json", (arr) => {
    arr = Array.isArray(arr) ? arr : [];
    // remove duplicates for same token
    arr = arr.filter(x => x.token !== token);
    arr.push({
      id: `pt_${Date.now()}`,
      userId,
      token,
      platform: platform || "android",
      updatedAt: new Date().toISOString()
    });
    return arr;
  });

  res.json({ ok: true });
});

export default router;
