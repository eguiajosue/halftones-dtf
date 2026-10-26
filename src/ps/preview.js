const { state } = require("../state");
const { bp, layerById } = require("./bp");

const vis = (id, on) => ({ _obj: on ? "show" : "hide", null: [layerById(id)] });
const maskOn = (id, on) => ({ _obj: "set", _target: [layerById(id)], to: { _obj: "layer", userMaskEnabled: on } });
const blend = (id, mode) => ({ _obj: "set", _target: [layerById(id)],
                               to: { _obj: "layer", mode: { _enum: "blendMode", _value: mode } } });   // 🔍 grupo en multiply / passThrough

// Visibilidad de las capas que definen el mapa (según knockout y semitono)
function partsDescs(s) {
  const L = state.layers;
  return [vis(L.ko, s.knockout), vis(L.desat, s.knockout), vis(L.halftone, s.halftone), vis(L.threshold, !s.halftone)];
}

// Descriptores de cada vista (Original / Prenda / Alfa / Máscara), para enviarlos en un solo batchPlay.
// stale = la máscara de ART no está al día (ajuste en curso): se muestra el mapa en vivo, que Photoshop
// compone solo a la resolución de pantalla, en lugar de la máscara. Prenda = ART × mapa (exacto con prenda negra).
function previewDescs(mode, stale = false, s = state.settings) {
  const L = state.layers;
  switch (mode) {
    case "original": return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, false), vis(L.shirt, false)];
    case "alpha":
      if (!stale) return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, false)];
      if (!s.knockout) return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, false), vis(L.shirt, false)];
      return [...partsDescs(s), blend(L.mapGroup, "passThrough"), vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true)];
    case "mask":
      return [...(stale ? partsDescs(s) : []), blend(L.mapGroup, "passThrough"),
              vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true)];
    default:
      if (!stale) return [vis(L.mapGroup, false), vis(L.art, true), maskOn(L.art, true), vis(L.shirt, true)];
      return [...partsDescs(s), blend(L.mapGroup, "multiply"), vis(L.art, true), maskOn(L.art, false),
              vis(L.shirt, true), vis(L.mapGroup, s.knockout)];
  }
}

async function setPreviewMode(mode, s = state.settings) {
  state.previewMode = mode;
  await bp(previewDescs(mode, !state.maskFresh, s));
}

module.exports = { setPreviewMode, previewDescs, vis, blend };
