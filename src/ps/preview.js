const { state } = require("../state");
const { bp, layerById } = require("./bp");

const vis = (id, on) => ({ _obj: on ? "show" : "hide", null: [layerById(id)] });
const maskOn = (id, on) => ({ _obj: "set", _target: [layerById(id)], to: { _obj: "layer", userMaskEnabled: on } });

// Descriptores de cada vista (Original / Prenda / Alfa / Máscara), para enviarlos en un solo batchPlay
function previewDescs(mode) {
  const L = state.layers;
  switch (mode) {
    case "original": return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, false), vis(L.shirt, false)];
    case "alpha":    return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, false)];
    case "mask":     return [vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true)];
    default:         return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, true)];
  }
}

async function setPreviewMode(mode) {
  state.previewMode = mode;
  await bp(previewDescs(mode));
}

const restorePreviewVisibility = () => setPreviewMode(state.previewMode);

module.exports = { setPreviewMode, restorePreviewVisibility, previewDescs, vis };
