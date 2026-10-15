// Recalcula la máscara de ART como la composición de MAP GROUP.
// Sin Aplicar imagen: se carga la luminosidad compuesta (solo MAP GROUP visible) como selección
// y se crea la máscara de capa desde esa selección (conserva los grises).
const { state } = require("../state");
const { bp, layerById, selectLayer, channel, setVisible } = require("./bp");
const { restorePreviewVisibility } = require("./preview");

const SELECTION = { _ref: "channel", _property: "selection" };
const selectNone = () => bp({ _obj: "set", _target: [SELECTION], to: { _enum: "ordinal", _value: "none" } });
const selectComposite = () => bp({ _obj: "set", _target: [SELECTION], to: channel("RGB") });

async function deleteMask() {
  try {
    await bp({ _obj: "delete", _target: [channel("mask")] });
  } catch (e) { /* aún no hay máscara */ }
}

const makeMask = how => bp({ _obj: "make", new: { _class: "channel" }, at: channel("mask"),
                             using: { _enum: "userMaskEnabled", _value: how } });

async function refreshMask(s = state.settings) {
  const L = state.layers;

  // Visibilidad de los componentes del mapa según los ajustes
  await setVisible(L.ko, s.knockout);
  await setVisible(L.desat, s.knockout);
  await setVisible(L.halftone, s.halftone);
  await setVisible(L.threshold, !s.halftone);

  if (!s.knockout) {
    // Sin knockout: todo opaco
    await selectLayer(L.art);
    await deleteMask();
    await makeMask("revealAll");
  } else {
    // Solo MAP GROUP visible -> luminosidad compuesta como selección
    await bp([
      { _obj: "hide", null: [layerById(L.art), layerById(L.shirt)] },
      { _obj: "show", null: [layerById(L.mapGroup)] }
    ]);
    await selectComposite();
    await bp({ _obj: "hide", null: [layerById(L.mapGroup)] });
    await selectLayer(L.art);
    await deleteMask();
    await makeMask("revealSelection");
    await selectNone();
  }
  await selectLayer(L.art);
  await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
  await restorePreviewVisibility();
}

module.exports = { refreshMask };
