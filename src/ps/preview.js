const { state } = require("../state");
const { bp, layerById, channel } = require("./bp");

const vis = (id, on) => ({ _obj: on ? "show" : "hide", null: [layerById(id)] });
const maskOn = (id, on) => ({ _obj: "set", _target: [layerById(id)], to: { _obj: "layer", userMaskEnabled: on } });

// Descriptores de cada vista (Original / Prenda / Alfa / Máscara), para enviarlos en un solo batchPlay
function previewDescs(mode) {
  const L = state.layers;
  if (mode !== "mask") return [
    { _obj: "select", _target: [channel("RGB")], makeVisible: false },
    ...imagePreviewDescs(mode)
  ];
  return imagePreviewDescs(mode);
}

function imagePreviewDescs(mode) {
  const L = state.layers;
  switch (mode) {
    case "original": return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, false), vis(L.shirt, false)];
    case "alpha":    return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, false)];
    case "mask": return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, false),
      { _obj: "select", _target: [layerById(L.art)], makeVisible: false },
      { _obj: "select", _target: [channel("mask")], makeVisible: true }];
    default:         return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, true)];
  }
}

async function setPreviewMode(mode) {
  state.previewMode = mode;
  await bp(previewDescs(mode));
}

const restorePreviewVisibility = () => setPreviewMode(state.previewMode);

module.exports = { setPreviewMode, restorePreviewVisibility, previewDescs, vis };

