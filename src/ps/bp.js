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

// Wrapper modal. history:true suspende el historial (una sola entrada) del documento docId, o del activo.
// Si fn falla, la entrada se descarta (resumeHistory(hid, false)): el documento vuelve a como estaba.
async function modal(name, fn, { history = false, docId = null } = {}) {
  return core.executeAsModal(async (ctx) => {
    let hid = null;
    const id = docId || (app.activeDocument && app.activeDocument.id);
    if (history && id) hid = await ctx.hostControl.suspendHistory({ documentID: id, name });
    let ok = false;
    try {
      const r = await fn(ctx);
      ok = true;
      return r;
    } finally {
      if (hid !== null) {
        if (ok) await ctx.hostControl.resumeHistory(hid, true);
        else { try { await ctx.hostControl.resumeHistory(hid, false); } catch (e) { console.log("Open-DTF: no se pudo revertir el historial:", e); } }
      }
    }
  }, { commandName: name, interactive: false });
}

const selectLayer = id => bp({ _obj: "select", _target: [layerById(id)], makeVisible: false });
const setVisible = (id, on) => bp({ _obj: on ? "show" : "hide", null: [layerById(id)] });

async function lastLayerId() {
  const r = await bp({ _obj: "get", _target: [{ _property: "layerID" }, targetLayer] });
  return r[0].layerID;
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
  bp, modal, selectLayer, setVisible, lastLayerId, findLayer, baseName
};
