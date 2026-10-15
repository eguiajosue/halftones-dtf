const { state } = require("../state");
const { bp, layerById, setVisible } = require("./bp");

const setMaskEnabled = (id, on) => bp({ _obj: "set", _target: [layerById(id)],
  to: { _obj: "layer", userMaskEnabled: on } });

// Original / Prenda / Alfa / Máscara
async function setPreviewMode(mode) {
  const L = state.layers;
  state.previewMode = mode;
  switch (mode) {
    case "original":
      await setVisible(L.mapGroup, false);
      await setVisible(L.art, true);
      await setMaskEnabled(L.art, false);
      await setVisible(L.shirt, false);
      break;
    case "shirt":
      await setVisible(L.mapGroup, false);
      await setVisible(L.art, true);
      await setMaskEnabled(L.art, true);
      await setVisible(L.shirt, true);
      break;
    case "alpha":
      await setVisible(L.mapGroup, false);
      await setVisible(L.art, true);
      await setMaskEnabled(L.art, true);
      await setVisible(L.shirt, false);
      break;
    case "mask":
      await setVisible(L.art, false);
      await setVisible(L.shirt, false);
      await setVisible(L.mapGroup, true);
      break;
  }
}

const restorePreviewVisibility = () => setPreviewMode(state.previewMode);

module.exports = { setPreviewMode, restorePreviewVisibility, setMaskEnabled };
