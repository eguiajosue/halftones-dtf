const { action, core, app } = require("photoshop");

const px  = v => ({ _unit: "pixelsUnit",  _value: v });
const pct = v => ({ _unit: "percentUnit", _value: v });
const deg = v => ({ _unit: "angleUnit",   _value: v });
const rgb = ({ r, g, b }) => ({ _obj: "RGBColor", red: r, grain: g, blue: b }); // "grain" = verde
function validId(id, what = "capa") {
  if (typeof id !== "number" || !Number.isFinite(id)) throw new Error(`ID de ${what} inválido (${id})`);
  return id;
}
const layerById = id => ({ _ref: "layer", _id: validId(id) });
const docById   = id => ({ _ref: "document", _id: validId(id, "documento") });
const targetLayer = { _ref: "layer", _enum: "ordinal", _value: "targetEnum" };
const channel = v => ({ _ref: "channel", _enum: "channel", _value: v });

async function bp(descs) {
  const list = Array.isArray(descs) ? descs : [descs];
  let res;
  try {
    res = await action.batchPlay(list, { modalBehavior: "execute" });
  } catch (e) {
    throw new Error(`${list.map(d => d._obj).join(",")}: ${e.message}`);
  }
  res.forEach((r, i) => {
    if (r && r._obj === "error") throw new Error(`${list[i]._obj}: ${r.message}`);
  });
  return res;
}

// Wrapper modal. history:true suspende el historial del documento activo (una sola entrada).
async function modal(name, fn, { history = false } = {}) {
  return core.executeAsModal(async (ctx) => {
    let hid = null;
    if (history && app.activeDocument) {
      hid = await ctx.hostControl.suspendHistory({ documentID: app.activeDocument.id, name });
    }
    try {
      return await fn(ctx);
    } finally {
      if (hid !== null) await ctx.hostControl.resumeHistory(hid);
    }
  }, { commandName: name, interactive: false });
}

const selectLayer = id => bp({ _obj: "select", _target: [layerById(id)], makeVisible: false });
const setVisible = (id, on) => bp({ _obj: on ? "show" : "hide", null: [layerById(id)] });

// Ejecuta descriptores y devuelve el ID de la capa activa al final, en un solo viaje al host
async function bpThenId(descs) {
  const list = Array.isArray(descs) ? descs : [descs];
  const r = await bp([...list, { _obj: "get", _target: [{ _property: "layerID" }, targetLayer] }]);
  return r[r.length - 1].layerID;
}

function findLayer(container, id) {
  for (const l of container.layers) {
    if (l.id === id) return l;
    if (l.layers && l.layers.length) {
      const f = findLayer(l, id);
      if (f) return f;
    }
  }
  return null;
}

const baseName = title => String(title).replace(/\.[^./\\]+$/, "");

module.exports = {
  px, pct, deg, rgb, validId, layerById, docById, targetLayer, channel,
  bp, bpThenId, modal, selectLayer, setVisible, findLayer, baseName
};
