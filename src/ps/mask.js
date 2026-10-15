// Recalcula la máscara de ART como composición de MAP GROUP.
const { state } = require("../state");
const { bp, layerById, selectLayer, channel, setVisible } = require("./bp");
const { restorePreviewVisibility } = require("./preview");

async function refreshMask(s = state.settings) {
  const L = state.layers;

  // Visibilidad de los componentes del mapa según los ajustes
  await setVisible(L.ko, s.knockout);
  await setVisible(L.desat, s.knockout);
  await setVisible(L.halftone, s.halftone);
  await setVisible(L.threshold, !s.halftone);

  await selectLayer(L.art);
  await bp({ _obj: "select", _target: [channel("mask")], makeVisible: false });

  if (!s.knockout) {
    // Sin knockout: todo opaco (máscara blanca)
    await bp({ _obj: "fill", using: { _enum: "fillContents", _value: "white" },
               opacity: { _unit: "percentUnit", _value: 100 }, mode: { _enum: "blendMode", _value: "normal" } });
  } else {
    // Solo MAP GROUP visible, Imagen > Aplicar imagen (combinado) sobre la máscara
    await bp([
      { _obj: "hide", null: [layerById(L.art), layerById(L.shirt)] },
      { _obj: "show", null: [layerById(L.mapGroup)] },
      { _obj: "applyImageEvent", with: { _obj: "calculation",
          to: [channel("RGB"), { _ref: "layer", _enum: "ordinal", _value: "merged" }],
          calculation: { _enum: "calculationType", _value: "normal" } } },     // 🔍
      { _obj: "hide", null: [layerById(L.mapGroup)] }
    ]);
  }
  await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
  await restorePreviewVisibility();
}

module.exports = { refreshMask };
