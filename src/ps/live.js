const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer, selectLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
// Se recorre el árbol de capas una sola vez (cada acceso a .layers es una llamada al host).
function collectIds(container, ids) {
  for (const l of container.layers) {
    ids.add(l.id);
    if (l.layers && l.layers.length) collectIds(l, ids);
  }
  return ids;
}

function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  const ids = collectIds(doc, new Set());
  for (const id of Object.values(state.layers)) {
    if (!ids.has(id)) throw new Error("MISSING_LAYERS");
  }
}

async function replaceHalftone(s) {
  const L = state.layers;
  const doc = app.activeDocument;
  // Camino rápido: cambiar el motivo de la capa existente. Si Photoshop no lo acepta (o no lo confirma),
  // se recuerda y se usa el reemplazo clásico.
  if (state.setPatternOk !== false) {
    let ok = false;
    try { ok = await L_.setHalftonePattern(L.halftone, s.htType, s.lpi, s.angle); }
    catch (e) { console.log("Motivo en sitio no disponible:", e); }
    state.setPatternOk = ok;
    if (ok) return;
  }
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
  return modal("Open-DTF: Ajuste en vivo", async () => {
    validateState();
    const L = state.layers;
    if (kinds.has("shirt")) await L_.setSolid(L.shirt, s.shirt);
    if (kinds.has("ko")) await L_.setSolids([[L.ko, s.knockoutColor], [L.mapBg, s.knockoutColor]]);
    if (kinds.has("levels")) await L_.setLevels(L.levels, s);
    if (kinds.has("shadow")) await L_.setShadowBoost(s.shadow);
    if (kinds.has("htType")) await replaceHalftone(s);
    else if (kinds.has("ht")) await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);

    // La máscara de ART solo se ve en las vistas Prenda/Alfa. En Máscara (MAP GROUP ya es la composición viva)
    // y Original se salta el recálculo y se marca como pendiente. "mask" y "htType" cambian visibilidades:
    // esos siempre recalculan.
    const usesMask = state.previewMode === "shirt" || state.previewMode === "alpha";
    const mustRefresh = kinds.has("mask") || kinds.has("htType");
    let refreshed = false;
    if (MASK_KINDS.some(k => kinds.has(k))) {
      if (usesMask || mustRefresh) { await refreshMask(s); state.maskStale = false; refreshed = true; }   // restaura también la vista
      else state.maskStale = true;
    }
    if (!refreshed && kinds.has("preview")) {
      if (state.maskStale && usesMask) { await refreshMask(s); state.maskStale = false; }
      else await setPreviewMode(state.previewMode);
    }
  }, { history: true });
}

module.exports = { validateState, sync, ALL_KINDS: ["shirt", "ko", "levels", "shadow", "htType", "mask"] };
