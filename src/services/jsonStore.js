import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve("data");

const filePath = (name) => path.join(DATA_DIR, name);
const lockPath = (name) => path.join(DATA_DIR, `${name}.lock`);

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function acquireLock(name, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const fh = await fs.open(lockPath(name), "wx"); // fails if exists
      await fh.close();
      return;
    } catch {
      await sleep(25);
    }
  }
  throw new Error(`Lock timeout for ${name}`);
}

async function releaseLock(name) {
  try { await fs.unlink(lockPath(name)); } catch {}
}

export async function readJson(name) {
  const p = filePath(name);
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

export async function writeJson(name, data) {
  const p = filePath(name);
  const tmp = `${p}.tmp`;

  await acquireLock(name);
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, p); // atomic replace
  } finally {
    await releaseLock(name);
  }
}

export async function updateJson(name, updaterFn) {
  await acquireLock(name);
  try {
    const current = await readJson(name);
    const next = await updaterFn(current);
    const p = filePath(name);
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf-8");
    await fs.rename(tmp, p);
    return next;
  } finally {
    await releaseLock(name);
  }
}
