const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { selectLayer } = require("./bp");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  for (const id of Object.values(state.layers)) {
    if (!findLayer(doc, id)) throw new Error("MISSING_LAYERS");
  }
}

const run = (name, fn) => modal(name, async (ctx) => { validateState(); await fn(ctx); }, { history: true });

const updateLevels = s => run("Halftones DTF: Niveles", async () => {
  await L_.setLevels(state.layers.levels, s);
  await refreshMask(s);
});

const updateShadows = s => run("Halftones DTF: Sombras", async () => {
  await L_.setShadowBoost(s.shadow);
  await refreshMask(s);
});

const updateColors = (s, { knockoutChanged = true } = {}) => run("Halftones DTF: Color", async () => {
  const L = state.layers;
  await L_.setSolid(L.shirt, s.shirt);
  if (knockoutChanged) {
    await L_.setSolid(L.ko, s.knockoutColor);
    await L_.setSolid(L.mapBg, s.knockoutColor);
    await refreshMask(s);
  }
});

const updateKnockout = s => run("Halftones DTF: Knockout", () => refreshMask(s));

// Tipo, LPI o ángulo. Si cambia el tipo se reemplaza la capa de motivo.
const updateHalftone = (s, typeChanged) => run("Halftones DTF: Semitono", async () => {
  const L = state.layers;
  const doc = app.activeDocument;
  if (typeChanged) {
    const old = findLayer(doc, L.halftone);
    await selectLayer(L.threshold);
    const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
    await findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
    await old.delete();
    L.halftone = id;
  } else {
    await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);
  }
  await refreshMask(s);
});

// Aplica todos los ajustes (cambio de preset en estado ACTIVE).
const updateAll = s => run("Halftones DTF: Preset", async () => {
  const L = state.layers;
  const doc = app.activeDocument;
  await L_.setSolid(L.shirt, s.shirt);
  await L_.setSolid(L.ko, s.knockoutColor);
  await L_.setSolid(L.mapBg, s.knockoutColor);
  await L_.setLevels(L.levels, s);
  await L_.setShadowBoost(s.shadow);
  await selectLayer(L.threshold);
  const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
  await findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
  await findLayer(doc, L.halftone).delete();
  L.halftone = id;
  await refreshMask(s);
});

module.exports = { validateState, updateLevels, updateShadows, updateColors, updateKnockout, updateHalftone, updateAll };
