const { storage } = require("uxp");
const { DEFAULTS } = require("./state");

const FILE = "presets.json";
const KEYS = Object.keys(DEFAULTS);

const clone = o => JSON.parse(JSON.stringify(o));

// Fusiona con los valores por defecto del código (autorreparación).
function normalize(p) {
  const out = clone(DEFAULTS);
  for (const k of KEYS) if (p && p[k] !== undefined) out[k] = p[k];
  return out;
}

async function readAll() {
  try {
    const folder = await storage.localFileSystem.getDataFolder();
    const entry = await folder.getEntry(FILE);
    return JSON.parse(await entry.read());
  } catch (e) {
    return {};
  }
}

async function writeAll(all) {
  const folder = await storage.localFileSystem.getDataFolder();
  const entry = await folder.createFile(FILE, { overwrite: true });
  await entry.write(JSON.stringify(all, null, 2));
}

async function list() {
  const all = await readAll();
  return ["Default", ...Object.keys(all).filter(n => n !== "Default").sort()];
}

async function load(name) {
  if (name === "Default") return clone(DEFAULTS);
  const all = await readAll();
  return all[name] ? normalize(all[name]) : clone(DEFAULTS);
}

async function save(name, settings) {
  name = (name || "").trim();
  if (!name) throw new Error("El preset necesita un nombre.");
  if (name === "Default") throw new Error('El preset "Default" no se puede sobrescribir.');
  const all = await readAll();
  all[name] = normalize(settings);
  await writeAll(all);
}

async function remove(name) {
  if (name === "Default") throw new Error('El preset "Default" no se puede borrar.');
  const all = await readAll();
  delete all[name];
  await writeAll(all);
}

module.exports = { list, load, save, remove };
