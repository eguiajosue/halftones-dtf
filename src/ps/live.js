const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer, selectLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  for (const id of Object.values(state.layers)) {
    if (!findLayer(doc, id)) throw new Error("MISSING_LAYERS");
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
// kinds: shirt, ko, levels, shadow, ht, htType, mask, preview
const MASK_KINDS = ["ko", "levels", "shadow", "ht", "htType", "mask"];

function sync(s, kinds) {
  return modal("Halftones DTF: Ajuste en vivo", async () => {
    validateState();
    const L = state.layers;
    if (kinds.has("shirt")) await L_.setSolid(L.shirt, s.shirt);
    if (kinds.has("ko")) { await L_.setSolid(L.ko, s.knockoutColor); await L_.setSolid(L.mapBg, s.knockoutColor); }
    if (kinds.has("levels")) await L_.setLevels(L.levels, s);
    if (kinds.has("shadow")) await L_.setShadowBoost(s.shadow);
    if (kinds.has("htType")) await replaceHalftone(s);
    else if (kinds.has("ht")) await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);

    if (MASK_KINDS.some(k => kinds.has(k))) await refreshMask(s);   // restaura también la vista
    else if (kinds.has("preview")) await setPreviewMode(state.previewMode);
  }, { history: true });
}

module.exports = { validateState, sync, ALL_KINDS: ["shirt", "ko", "levels", "shadow", "htType", "mask"] };
