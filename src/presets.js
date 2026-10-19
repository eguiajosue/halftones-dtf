const { storage } = require("uxp");
const { DEFAULTS, HT_TYPES, CLEANUPS } = require("./state");
const { clamp } = require("./util");

const FILE = "presets.json";
const KEYS = Object.keys(DEFAULTS);

const clone = o => JSON.parse(JSON.stringify(o));

let warning = null;     // aviso pendiente para el panel (archivo dañado)
let readOnly = false;   // archivo ilegible y sin copia: no se sobrescribe

// ---- Validación: tipos y rangos; lo que no encaja vuelve al valor por defecto ----
function toNum(v, d, lo, hi) {
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
}
const toBool = (v, d) => (typeof v === "boolean" ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
function toColor(v, d) {
  if (!v || typeof v !== "object") return clone(d);
  return { r: Math.round(toNum(v.r, d.r, 0, 255)), g: Math.round(toNum(v.g, d.g, 0, 255)), b: Math.round(toNum(v.b, d.b, 0, 255)) };
}

// Fusiona con los valores por defecto del código (autorreparación).
function normalize(p) {
  const s = p && typeof p === "object" ? p : {};
  const D = DEFAULTS;
  const out = {
    lpi: Math.round(toNum(s.lpi, D.lpi, 5, 234) * 10) / 10,
    angle: toNum(s.angle, D.angle, -360, 360),
    htType: oneOf(s.htType, HT_TYPES, D.htType),
    halftone: toBool(s.halftone, D.halftone),
    knockout: toBool(s.knockout, D.knockout),
    knockoutColor: toColor(s.knockoutColor, D.knockoutColor),
    shirt: toColor(s.shirt, D.shirt),
    linked: toBool(s.linked, D.linked),
    black: Math.round(toNum(s.black, D.black, 0, 253)),
    gamma: Math.round(toNum(s.gamma, D.gamma, 0.01, 9.99) * 100) / 100,
    outBlack: Math.round(toNum(s.outBlack, D.outBlack, 0, 255)),
    shadow: Math.round(toNum(s.shadow, D.shadow, 0, 100)),
    cleanup: oneOf(s.cleanup, CLEANUPS, D.cleanup),
    defringe: toBool(s.defringe, D.defringe),
    nativeFinal: toBool(s.nativeFinal, D.nativeFinal)
  };
  // Mismas restricciones que los sliders: negro < blanco - 2, mín ≤ máx
  out.white = Math.round(clamp(toNum(s.white, D.white, 0, 255), out.black + 2, 255));
  out.outWhite = Math.round(clamp(toNum(s.outWhite, D.outWhite, 0, 255), out.outBlack, 255));
  for (const k of KEYS) if (!(k in out)) out[k] = clone(D[k]);   // claves nuevas de DEFAULTS
  return out;
}

async function readAll() {
  const folder = await storage.localFileSystem.getDataFolder();
  let entry;
  try {
    entry = await folder.getEntry(FILE);
  } catch (e) {
    return {};                                   // todavía no hay presets
  }
  let text = null;
  try {
    text = await entry.read();
    const all = JSON.parse(text);
    if (all && typeof all === "object" && !Array.isArray(all)) return all;
  } catch (e) { /* ilegible o dañado: abajo */ }

  // Dañado: se guarda una copia antes de empezar de cero (no se pierde en silencio)
  if (readOnly) return {};
  if (text === null) {
    readOnly = true;
    warning = "No se pudo leer el archivo de presets. No se guardarán cambios hasta reiniciar el panel.";
    return {};
  }
  const bak = `presets.bak-${Date.now()}.json`;
  try {
    const copy = await folder.createFile(bak, { overwrite: true });
    await copy.write(String(text));
    await writeAll({});
    warning = `El archivo de presets estaba dañado. Se guardó una copia (${bak}) y se empezó de cero.`;
  } catch (e) {
    readOnly = true;
    warning = "El archivo de presets está dañado y no se pudo copiar. No se guardarán cambios para no perderlo.";
  }
  return {};
}

async function writeAll(all) {
  if (readOnly) throw new Error(warning || "El archivo de presets no se puede escribir.");
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

// Devuelve (una sola vez) el aviso pendiente, o null
function takeWarning() {
  const w = warning;
  warning = null;
  return w;
}

module.exports = { list, load, save, remove, normalize, takeWarning };
