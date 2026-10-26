// Recalcula la máscara de ART como la composición de MAP GROUP.
// Se carga la luminosidad compuesta (solo MAP GROUP visible) como selección y se crea la
// máscara de capa desde ella (conserva los grises). Agrupado en pocas llamadas para ir rápido en vivo.
const { state } = require("../state");
const { bp, layerById, channel } = require("./bp");
const { previewDescs, vis } = require("./preview");

const SELECTION = { _ref: "channel", _property: "selection" };
const selectArt = () => ({ _obj: "select", _target: [layerById(state.layers.art)], makeVisible: false });
const makeMask = how => ({ _obj: "make", new: { _class: "channel" }, at: channel("mask"),
                           using: { _enum: "userMaskEnabled", _value: how } });

async function deleteMask() {
  try {
    await bp([selectArt(), { _obj: "delete", _target: [channel("mask")] }]);
  } catch (e) { /* aún no hay máscara */ }
}

async function refreshMask(s = state.settings) {
  state.maskFresh = false;
  const L = state.layers;
  const parts = [vis(L.ko, s.knockout), vis(L.desat, s.knockout),
                 vis(L.halftone, s.halftone), vis(L.threshold, !s.halftone)];

  if (s.knockout) {
    // Solo MAP GROUP visible -> luminosidad compuesta como selección
    await bp([...parts, vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true),
              { _obj: "set", _target: [SELECTION], to: channel("RGB") },
              vis(L.mapGroup, false)]);
    await deleteMask();
    await bp([selectArt(), makeMask("revealSelection"),
              { _obj: "set", _target: [SELECTION], to: { _enum: "ordinal", _value: "none" } },
              { _obj: "select", _target: [channel("RGB")], makeVisible: false },
              ...previewDescs(state.previewMode)]);
  } else {
    // Sin knockout: todo opaco
    await bp(parts);
    await deleteMask();
    await bp([selectArt(), makeMask("revealAll"),
              { _obj: "select", _target: [channel("RGB")], makeVisible: false },
              ...previewDescs(state.previewMode)]);
  }
  state.maskFresh = true;
}

module.exports = { refreshMask };
