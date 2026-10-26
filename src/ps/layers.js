// Constructores de capas. Todo con descriptores nativos de Photoshop.
const { app } = require("photoshop");
const { storage } = require("uxp");
const { TILE_PX, state } = require("../state");
const { tileFor, bwWeights, dotCurve } = require("../halftone");
const {
  bp, bpThenId, modal, px, pct, deg, rgb, layerById, targetLayer, selectLayer
} = require("./bp");

async function makeSolid(name, color, mode = "normal") {
  return bpThenId({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name, mode: { _enum: "blendMode", _value: mode },
             type: { _obj: "solidColorLayer", color: rgb(color) } } });
}

const CUSTOM = { _enum: "presetKindType", _value: "presetKindCustom" };

function bwType(sens) {
  const w = bwWeights(sens);
  return { _obj: "blackAndWhite", presetKind: CUSTOM, useTint: false,
           red: w.red, yellow: w.yellow, grain: w.green, cyan: w.cyan, blue: w.blue, magenta: w.magenta };   // 🔍 "grain" = verde
}

// Mapa de tinta en grises. Blanco y negro con pesos altos hace que los colores saturados reciban tinta
// completa (con Tono/Saturación −100 un rojo puro quedaba en ~50 %). Si Photoshop no lo acepta, se usa
// Tono/Saturación como antes.
async function makeMapDesat(name, sens) {
  try {
    const id = await bpThenId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
      using: { _obj: "adjustmentLayer", name, type: bwType(sens) } });
    return { id, kind: "bw" };
  } catch (e) {
    console.log("Blanco y negro no disponible, se usa Tono/Saturación:", e);
    const id = await bpThenId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
      using: { _obj: "adjustmentLayer", name,
        type: { _obj: "hueSaturation", presetKind: CUSTOM, colorize: false,
                adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: -100, lightness: 0 }] } } });
    return { id, kind: "hs" };
  }
}

async function setMapDesat(id, sens) {
  if (state.desatKind !== "bw") return;
  await bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }], to: bwType(sens) });
}

// Punto mínimo / máximo como curva con escalones
const curveType = (min, max) => ({ _obj: "curves", presetKind: CUSTOM,
  adjustment: [{ _obj: "curvesAdjustment", channel: { _ref: "channel", _enum: "channel", _value: "composite" },
    curve: dotCurve(min, max).map(([x, y]) => ({ _obj: "paint", horizontal: x, vertical: y })) }] });      // 🔍

async function makeCurves(name, min, max) {
  return bpThenId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: curveType(min, max) } });
}

const setCurves = (id, min, max) => bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }],
  to: curveType(min, max) });

async function makeThreshold(name, level = 128) {
  return bpThenId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "thresholdClassEvent", level } } });
}

async function setLevels(id, { black, gamma, white, outBlack, outWhite }) {
  await bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }],
    to: { _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
      adjustment: [{ _obj: "levelsAdjustment",
        channel: { _ref: "channel", _enum: "channel", _value: "composite" },
        input: [black, white], gamma, output: [outBlack, outWhite] }] } });
}

async function makeLevels(name, s) {
  const id = await bpThenId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "levels",
      presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } } } });
  await setLevels(id, s);
  return id;
}

const setSolid = (id, c) => bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
  to: { _obj: "solidColorLayer", color: rgb(c) } });

// ---- Semitono -------------------------------------------------------------

const definedPatterns = new Map();   // nombre -> { name, id, tilePx } ya disponible en esta sesión
const ownPatterns = new Set();       // motivos que definió este plugin (se borran de la biblioteca al terminar)

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

async function tileEntry(file) {
  const folder = await storage.localFileSystem.getPluginFolder();
  try { return await folder.getEntry(`assets/tiles/${file}`); } catch (e) { return null; }
}

// Abre el PNG, lo define como motivo y devuelve su ID (o null).
async function definePattern(entry, name) {
  const work = app.activeDocument;
  const tile = await app.open(entry);
  try {
    await bp({ _obj: "set", _target: [{ _ref: "channel", _property: "selection" }],
               to: { _enum: "ordinal", _value: "allEnum" } });
    const res = await bp({ _obj: "make", _target: [{ _ref: "pattern" }],
      using: { _ref: "property", _property: "selection" }, name });          // 🔍 Definir motivo
    ownPatterns.add(name);
    return (res && res[0] && res[0].ID) || null;
  } finally {
    await tile.closeWithoutSaving();
    app.activeDocument = work;
  }
}

// Motivo de la celda de n px (ht_<tipo>_<n>.png, a escala ~100 %). Si el archivo no existe se usa el
// tile único de 128 px escalado, como en la 1.4. Se reutiliza el de la biblioteca si ya está definido.
async function ensurePattern(type, n) {
  const exact = `HT ${type} ${n}`;
  if (definedPatterns.has(exact)) return definedPatterns.get(exact);
  const legacy = `HT ${type}`;
  if (definedPatterns.has(legacy) && !(await tileEntry(`ht_${type.toLowerCase()}_${n}.png`))) return definedPatterns.get(legacy);

  const lib = await libraryPatternNames();
  const remember = (name, id, tilePx) => { const p = { name, id, tilePx }; definedPatterns.set(name, p); return p; };
  if (lib.has(exact)) return remember(exact, null, n);

  const entry = await tileEntry(`ht_${type.toLowerCase()}_${n}.png`);
  if (entry) return remember(exact, await definePattern(entry, exact), n);

  if (lib.has(legacy)) return remember(legacy, null, TILE_PX);
  const old = await tileEntry(`ht_${type.toLowerCase()}.png`);
  if (!old) throw new Error(`No se encuentra el recurso de semitono (${type}). Reinstala el plugin.`);
  return remember(legacy, await definePattern(old, legacy), TILE_PX);
}

// Escala del motivo: ~100 % con tile exacto; con el tile de 128 px, la de la 1.4
function patternScale(lpi, resolution, tilePx) {
  if (tilePx === TILE_PX) return Math.max(1, 100 * (resolution / lpi) / TILE_PX);
  return tileFor(lpi, resolution).scale;
}

// ¿Hay que cambiar de motivo al variar el LPI? (otra celda entera => otro tile)
function needsNewTile(lpi) {
  const t = state.htTile;
  if (!t.tilePx || t.tilePx === TILE_PX) return false;
  return tileFor(lpi, app.activeDocument.resolution).n !== t.n;
}

// Crea la capa de relleno de motivo en modo Hard Mix (relleno 100 %).
async function makeHalftoneLayer(type, lpi, angle) {
  const res = app.activeDocument.resolution;
  const p = await ensurePattern(type, tileFor(lpi, res).n);
  const pattern = p.id ? { _obj: "pattern", name: p.name, ID: p.id } : { _obj: "pattern", name: p.name };
  const layerId = await bpThenId({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name: "HT PATTERN",
      type: { _obj: "patternLayer", pattern, scale: pct(patternScale(lpi, res, p.tilePx)), angle: deg(angle) } } }); // 🔍
  await bp({ _obj: "set", _target: [layerById(layerId)],
    to: { _obj: "layer", mode: { _enum: "blendMode", _value: "hardMix" }, fillOpacity: pct(100) } });
  state.htTile = { type, n: p.tilePx === TILE_PX ? 0 : p.tilePx, tilePx: p.tilePx };
  return layerId;
}

async function setHalftoneParams(id, lpi, angle) {
  const res = app.activeDocument.resolution;
  await bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
    to: { _obj: "patternLayer", scale: pct(patternScale(lpi, res, state.htTile.tilePx)), angle: deg(angle) } });   // 🔍
}

// Al terminar la sesión de trabajo, quita de la biblioteca los motivos que definió el plugin
// (las capas de relleno llevan su propia copia). Si falla no pasa nada: se reutilizarán por nombre.
async function cleanupPatterns() {
  if (!ownPatterns.size) return;
  try {
    await modal("Open-DTF: limpiar motivos", async () => {
      for (const name of ownPatterns) {
        try { await bp({ _obj: "delete", _target: [{ _ref: "pattern", _name: name }] }); }                      // 🔍
        catch (e) { console.log("No se pudo borrar el motivo", name, e); }
      }
    });
    for (const name of ownPatterns) definedPatterns.delete(name);
    ownPatterns.clear();
  } catch (e) { console.log("cleanupPatterns:", e); }
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
  makeSolid, makeMapDesat, setMapDesat, makeCurves, setCurves, makeThreshold, makeLevels, setLevels, setSolid,
  makeHalftoneLayer, setHalftoneParams, needsNewTile, cleanupPatterns, setShadowBoost
};
