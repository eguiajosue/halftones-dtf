// Método 2 (opcional): trama final con el motor nativo Imagen > Modo > Mapa de bits > Trama de semitonos.
// Solo se usa en Aplicar. Toda la imagen se procesa dentro de Photoshop.
const { app } = require("photoshop");
const { state } = require("../state");
const { bp, layerById, selectLayer, channel, setVisible, docById } = require("./bp");

const SHAPES = { ROUND: "round", LINE: "line", DIAMOND: "diamond", ELLIPSE: "ellipse" };

async function nativeScreenMask({ lpi, angle, htType }) {
  const work = app.activeDocument;
  const L = state.layers;

  // 1) Composición de MAP GROUP sin la capa de motivo, a un documento temporal
  await setVisible(L.halftone, false);
  await bp([{ _obj: "hide", null: [layerById(L.art), layerById(L.shirt)] },
            { _obj: "show", null: [layerById(L.mapGroup)] }]);
  await bp({ _obj: "duplicate", _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
             name: "__ht_tmp", merged: true });                                                    // 🔍
  const tmp = app.activeDocument;

  // 2) Escala de grises -> Mapa de bits (trama de semitonos) -> Escala de grises
  await bp([
    { _obj: "convertMode", to: { _class: "grayscaleMode" } },
    { _obj: "convertMode", to: { _obj: "bitmapMode",
        resolution: { _unit: "densityUnit", _value: tmp.resolution },
        method:     { _enum: "method", _value: "halftoneScreen" },
        frequency:  { _unit: "densityUnit", _value: lpi },
        angle:      { _unit: "angleUnit",   _value: angle },
        shape:      { _enum: "shape", _value: SHAPES[htType] || "round" } } },                    // 🔍
    { _obj: "convertMode", to: { _class: "grayscaleMode" }, ratio: 1 }                            // 🔍
  ]);

  // 3) Aplicar imagen desde el documento temporal a la máscara de ART (sin portapapeles)
  app.activeDocument = work;
  await selectLayer(L.art);
  await bp([
    { _obj: "select", _target: [channel("mask")], makeVisible: false },
    { _obj: "applyImageEvent", with: { _obj: "calculation",
        to: [channel("gray"), { _ref: "layer", _name: "Background" }, docById(tmp.id)],
        calculation: { _enum: "calculationType", _value: "normal" } } }                           // 🔍
  ]);
  await tmp.closeWithoutSaving();
  app.activeDocument = work;
  await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
  await bp({ _obj: "hide", null: [layerById(L.mapGroup)] });
  await setVisible(L.halftone, true);
}

module.exports = { nativeScreenMask };
