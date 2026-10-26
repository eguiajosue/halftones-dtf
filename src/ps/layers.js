// Constructores de capas. Todo con descriptores nativos de Photoshop.
const { app } = require("photoshop");
const { storage } = require("uxp");
const { TILE_PX, state } = require("../state");
const {
  bp, px, pct, deg, rgb, layerById, targetLayer, selectLayer, lastLayerId
} = require("./bp");

async function makeSolid(name, color, mode = "normal") {
  await bp({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name, mode: { _enum: "blendMode", _value: mode },
             type: { _obj: "solidColorLayer", color: rgb(color) } } });
  return lastLayerId();
}

async function makeHueSatDesat(name) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name,
      type: { _obj: "hueSaturation", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
              colorize: false,
              adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: -100, lightness: 0 }] } } });
  return lastLayerId();
}

async function makeThreshold(name, level = 128) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "thresholdClassEvent", level } } });
  return lastLayerId();
}

async function setLevels(id, { black, gamma, white, outBlack, outWhite }) {
  await bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }],
    to: { _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
      adjustment: [{ _obj: "levelsAdjustment",
        channel: { _ref: "channel", _enum: "channel", _value: "composite" },
        input: [black, white], gamma, output: [outBlack, outWhite] }] } });
}

async function makeLevels(name, s) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "levels",
      presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } } } });
  const id = await lastLayerId();
  await setLevels(id, s);
  return id;
}

const setSolid = (id, c) => bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
  to: { _obj: "solidColorLayer", color: rgb(c) } });

// ---- Semitono -------------------------------------------------------------

const definedPatterns = new Map();   // nombre -> ID (o null) definido en esta sesión

// Nombres de motivos que ya existen en la biblioteca del usuario (persisten entre sesiones).
async function libraryPatternNames() {
  try {
    const r = await bp({ _obj: "get", _target: [{ _property: "presetManager" }, { _ref: "application" }] });   // 🔍
    const names = new Set();
    for (const m of (r[0] && r[0].presetManager) || []) {
      if (Array.isArray(m.name)) m.name.forEach(n => names.add(n));
    }
    return names;
  } catch (e) { return new Set(); }
}

// Define el motivo de umbral a partir del PNG propio del plugin, solo si no existe ya en la biblioteca.
async function ensurePattern(type) {
  const name = `HT ${type}`;
  if (definedPatterns.has(name)) return { name, id: definedPatterns.get(name) };
  if ((await libraryPatternNames()).has(name)) {
    definedPatterns.set(name, null);        // se usa por nombre; evita duplicados entre sesiones
    return { name, id: null };
  }

  const folder = await storage.localFileSystem.getPluginFolder();
  let entry;
  try {
    entry = await folder.getEntry(`assets/tiles/ht_${type.toLowerCase()}.png`);
  } catch (e) {
    throw new Error(`No se encuentra el recurso de semitono (${type}). Reinstala el plugin.`);
  }
  const work = app.activeDocument;
  const tile = await app.open(entry);
  let id = null;
  try {
    await bp({ _obj: "set", _target: [{ _ref: "channel", _property: "selection" }],
               to: { _enum: "ordinal", _value: "allEnum" } });
    const res = await bp({ _obj: "make", _target: [{ _ref: "pattern" }],
      using: { _ref: "property", _property: "selection" }, name });          // 🔍 Definir motivo
    id = (res && res[0] && res[0].ID) || null;
  } finally {
    await tile.closeWithoutSaving();
    app.activeDocument = work;
  }
  definedPatterns.set(name, id);
  return { name, id };
}

// Precarga los 4 motivos (una vez por sesión) para que cambiar de tipo en vivo no abra archivos.
async function ensureAllPatterns() {
  for (const type of ["ROUND", "LINE", "DIAMOND", "ELLIPSE"]) await ensurePattern(type);
}

function patternScale(lpi, resolution) {
  return Math.max(1, 100 * (resolution / lpi) / TILE_PX);
}

// Crea la capa de relleno de motivo en modo Hard Mix (relleno 100 %).
async function makeHalftoneLayer(type, lpi, angle) {
  const { name, id } = await ensurePattern(type);
  const res = app.activeDocument.resolution;
  const pattern = id ? { _obj: "pattern", name, ID: id } : { _obj: "pattern", name };
  await bp({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name: "HT PATTERN",
      type: { _obj: "patternLayer", pattern, scale: pct(patternScale(lpi, res)), angle: deg(angle) } } }); // 🔍
  const layerId = await lastLayerId();
  await bp({ _obj: "set", _target: [layerById(layerId)],
    to: { _obj: "layer", mode: { _enum: "blendMode", _value: "hardMix" }, fillOpacity: pct(100) } });
  return layerId;
}

async function setHalftoneParams(id, lpi, angle) {
  const res = app.activeDocument.resolution;
  await bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
    to: { _obj: "patternLayer", scale: pct(patternScale(lpi, res)), angle: deg(angle) } });   // 🔍
}

// ---- Realce de sombras (Sombras/Iluminaciones como filtro inteligente) ------

async function applyShadowBoost(layerId, amount) {
  await selectLayer(layerId);
  await bp({ _obj: "adaptCorrect",
    sdwM: { _obj: "adaptCorrectTones", amount: pct(amount), width: pct(50), radius: px(30) },
    hglM: { _obj: "adaptCorrectTones", amount: pct(0),      width: pct(50), radius: px(30) },
    blackClip: 0.01, whiteClip: 0.01, center: 0, colorCorrection: 20 });                     // 🔍
}

async function removeSmartFilters(layerId) {
  try {
    await bp({ _obj: "delete", _target: [{ _ref: "filterFX", _index: 1 }, layerById(layerId)] });  // 🔍
  } catch (e) { /* sin filtro: nada que borrar */ }
}

// Reaplica el realce en ART y MAP ART (así la máscara también lo refleja).
async function setShadowBoost(amount) {
  const L = state.layers;
  for (const id of [L.art, L.mapArt]) {
    if (state.shadowOn) await removeSmartFilters(id);
    if (amount > 0) await applyShadowBoost(id, amount);
  }
  state.shadowOn = amount > 0;
}

module.exports = {
  makeSolid, makeHueSatDesat, makeThreshold, makeLevels, setLevels, setSolid,
  makeHalftoneLayer, setHalftoneParams, setShadowBoost, ensureAllPatterns
};
