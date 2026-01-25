import express from "express";
import { readJson, updateJson } from "../services/jsonStore.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uid } from "../utils/id.js";
import { notify } from "../services/notify.js";

const router = express.Router();
router.use(requireAuth);

// Driver: get my loads
// Driver: get my loads (active by default)
// GET /api/loads?includeClosed=1
router.get("/", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const loads = await readJson("loads.json");
  const includeClosed = String(req.query.includeClosed || "") === "1";

  let mine = loads.filter(l => l.driverId === req.user.sub);
  if (!includeClosed) mine = mine.filter(l => (l.status || "in_progress") !== "closed");

  mine.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json(mine);
});

// Admin/Dispatcher: create load and assign to driver
router.post("/", requireRole("dispatcher", "admin"), async (req, res) => {
  const { loadNumber, customer, driverId } = req.body || {};
  if (!loadNumber || !driverId) return res.status(400).json({ error: "Missing loadNumber/driverId" });

  const load = {
    id: uid("l"),
    loadNumber: String(loadNumber),
    customer: customer || null,
    driverId,
    status: "in_progress",
    createdAt: new Date().toISOString()
  };

  await updateJson("loads.json", (arr) => (arr.push(load), arr));

  // Notify assigned driver
  await notify.users([driverId], {
    type: "load_assigned",
    title: "New Load Assigned",
    message: `You have a new load: ${load.loadNumber}`,
    data: { loadId: load.id, loadNumber: load.loadNumber }
  });

  res.json({ ok: true, load });
});

// Load details + required docs checklist (POD/BOL required)
router.get("/:id/details", requireRole("driver", "dispatcher", "admin"), async (req, res) => {
  const id = req.params.id;
  const loads = await readJson("loads.json");
  const load = loads.find(l => l.id === id);
  if (!load) return res.status(404).json({ error: "Load not found" });

  const isOwner = load.driverId === req.user.sub;
  const isPrivileged = ["dispatcher","admin"].includes(req.user.role);
  if (!isOwner && !isPrivileged) return res.status(403).json({ error: "Forbidden" });

  const docs = await readJson("documents.json");
  const loadDocs = docs.filter(d => d.loadId === load.id);

  const REQUIRED = ["POD", "BOL"];

  const latestByCategory = {};
  for (const d of loadDocs) {
    const key = (d.category || "").toUpperCase();
    if (!key) continue;
    const curr = latestByCategory[key];
    if (!curr || (d.version || 1) > (curr.version || 1)) latestByCategory[key] = d;
  }

  const checklist = REQUIRED.map(cat => {
    const found = latestByCategory[cat];
    return {
      category: cat,
      status: found ? (found.status || "submitted") : "none",
      docId: found ? found.id : null,
      version: found ? (found.version || 1) : null,
      previewUrl: found ? `/api/documents/${found.id}/file` : null
    };
  });

  const missingDocs = checklist.filter(i => i.status === "none").map(i => i.category);

  // Include all docs for this load (optional, useful for history)
  const allDocs = loadDocs
    .slice()
    .sort((a,b) => ((a.category||"").localeCompare(b.category||"")) || ((b.version||1)-(a.version||1)));

  res.json({
    ok: true,
    load,
    requiredDocs: REQUIRED,
    checklist,
    missingDocs,
    missingCount: missingDocs.length,
    allDocs
  });
});

// Admin/Dispatcher: list all loads + missing docs info (POD/BOL required)
router.get("/all", requireRole("dispatcher", "admin"), async (req, res) => {
  const loads = await readJson("loads.json");
  const docs = await readJson("documents.json");

  const REQUIRED = ["POD", "BOL"];

  const out = loads.map(l => {
    const loadDocs = docs.filter(d => d.loadId === l.id);

    const latestByCategory = {};
    for (const d of loadDocs) {
      const key = (d.category || "").toUpperCase();
      if (!key) continue;
      const curr = latestByCategory[key];
      if (!curr || (d.version || 1) > (curr.version || 1)) latestByCategory[key] = d;
    }

    const docsSummary = {};
    for (const c of REQUIRED) {
      const found = latestByCategory[c];
      docsSummary[c] = found ? (found.status || "submitted") : "none";
    }

    const missingDocs = REQUIRED.filter(c => docsSummary[c] === "none");

    return {
      ...l,
      requiredDocs: REQUIRED,
      docsSummary,
      missingDocs,
      missingCount: missingDocs.length
    };
  });

  const view = String(req.query.view || "active"); // active | finished | all
let result = out;
if (view === "finished") result = out.filter(l => (l.status || "") === "closed");
else if (view === "active") result = out.filter(l => (l.status || "") !== "closed");

result.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
res.json(result);
});

// Admin/Dispatcher: update load status
router.patch("/:id/status", requireRole("dispatcher", "admin"), async (req, res) => {
  const id = req.params.id;
  const { status } = req.body || {};
  const allowed = ["in_progress", "delivered", "closed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

  // Flow rule: cannot close a load unless required documents are APPROVED.
  // Current model: POD + BOL are always required.
  if (status === "closed") {
    const loads = await readJson("loads.json");
    const load = loads.find(l => l.id === id);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const docs = await readJson("documents.json");
    const loadDocs = docs.filter(d => d.loadId === id);
    const REQUIRED = ["POD", "BOL"];

    // latest doc by category (version)
    const latestByCategory = {};
    for (const d of loadDocs) {
      const key = (d.category || "").toUpperCase();
      if (!key) continue;
      const curr = latestByCategory[key];
      if (!curr || (d.version || 1) > (curr.version || 1)) latestByCategory[key] = d;
    }

    const missingOrNotApproved = REQUIRED.filter(cat => {
      const doc = latestByCategory[cat];
      return !doc || doc.status !== "approved";
    });

    if (missingOrNotApproved.length) {
      return res.status(400).json({
        error: `Cannot close load: required docs must be approved (${missingOrNotApproved.join(", ")}).`
      });
    }
  }

  let updated = null;

  await updateJson("loads.json", (arr) => {
    const l = arr.find(x => x.id === id);
    if (!l) return arr;
    l.status = status;
    l.updatedAt = new Date().toISOString();
    
    if (status === "closed" && !l.closedAt) l.closedAt = new Date().toISOString();
updated = l;
    return arr;
  });

  if (!updated) return res.status(404).json({ error: "Load not found" });

  // Notify driver + privileged roles about status change
  if (updated.driverId) {
    await notify.users([updated.driverId], {
      type: "load_status",
      title: "Load Status Updated",
      message: `Load ${updated.loadNumber} is now ${updated.status}.`,
      data: { loadId: updated.id, status: updated.status }
    });
  }

  await notify.roles(["dispatcher", "admin"], {
    type: "load_status",
    title: "Load Status Updated",
    message: `Load ${updated.loadNumber} is now ${updated.status}.`,
    data: { loadId: updated.id, status: updated.status }
  });

  res.json({ ok: true, load: updated });
});

export default router;
