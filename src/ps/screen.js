// Método 2 (opcional): trama final con el motor nativo Imagen > Modo > Mapa de bits > Trama de semitonos.
// Solo se usa en Aplicar. Toda la imagen se procesa dentro de Photoshop.
const { app, constants } = require("photoshop");
const { state } = require("../state");
const { bp, layerById, selectLayer, channel, docById } = require("./bp");

const { previewDescs, vis } = require("./preview");

const SHAPES = { ROUND: "round", LINE: "line", DIAMOND: "diamond", ELLIPSE: "ellipse" };

async function nativeScreenMask({ lpi, angle, htType }) {
  const work = app.activeDocument;
  const L = state.layers;

  let tmp = null;
  // Bound temporary memory while giving small dots subpixel edge coverage.
  const width = work.width;
  const height = work.height;
  const factor = Math.max(1, Math.min(4, Math.floor(Math.sqrt(64000000 / (width * height)))));
  try {
    await bp([vis(L.halftone, false), vis(L.threshold, false),
      vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true)]);
    await bp({ _obj: "duplicate", _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
      name: "__ht_tmp", merged: true });
    tmp = app.activeDocument;
    await bp([
      { _obj: "convertMode", to: { _class: "grayscaleMode" } },
      { _obj: "convertMode", to: { _obj: "bitmapMode",
        resolution: { _unit: "densityUnit", _value: work.resolution * factor },
        method: { _enum: "method", _value: "halftoneScreen" },
        frequency: { _unit: "densityUnit", _value: lpi },
        angle: { _unit: "angleUnit", _value: angle },
        shape: { _enum: "shape", _value: SHAPES[htType] || "round" } } },
      { _obj: "convertMode", to: { _class: "grayscaleMode" }, ratio: 1 }
    ]);
    if (factor > 1) {
      await tmp.resizeImage(width, height, work.resolution, constants.ResampleMethod.BICUBIC);
    }
    app.activeDocument = work;
    await selectLayer(L.art);
    await bp([
      { _obj: "select", _target: [channel("mask")], makeVisible: false },
      { _obj: "applyImageEvent", with: { _obj: "calculation",
        to: [channel("gray"), docById(tmp.id)],
        calculation: { _enum: "calculationType", _value: "normal" } } }
    ]);
  } finally {
    try {
      if (tmp) await tmp.closeWithoutSaving();
    } finally {
      app.activeDocument = work;
      await bp([vis(L.halftone, true),
        { _obj: "select", _target: [channel("RGB")], makeVisible: false },
        ...previewDescs(state.previewMode)]);
    }
  }
}

module.exports = { nativeScreenMask };
