const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer, selectLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");

function activeDocId() {
  try { return app.activeDocument ? app.activeDocument.id : null; } catch (e) { return null; }
}

// Todos los IDs de capa del documento en un solo recorrido (cada lectura del DOM es una consulta al host)
function collectIds(container, out = new Set()) {
  for (const l of container.layers) {
    out.add(l.id);
    if (l.layers && l.layers.length) collectIds(l, out);
  }
  return out;
}

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  const ids = collectIds(doc);
  if (Object.values(state.layers).some(id => !ids.has(id))) throw new Error("MISSING_LAYERS");
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

async function sync(s, kinds) {
  // Fuera del modal: con otro documento activo no se suspende el historial de nadie
  if (activeDocId() !== state.workDocId) throw new Error("WRONG_DOC");
  return modal("Open-DTF: Ajuste en vivo", async () => {
    validateState();
    const L = state.layers;
    const before = { layers: { ...L }, shadowOn: state.shadowOn };
    try {
      if (kinds.has("shirt")) await L_.setSolid(L.shirt, s.shirt);
      if (kinds.has("ko")) { await L_.setSolid(L.ko, s.knockoutColor); await L_.setSolid(L.mapBg, s.knockoutColor); }
      if (kinds.has("levels")) await L_.setLevels(L.levels, s);
      if (kinds.has("shadow")) await L_.setShadowBoost(s.shadow);
      if (kinds.has("htType")) await replaceHalftone(s);
      else if (kinds.has("ht")) await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);

      if (MASK_KINDS.some(k => kinds.has(k))) await refreshMask(s);   // restaura también la vista
      else if (kinds.has("preview")) await setPreviewMode(state.previewMode);
    } catch (e) {
      // modal() revierte el historial: los IDs y el estado de sombras vuelven con él
      Object.assign(state.layers, before.layers);
      state.shadowOn = before.shadowOn;
      throw e;
    }
  }, { history: true, docId: state.workDocId });
}

module.exports = { validateState, sync, ALL_KINDS: ["shirt", "ko", "levels", "shadow", "htType", "mask"] };
