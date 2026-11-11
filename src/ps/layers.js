// Constructores de capas. Todo con descriptores nativos de Photoshop.
const { app } = require("photoshop");
const { storage } = require("uxp");
const { TILE_PX, state } = require("../state");
const {
  bp, px, pct, deg, rgb, layerById, targetLayer, selectLayer, lastLayerDesc
} = require("./bp");

// Crea la capa y lee su ID en un solo viaje a Photoshop. `extra` = descriptores que actúan
// sobre la capa recién creada (que queda como capa activa), enviados entre el make y el get.
async function makeAndId(make, extra = []) {
  const res = await bp([make, ...extra, lastLayerDesc]);
  return res[res.length - 1].layerID;
}

const makeSolid = (name, color, mode = "normal") => makeAndId({ _obj: "make", _target: [{ _ref: "contentLayer" }],
  using: { _obj: "contentLayer", name, mode: { _enum: "blendMode", _value: mode },
           type: { _obj: "solidColorLayer", color: rgb(color) } } });

const makeHueSatDesat = name => makeAndId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
  using: { _obj: "adjustmentLayer", name,
    type: { _obj: "hueSaturation", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
            colorize: false,
            adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: -100, lightness: 0 }] } } });

const makeThreshold = (name, level = 128) => makeAndId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
  using: { _obj: "adjustmentLayer", name, type: { _obj: "thresholdClassEvent", level } } });

async function setLevels(id, { black, gamma, white, outBlack, outWhite }) {
  await bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }],
    to: { _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
      adjustment: [{ _obj: "levelsAdjustment",
        channel: { _ref: "channel", _enum: "channel", _value: "composite" },
        input: [black, white], gamma, output: [outBlack, outWhite] }] } });
}

async function makeLevels(name, s) {
  const id = await makeAndId({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "levels",
      presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } } } });
  await setLevels(id, s);
  return id;
}

const setSolid = (id, c) => bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
  to: { _obj: "solidColorLayer", color: rgb(c) } });

// Varios colores sólidos en un solo batchPlay: pares [id, color]
const setSolids = pairs => bp(pairs.map(([id, c]) => ({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
  to: { _obj: "solidColorLayer", color: rgb(c) } })));

// ---- Semitono -------------------------------------------------------------

const definedPatterns = new Map();   // nombre -> ID (o null) definido en esta sesión

// Define (una vez por sesión) el motivo de umbral a partir del PNG propio del plugin.
async function ensurePattern(type) {
  const name = `HT ${type}`;
  if (definedPatterns.has(name)) return { name, id: definedPatterns.get(name) };

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

function patternScale(lpi, resolution) {
  return Math.max(1, 100 * (resolution / lpi) / TILE_PX);
}

// Crea la capa de relleno de motivo en modo Hard Mix (relleno 100 %).
async function makeHalftoneLayer(type, lpi, angle) {
  const { name, id } = await ensurePattern(type);
  const res = app.activeDocument.resolution;
  const pattern = id ? { _obj: "pattern", name, ID: id } : { _obj: "pattern", name };
  // make + modo Hard Mix (sobre la capa recién creada, que es la activa) + lectura del ID: un solo viaje
  return makeAndId(
    { _obj: "make", _target: [{ _ref: "contentLayer" }],
      using: { _obj: "contentLayer", name: "HT PATTERN",
        type: { _obj: "patternLayer", pattern, scale: pct(patternScale(lpi, res)), angle: deg(angle) } } }, // 🔍
    [{ _obj: "set", _target: [targetLayer],
       to: { _obj: "layer", mode: { _enum: "blendMode", _value: "hardMix" }, fillOpacity: pct(100) } }]);
}

async function setHalftoneParams(id, lpi, angle) {
  const res = app.activeDocument.resolution;
  await bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
    to: { _obj: "patternLayer", scale: pct(patternScale(lpi, res)), angle: deg(angle) } });   // 🔍
}

// Cambia el motivo de una capa de semitono existente sin recrearla. Devuelve true solo si Photoshop
// confirma el cambio (el nombre del motivo aparece en la capa); si no, el llamador la reemplaza.
async function setHalftonePattern(id, type, lpi, angle) {
  const { name, id: pid } = await ensurePattern(type);
  const res = app.activeDocument.resolution;
  const pattern = pid ? { _obj: "pattern", name, ID: pid } : { _obj: "pattern", name };
  await bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
    to: { _obj: "patternLayer", pattern, scale: pct(patternScale(lpi, res)), angle: deg(angle) } });   // 🔍
  const r = await bp({ _obj: "get", _target: [layerById(id)] });                                      // 🔍
  return JSON.stringify(r[0]).includes(name);
}

// ---- Realce de sombras (Sombras/Iluminaciones como filtro inteligente) ------

const selectDesc = id => ({ _obj: "select", _target: [layerById(id)], makeVisible: false });
const deleteFilterDesc = id => ({ _obj: "delete", _target: [{ _ref: "filterFX", _index: 1 }, layerById(id)] });  // 🔍
const adaptDesc = amount => ({ _obj: "adaptCorrect",
  sdwM: { _obj: "adaptCorrectTones", amount: pct(amount), width: pct(50), radius: px(30) },
  hglM: { _obj: "adaptCorrectTones", amount: pct(0),      width: pct(50), radius: px(30) },
  blackClip: 0.01, whiteClip: 0.01, center: 0, colorCorrection: 20 });                                          // 🔍

async function applyShadowBoost(layerId, amount) {
  await bp([selectDesc(layerId), adaptDesc(amount)]);
}

async function removeSmartFilters(layerId) {
  try {
    await bp(deleteFilterDesc(layerId));
  } catch (e) { /* sin filtro: nada que borrar */ }
}

// Reaplica el realce en ART y MAP ART (así la máscara también lo refleja).
// Camino rápido: todo en un único batchPlay. Si falla, se repite paso a paso (tolera filtros ausentes).
async function setShadowBoost(amount) {
  const L = state.layers;
  const ids = [L.art, L.mapArt];
  try {
    const descs = [];
    for (const id of ids) {
      descs.push(selectDesc(id));
      if (state.shadowOn) descs.push(deleteFilterDesc(id));
      if (amount > 0) descs.push(adaptDesc(amount));
    }
    await bp(descs);
  } catch (e) {
    console.log("Realce de sombras: batch fallido, se repite paso a paso:", e);
    for (const id of ids) {
      if (state.shadowOn) await removeSmartFilters(id);
      if (amount > 0) await applyShadowBoost(id, amount);
    }
  }
  state.shadowOn = amount > 0;
}

module.exports = {
  makeSolid, makeHueSatDesat, makeThreshold, makeLevels, setLevels, setSolid, setSolids,
  makeHalftoneLayer, setHalftoneParams, setHalftonePattern, ensurePattern, setShadowBoost, applyShadowBoost
};
