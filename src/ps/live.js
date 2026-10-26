const { app } = require("photoshop");
const { state } = require("../state");
const perf = require("../perf");
const { modal, findLayer, selectLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  const present = new Set();
  (function collect(container) {
    for (const l of container.layers) {
      present.add(l.id);
      if (l.layers && l.layers.length) collect(l);
    }
  })(doc);
  for (const id of Object.values(state.layers)) {
    if (!present.has(id)) throw new Error("MISSING_LAYERS");
  }
}

async function replaceHalftone(s) {
  const L = state.layers;
  const doc = app.activeDocument;
  const old = findLayer(doc, L.halftone);
  await selectLayer(L.threshold);
  const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
  await findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
  await old.delete();
  L.halftone = id;
}

// Aplica en una sola operación modal (una entrada de historial) solo lo que cambió.
// kinds: shirt, ko, levels, shadow, ht, htType, mask, preview, flushMask
const MASK_KINDS = ["ko", "levels", "shadow", "ht", "htType", "mask"];

function sync(s, kinds) {
  const label = "Vivo: " + [...kinds].filter(k => k !== "flushMask").sort().join("+") + (kinds.has("flushMask") ? " (máscara)" : "");
  return perf.track(label, () => syncModal(s, kinds));
}

function syncModal(s, kinds) {
  return modal("Open-DTF: Ajuste en vivo", async () => {
    validateState();
    const L = state.layers;
    if (kinds.has("shirt")) await L_.setSolid(L.shirt, s.shirt);
    if (kinds.has("ko")) { await L_.setSolid(L.ko, s.knockoutColor); await L_.setSolid(L.mapBg, s.knockoutColor); }
    if (kinds.has("levels")) await L_.setLevels(L.levels, s);
    if (kinds.has("shadow")) await L_.setShadowBoost(s.shadow);
    if (kinds.has("htType")) await replaceHalftone(s);
    else if (kinds.has("ht")) await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);

    // La máscara (cara: compone todo el documento al 100 %) solo se recalcula con "flushMask";
    // mientras se arrastra, la vista usa el mapa en vivo (ver preview.js).
    const maskChanged = MASK_KINDS.some(k => kinds.has(k));
    if (maskChanged) state.maskFresh = false;
    if (kinds.has("flushMask") && !state.maskFresh) await refreshMask(s);          // restaura también la vista
    else if (maskChanged || kinds.has("preview")) await setPreviewMode(state.previewMode, s);
  }, { history: true });
}

module.exports = { validateState, sync, ALL_KINDS: ["shirt", "ko", "levels", "shadow", "htType", "mask", "flushMask"] };
