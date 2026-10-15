const { action, core } = require("photoshop");

// Selector de color nativo de Photoshop. Devuelve {r,g,b} o null si se cancela.
async function pickColor(initial) {
  const res = await core.executeAsModal(() => action.batchPlay([{
    _obj: "showColorPicker", context: "Halftones DTF",
    color: { _obj: "RGBColor", red: initial.r, grain: initial.g, blue: initial.b }
  }], {}), { commandName: "Elegir color" });
  const r = res && res[0];
  if (!r || r._obj === "error" || r.cancelled) return null;
  const c = r.RGBFloatColor || r.color || r;                         // 🔍 depende de la versión
  if (c.red === undefined) return null;
  return { r: Math.round(c.red), g: Math.round(c.grain), b: Math.round(c.blue) };
}

const toCss = c => `rgb(${c.r},${c.g},${c.b})`;

module.exports = { pickColor, toCss };
