// GENERADO por tools/build.js a partir de src/. No editar a mano.
(function (nativeRequire) {
  var defs = {}, cache = {};
  function norm(from, req) {
    var parts = from.split("/").slice(0, -1);
    req.split("/").forEach(function (seg) {
      if (seg === "" || seg === ".") return;
      if (seg === "..") parts.pop(); else parts.push(seg);
    });
    var p = parts.join("/");
    return /\.js$/.test(p) ? p : p + ".js";
  }
  function load(id) {
    if (cache[id]) return cache[id].exports;
    if (!defs[id]) throw new Error("Módulo no encontrado: " + id);
    var m = { exports: {} };
    cache[id] = m;
    defs[id](m, m.exports, function (r) { return r.charAt(0) === "." ? load(norm(id, r)) : nativeRequire(r); });
    return m.exports;
  }
defs["src/main.js"] = function (module, exports, require) {
const { app } = require("photoshop");
const { state, DEFAULTS, HT_TYPES, CLEANUPS, resetState } = require("./state");
const { debounce, createQueue, clamp } = require("./util");
const { RES, toPx, fromPx, lpiToLpc } = require("./ui/units");
const { pickColor, toCss } = require("./ui/colorPicker");
const sliders = require("./ui/levelsSlider");
const presets = require("./presets");
const pipeline = require("./ps/pipeline");
const live = require("./ps/live");
const { setPreviewMode } = require("./ps/preview");
const { modal } = require("./ps/bp");
const events = require("./ps/events");

const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const S = state.settings;
const queue = createQueue();

const prefs = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
};
let unit = prefs.get("unit", "in");
let uiLocked = false;

// ---------- utilidades de UI ----------
const pickerIndex = el => (el.selectedIndex >= 0 ? el.selectedIndex : 0);
const setPicker = (el, i) => { el.selectedIndex = i; };
const num = (el, d) => { const v = parseFloat(el.value); return Number.isFinite(v) ? v : d; };

const setHidden = (el, hidden) => (hidden ? el.classList.add("hidden") : el.classList.remove("hidden"));
const setActive = (el, on) => (on ? el.classList.add("active") : el.classList.remove("active"));
const setDisabled = (el, on) => (on ? el.setAttribute("disabled", "") : el.removeAttribute("disabled"));

// Tamaño del lienzo en px (según versión, width/height son número o UnitValue)
const dimPx = v => (typeof v === "number" ? v : v && typeof v.as === "function" ? v.as("px") : Number(v && v.value !== undefined ? v.value : v));

function status(msg) { $("statusLine").textContent = msg || ""; }
async function fail(e) {
  const m = e && e.message ? e.message : String(e);
  if (m === "WRONG_DOC") return lock("Vuelve al documento de trabajo o pulsa Cancelar");
  if (m === "MISSING_LAYERS") {
    status("Las capas de trabajo ya no existen (¿deshacer?). Pulsa Cancelar.");
    return;
  }
  status(m);
  console.log("Halftones DTF:", e);
}

function showStep() {
  const active = state.phase === "ACTIVE";
  setHidden($("step1"), active);
  setHidden($("step2"), !active);
}

function lock(msg) {
  uiLocked = true;
  $("lockBanner").textContent = msg;
  $("lockBanner").classList.remove("hidden");
  $$("#step2 sp-button, #step2 sp-action-button, #step2 sp-checkbox, #step2 input, #step2 sp-picker")
    .forEach(e => setDisabled(e, true));
}
function unlock() {
  if (!uiLocked) return;
  uiLocked = false;
  $("lockBanner").classList.add("hidden");
  $$("#step2 [disabled]").forEach(e => e.removeAttribute("disabled"));
}

function resetToIdle() {
  resetState();
  unlock();
  showStep();
  updateCurrentPrintSize(true);
}

// ---------- tamaño actual ----------
function currentDoc() { try { return app.activeDocument; } catch (e) { return null; } }

let sizeSig = null;

function updateCurrentPrintSize(force) {
  const doc = currentDoc();
  setDisabled($("btnRun"), !doc);
  if (!doc) {
    $("lblCurrentSize").textContent = "Tamaño actual a 300 ppi: —";
    $("inW").value = ""; $("inH").value = ""; sizeSig = null;
    return;
  }
  const wpx = dimPx(doc.width), hpx = dimPx(doc.height);
  const w = fromPx(wpx, unit), h = fromPx(hpx, unit);
  $("lblCurrentSize").textContent = `Tamaño actual a 300 ppi: ${w} × ${h} ${unit}`;
  // Valor inicial = tamaño del lienzo; solo se reescribe si cambia el documento, su tamaño o la unidad
  const sig = `${doc.id}:${wpx}x${hpx}:${unit}`;
  if (force || sig !== sizeSig) { $("inW").value = w; $("inH").value = h; sizeSig = sig; }
}

// Edición proporcional: cambiar un lado recalcula el otro con la proporción del lienzo
function linkSize(from) {
  const doc = currentDoc(); if (!doc) return;
  const ratio = dimPx(doc.height) / dimPx(doc.width);
  const v = parseFloat(String($(from).value).replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return;
  if (from === "inW") $("inH").value = +(v * ratio).toFixed(3);
  else $("inW").value = +(v / ratio).toFixed(3);
}

function updateLpiLabel() {
  $("lblLpi").textContent = unit === "in" ? "" : `(${lpiToLpc(S.lpi).toFixed(1)} LPC)`;
}

// ---------- sincronización ajustes <-> UI ----------
let sInput, sOutput, sShadow;

function syncUI() {
  $("chkHalftone").checked = S.halftone;
  setPicker($("selHtType"), Math.max(0, HT_TYPES.indexOf(S.htType)));
  $("inLpi").value = S.lpi;
  $("inAngle").value = S.angle;
  $$("[data-bind=knockout]").forEach(e => { e.checked = S.knockout; });
  $$(".sw").forEach(e => { e.style.background = toCss(S[e.dataset.color]); });
  $$(".btnLink").forEach(e => e.setAttribute("data-linked", String(S.linked)));
  $("inBlack").value = S.black; $("inGamma").value = S.gamma; $("inWhite").value = S.white;
  $("inOutBlack").value = S.outBlack; $("inOutWhite").value = S.outWhite;
  sInput.set({ black: S.black, gamma: S.gamma, white: S.white });
  sOutput.set({ outBlack: S.outBlack, outWhite: S.outWhite });
  sShadow.set({ shadow: S.shadow });
  $("lblShadow").textContent = S.shadow;
  setPicker($("radCleanup"), Math.max(0, CLEANUPS.indexOf(S.cleanup)));
  $("chkDefringe").checked = S.defringe;
  $("chkNativeFinal").checked = S.nativeFinal;
  $$("#segPreview sp-action-button").forEach(b => setActive(b, b.dataset.mode === state.previewMode));
  updateLpiLabel();
}

// ---------- operaciones en vivo (debounce + cola) ----------
function liveOp(fn) {
  if (state.phase !== "ACTIVE" || uiLocked) return;
  queue(async () => { try { status(""); await fn(); } catch (e) { await fail(e); } });
}
const dLevels = debounce(() => liveOp(() => live.updateLevels(S)), 120);
const dShadow = debounce(() => liveOp(() => live.updateShadows(S)), 120);
const dHalftone = debounce(() => liveOp(() => live.updateHalftone(S, false)), 250);

function onLevelsChange(v) {
  S.black = v.black; S.gamma = v.gamma; S.white = v.white;
  $("inBlack").value = v.black; $("inGamma").value = v.gamma; $("inWhite").value = v.white;
  dLevels();
}
function onOutputChange(v) {
  S.outBlack = v.outBlack; S.outWhite = v.outWhite;
  $("inOutBlack").value = v.outBlack; $("inOutWhite").value = v.outWhite;
  dLevels();
}
function onShadowChange(v) {
  S.shadow = v.shadow; $("lblShadow").textContent = v.shadow;
  dShadow();
}

// Campos numéricos de niveles (con flechas ±1, Mayús ±10)
function bindNumber(el, apply, { step = 1, decimals = 0 } = {}) {
  el.addEventListener("change", () => apply(num(el, 0)));
  el.addEventListener("keydown", e => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const d = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
    const v = +(num(el, 0) + d).toFixed(decimals);
    el.value = v;
    apply(v);
    e.preventDefault();
  });
}

// ---------- colores ----------
async function onSwatch(key) {
  const c = await pickColor(S[key]);
  if (!c) return;
  S[key] = c;
  if (S.linked) S.knockoutColor = S.shirt = c;
  syncUI();
  liveOp(() => live.updateColors(S));
}

// ---------- presets ----------
async function refreshPresets(selected) {
  const names = await presets.list();
  const idx = Math.max(0, names.indexOf(selected || prefs.get("lastPreset", "Default")));
  // Se recrea el picker completo (con sus items) para que UXP lo renderice bien
  $("presetHolder").innerHTML = '<sp-picker id="presetPicker" class="grow" label="Preset"><sp-menu slot="options">' +
    names.map(n => `<sp-menu-item>${n.replace(/[<&]/g, "")}</sp-menu-item>`).join("") + "</sp-menu></sp-picker>";
  $("presetPicker").selectedIndex = idx;
  $("presetPicker").addEventListener("change", onPresetChange);
  return names[idx];
}
const currentPresetName = () => {
  const items = $("presetPicker").querySelectorAll("sp-menu-item");
  const it = items[pickerIndex($("presetPicker"))];
  return it ? it.textContent : "Default";
};

async function onPresetChange() {
  const name = currentPresetName();
  prefs.set("lastPreset", name);
  const loaded = await presets.load(name);
  Object.assign(S, loaded);
  syncUI();
  if (state.phase === "ACTIVE") liveOp(() => live.updateAll(S));
}

async function askText(dlgId, okId, cancelId, setup) {
  const dlg = $(dlgId);
  const done = new Promise(res => {
    $(okId).onclick = e => { e.preventDefault(); dlg.close("ok"); res(true); };
    $(cancelId).onclick = e => { e.preventDefault(); dlg.close("cancel"); res(false); };
  });
  setup();
  const shown = dlg.uxpShowModal({ title: " ", resize: "none", size: { width: 300, height: 220 } });
  const r = await Promise.race([shown, done]);
  return r === "ok" || r === true;
}

// ---------- Preparar / Aplicar / Cancelar ----------
function targetSize() {
  const doc = currentDoc();
  let w = num($("inW"), 0), h = num($("inH"), 0);
  let widthPx = toPx(w, unit), heightPx = toPx(h, unit);
  if (!widthPx || !heightPx) { widthPx = dimPx(doc.width); heightPx = dimPx(doc.height); }   // 0 o vacío: tamaño actual
  return { widthPx, heightPx };
}

async function onRun() {
  const doc = currentDoc();
  if (!doc) return status("Abre un documento primero.");
  const { widthPx, heightPx } = targetSize();
  if (Math.max(widthPx, heightPx) > 20000) {
    return status(`Tamaño muy grande (${widthPx}×${heightPx} px). Máximo recomendado: 20 000 px por lado.`);
  }
  status("");
  try {
    const ok = await pipeline.runPrep({ ...S, widthPx, heightPx });
    if (ok) { state.previewMode = "shirt"; syncUI(); }
    showStep();
  } catch (e) { await fail(e); resetToIdle(); }
}

async function onApply() {
  status("");
  try {
    await pipeline.applyPrep(S);
    resetToIdle();
    updateCurrentPrintSize(true);
  } catch (e) {
    if (e.message === "CANCELLED") return status("Cancelado.");
    await fail(e);
  }
}

async function onCancel() {
  try { await pipeline.cancelPrep(); } catch (e) { console.log(e); }
  resetToIdle();
}

// ---------- arranque ----------
function bindUI() {
  // paso 1
  $("btnUnit").addEventListener("change", () => {
    unit = ["in", "cm", "mm"][pickerIndex($("btnUnit"))];
    prefs.set("unit", unit);
    updateCurrentPrintSize(true); updateLpiLabel();
  });
  for (const id of ["inW", "inH"]) {
    for (const ev of ["input", "change"]) $(id).addEventListener(ev, () => linkSize(id));
  }
  $("chkHalftone").addEventListener("change", () => { S.halftone = $("chkHalftone").checked; });
  $("selHtType").addEventListener("change", () => { S.htType = HT_TYPES[pickerIndex($("selHtType"))]; });
  const lpiDebounce = debounce(() => { S.lpi = clamp(num($("inLpi"), 30), 5, 234); updateLpiLabel(); }, 250);
  $("inLpi").addEventListener("input", lpiDebounce);
  $("inAngle").addEventListener("input", debounce(() => { S.angle = num($("inAngle"), 0); }, 250));
  $("btnRun").addEventListener("click", onRun);

  // comunes
  $$("[data-bind=knockout]").forEach(e => e.addEventListener("change", () => {
    S.knockout = e.checked; syncUI(); liveOp(() => live.updateKnockout(S));
  }));
  $$(".sw").forEach(e => e.addEventListener("click", () => onSwatch(e.dataset.color)));
  $$(".btnLink").forEach(e => e.addEventListener("click", () => {
    S.linked = !S.linked;
    if (S.linked) S.shirt = S.knockoutColor;
    syncUI();
    liveOp(() => live.updateColors(S));
  }));
  $("btnPresetSave").addEventListener("click", async () => {
    let name = "";
    const ok = await askText("dlgPreset", "dlgPresetOk", "dlgPresetCancel", () => { $("dlgPresetName").value = ""; });
    name = $("dlgPresetName").value;
    if (!ok || !name.trim()) return;
    try { await presets.save(name, S); prefs.set("lastPreset", name.trim()); await refreshPresets(name.trim()); status(""); }
    catch (e) { status(e.message); }
  });
  $("btnPresetDel").addEventListener("click", async () => {
    try { await presets.remove(currentPresetName()); prefs.set("lastPreset", "Default"); await refreshPresets("Default"); await onPresetChange(); }
    catch (e) { status(e.message); }
  });

  // paso 2
  sInput = sliders.createInputSlider($("lvlIn"), onLevelsChange);
  sOutput = sliders.createOutputSlider($("lvlOut"), onOutputChange);
  sShadow = sliders.createShadowSlider($("sldShadow"), onShadowChange);

  bindNumber($("inBlack"), v => { const c = sliders.constrainIn("black", v, S); S.black = c; syncUI(); dLevels(); });
  bindNumber($("inWhite"), v => { const c = sliders.constrainIn("white", v, S); S.white = c; syncUI(); dLevels(); });
  bindNumber($("inGamma"), v => { S.gamma = clamp(v, 0.01, 9.99); syncUI(); dLevels(); }, { step: 0.1, decimals: 2 });
  bindNumber($("inOutBlack"), v => { S.outBlack = sliders.constrainOut("outBlack", v, S); syncUI(); dLevels(); });
  bindNumber($("inOutWhite"), v => { S.outWhite = sliders.constrainOut("outWhite", v, S); syncUI(); dLevels(); });

  $("btnDefaults").addEventListener("click", () => {
    Object.assign(S, { black: DEFAULTS.black, gamma: DEFAULTS.gamma, white: DEFAULTS.white,
                       outBlack: DEFAULTS.outBlack, outWhite: DEFAULTS.outWhite, shadow: DEFAULTS.shadow });
    syncUI();
    liveOp(async () => { await live.updateLevels(S); await live.updateShadows(S); });
  });

  $("btnEditHalftone").addEventListener("click", async () => {
    const ok = await askText("dlgHalftone", "dlgHtOk", "dlgHtCancel", () => {
      setPicker($("dlgHtType"), Math.max(0, HT_TYPES.indexOf(S.htType)));
      $("dlgLpi").value = S.lpi; $("dlgAngle").value = S.angle;
    });
    if (!ok) return;
    const prevType = S.htType;
    S.htType = HT_TYPES[pickerIndex($("dlgHtType"))];
    S.lpi = clamp(num($("dlgLpi"), S.lpi), 5, 234);
    S.angle = num($("dlgAngle"), S.angle);
    syncUI();
    liveOp(() => live.updateHalftone(S, prevType !== S.htType));
  });

  $$("#segPreview sp-action-button").forEach(b => b.addEventListener("click", () => {
    liveOp(async () => {
      await modal("Halftones DTF: Vista", async () => { live.validateState(); await setPreviewMode(b.dataset.mode); });
      syncUI();
    });
  }));

  $("radCleanup").addEventListener("change", () => { S.cleanup = CLEANUPS[pickerIndex($("radCleanup"))]; });
  $("chkDefringe").addEventListener("change", () => { S.defringe = $("chkDefringe").checked; });
  $("chkNativeFinal").addEventListener("change", () => { S.nativeFinal = $("chkNativeFinal").checked; });
  $("btnCancel").addEventListener("click", onCancel);
  $("btnApply").addEventListener("click", onApply);
}

async function step(name, fn) {
  try { await fn(); } catch (e) { console.log("init " + name + ":", e); status(`Error al iniciar (${name}): ${e.message}`); }
}

async function main() {
  await step("ui", bindUI);
  await step("unidad", () => setPicker($("btnUnit"), ["in", "cm", "mm"].indexOf(unit)));
  await step("presets", async () => {
    await refreshPresets();
    Object.assign(S, await presets.load(currentPresetName()));
  });
  await step("sync", () => { syncUI(); showStep(); });
  await step("tamaño", () => updateCurrentPrintSize(true));
  await step("eventos", () => events.init({
    onIdleChange: () => updateCurrentPrintSize(),
    onWorkClosed: () => { status("El documento de trabajo se cerró."); resetToIdle(); },
    onLock: lock,
    onUnlock: unlock
  }));
}

// Cualquier error no controlado se muestra en el panel (facilita el diagnóstico en Photoshop)
window.addEventListener("error", e => status(`Error: ${e.message}`));
window.addEventListener("unhandledrejection", e => status(`Error: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));

main().catch(e => { console.log("Halftones DTF init:", e); status(e.message); });

};
defs["src/presets.js"] = function (module, exports, require) {
const { storage } = require("uxp");
const { DEFAULTS } = require("./state");

const FILE = "presets.json";
const KEYS = Object.keys(DEFAULTS);

const clone = o => JSON.parse(JSON.stringify(o));

// Fusiona con los valores por defecto del código (autorreparación).
function normalize(p) {
  const out = clone(DEFAULTS);
  for (const k of KEYS) if (p && p[k] !== undefined) out[k] = p[k];
  return out;
}

async function readAll() {
  try {
    const folder = await storage.localFileSystem.getDataFolder();
    const entry = await folder.getEntry(FILE);
    return JSON.parse(await entry.read());
  } catch (e) {
    return {};
  }
}

async function writeAll(all) {
  const folder = await storage.localFileSystem.getDataFolder();
  const entry = await folder.createFile(FILE, { overwrite: true });
  await entry.write(JSON.stringify(all, null, 2));
}

async function list() {
  const all = await readAll();
  return ["Default", ...Object.keys(all).filter(n => n !== "Default").sort()];
}

async function load(name) {
  if (name === "Default") return clone(DEFAULTS);
  const all = await readAll();
  return all[name] ? normalize(all[name]) : clone(DEFAULTS);
}

async function save(name, settings) {
  name = (name || "").trim();
  if (!name) throw new Error("El preset necesita un nombre.");
  if (name === "Default") throw new Error('El preset "Default" no se puede sobrescribir.');
  const all = await readAll();
  all[name] = normalize(settings);
  await writeAll(all);
}

async function remove(name) {
  if (name === "Default") throw new Error('El preset "Default" no se puede borrar.');
  const all = await readAll();
  delete all[name];
  await writeAll(all);
}

module.exports = { list, load, save, remove };

};
defs["src/ps/bp.js"] = function (module, exports, require) {
const { action, core, app } = require("photoshop");

const px  = v => ({ _unit: "pixelsUnit",  _value: v });
const pct = v => ({ _unit: "percentUnit", _value: v });
const deg = v => ({ _unit: "angleUnit",   _value: v });
const rgb = ({ r, g, b }) => ({ _obj: "RGBColor", red: r, grain: g, blue: b }); // "grain" = verde
const layerById = id => ({ _ref: "layer", _id: id });
const docById   = id => ({ _ref: "document", _id: id });
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
  px, pct, deg, rgb, layerById, docById, targetLayer, channel,
  bp, modal, selectLayer, setVisible, lastLayerId, findLayer, baseName
};

};
defs["src/ps/events.js"] = function (module, exports, require) {
const { action, app } = require("photoshop");
const { state } = require("../state");

const EVENTS = ["select", "close", "open", "imageSize", "canvasSize", "historyStateChanged"];

// handlers: { onIdleChange(), onWorkClosed(), onLock(msg), onUnlock() }
function init(handlers) {
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), (event) => {
    try {
      if (state.phase === "RUNNING") return;
      if (state.phase === "ACTIVE") {
        const stillOpen = app.documents.some(d => d.id === state.workDocId);
        if (!stillOpen) return handlers.onWorkClosed();
        if (app.activeDocument && app.activeDocument.id !== state.workDocId) {
          return handlers.onLock("Vuelve al documento de trabajo o pulsa Cancelar");
        }
        handlers.onUnlock();
      } else {
        handlers.onIdleChange();
      }
    } catch (e) {
      console.log("events:", event, e);
    }
  });
}

module.exports = { init };

};
defs["src/ps/layers.js"] = function (module, exports, require) {
// Constructores de capas. Todo con descriptores nativos de Photoshop.
const { app } = require("photoshop");
const { storage } = require("uxp");
const { TILE_PX, state } = require("../state");
const {
  bp, px, pct, deg, rgb, layerById, targetLayer, selectLayer, lastLayerId
} = require("./bp");

async function makeSolid(name, color, mode = "normal") {
  await bp({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name, mode: { _enum: "blendMode", _value: mode },
             type: { _obj: "solidColorLayer", color: rgb(color) } } });
  return lastLayerId();
}

async function makeHueSatDesat(name) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name,
      type: { _obj: "hueSaturation", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
              colorize: false,
              adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: -100, lightness: 0 }] } } });
  return lastLayerId();
}

async function makeThreshold(name, level = 128) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "thresholdClassEvent", level } } });
  return lastLayerId();
}

async function setLevels(id, { black, gamma, white, outBlack, outWhite }) {
  await bp({ _obj: "set", _target: [{ _ref: "adjustmentLayer", _id: id }],
    to: { _obj: "levels", presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
      adjustment: [{ _obj: "levelsAdjustment",
        channel: { _ref: "channel", _enum: "channel", _value: "composite" },
        input: [black, white], gamma, output: [outBlack, outWhite] }] } });
}

async function makeLevels(name, s) {
  await bp({ _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name, type: { _obj: "levels",
      presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } } } });
  const id = await lastLayerId();
  await setLevels(id, s);
  return id;
}

const setSolid = (id, c) => bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
  to: { _obj: "solidColorLayer", color: rgb(c) } });

// ---- Semitono -------------------------------------------------------------

const definedPatterns = new Map();   // nombre -> ID (o null) definido en esta sesión

// Define (una vez por sesión) el motivo de umbral a partir del PNG propio del plugin.
async function ensurePattern(type) {
  const name = `HT ${type}`;
  if (definedPatterns.has(name)) return { name, id: definedPatterns.get(name) };

  const folder = await storage.localFileSystem.getPluginFolder();
  let entry;
  try {
    entry = await folder.getEntry(`assets/tiles/ht_${type.toLowerCase()}.png`);
  } catch (e) {
    throw new Error(`No se encuentra el recurso de semitono (${type}). Reinstala el plugin.`);
  }
  const work = app.activeDocument;
  const tile = await app.open(entry);
  let id = null;
  try {
    await bp({ _obj: "set", _target: [{ _ref: "channel", _property: "selection" }],
               to: { _enum: "ordinal", _value: "allEnum" } });
    const res = await bp({ _obj: "make", _target: [{ _ref: "pattern" }],
      using: { _ref: "property", _property: "selection" }, name });          // 🔍 Definir motivo
    id = (res && res[0] && res[0].ID) || null;
  } finally {
    await tile.closeWithoutSaving();
    app.activeDocument = work;
  }
  definedPatterns.set(name, id);
  return { name, id };
}

function patternScale(lpi, resolution) {
  return Math.max(1, 100 * (resolution / lpi) / TILE_PX);
}

// Crea la capa de relleno de motivo en modo Hard Mix (relleno 100 %).
async function makeHalftoneLayer(type, lpi, angle) {
  const { name, id } = await ensurePattern(type);
  const res = app.activeDocument.resolution;
  const pattern = id ? { _obj: "pattern", name, ID: id } : { _obj: "pattern", name };
  await bp({ _obj: "make", _target: [{ _ref: "contentLayer" }],
    using: { _obj: "contentLayer", name: "HT PATTERN",
      type: { _obj: "patternLayer", pattern, scale: pct(patternScale(lpi, res)), angle: deg(angle) } } }); // 🔍
  const layerId = await lastLayerId();
  await bp({ _obj: "set", _target: [layerById(layerId)],
    to: { _obj: "layer", mode: { _enum: "blendMode", _value: "hardMix" }, fillOpacity: pct(100) } });
  return layerId;
}

async function setHalftoneParams(id, lpi, angle) {
  const res = app.activeDocument.resolution;
  await bp({ _obj: "set", _target: [{ _ref: "contentLayer", _id: id }],
    to: { _obj: "patternLayer", scale: pct(patternScale(lpi, res)), angle: deg(angle) } });   // 🔍
}

// ---- Realce de sombras (Sombras/Iluminaciones como filtro inteligente) ------

async function applyShadowBoost(layerId, amount) {
  await selectLayer(layerId);
  await bp({ _obj: "adaptCorrect",
    sdwM: { _obj: "adaptCorrectTones", amount: pct(amount), width: pct(50), radius: px(30) },
    hglM: { _obj: "adaptCorrectTones", amount: pct(0),      width: pct(50), radius: px(30) },
    blackClip: 0.01, whiteClip: 0.01, center: 0, colorCorrection: 20 });                     // 🔍
}

async function removeSmartFilters(layerId) {
  try {
    await bp({ _obj: "delete", _target: [{ _ref: "filterFX", _index: 1 }, layerById(layerId)] });  // 🔍
  } catch (e) { /* sin filtro: nada que borrar */ }
}

// Reaplica el realce en ART y MAP ART (así la máscara también lo refleja).
async function setShadowBoost(amount) {
  const L = state.layers;
  for (const id of [L.art, L.mapArt]) {
    if (state.shadowOn) await removeSmartFilters(id);
    if (amount > 0) await applyShadowBoost(id, amount);
  }
  state.shadowOn = amount > 0;
}

module.exports = {
  makeSolid, makeHueSatDesat, makeThreshold, makeLevels, setLevels, setSolid,
  makeHalftoneLayer, setHalftoneParams, setShadowBoost, applyShadowBoost
};

};
defs["src/ps/live.js"] = function (module, exports, require) {
const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { selectLayer } = require("./bp");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  for (const id of Object.values(state.layers)) {
    if (!findLayer(doc, id)) throw new Error("MISSING_LAYERS");
  }
}

const run = (name, fn) => modal(name, async (ctx) => { validateState(); await fn(ctx); }, { history: true });

const updateLevels = s => run("Halftones DTF: Niveles", async () => {
  await L_.setLevels(state.layers.levels, s);
  await refreshMask(s);
});

const updateShadows = s => run("Halftones DTF: Sombras", async () => {
  await L_.setShadowBoost(s.shadow);
  await refreshMask(s);
});

const updateColors = (s, { knockoutChanged = true } = {}) => run("Halftones DTF: Color", async () => {
  const L = state.layers;
  await L_.setSolid(L.shirt, s.shirt);
  if (knockoutChanged) {
    await L_.setSolid(L.ko, s.knockoutColor);
    await L_.setSolid(L.mapBg, s.knockoutColor);
    await refreshMask(s);
  }
});

const updateKnockout = s => run("Halftones DTF: Knockout", () => refreshMask(s));

// Tipo, LPI o ángulo. Si cambia el tipo se reemplaza la capa de motivo.
const updateHalftone = (s, typeChanged) => run("Halftones DTF: Semitono", async () => {
  const L = state.layers;
  const doc = app.activeDocument;
  if (typeChanged) {
    const old = findLayer(doc, L.halftone);
    await selectLayer(L.threshold);
    const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
    findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
    old.delete();
    L.halftone = id;
  } else {
    await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);
  }
  await refreshMask(s);
});

// Aplica todos los ajustes (cambio de preset en estado ACTIVE).
const updateAll = s => run("Halftones DTF: Preset", async () => {
  const L = state.layers;
  const doc = app.activeDocument;
  await L_.setSolid(L.shirt, s.shirt);
  await L_.setSolid(L.ko, s.knockoutColor);
  await L_.setSolid(L.mapBg, s.knockoutColor);
  await L_.setLevels(L.levels, s);
  await L_.setShadowBoost(s.shadow);
  await selectLayer(L.threshold);
  const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
  findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
  findLayer(doc, L.halftone).delete();
  L.halftone = id;
  await refreshMask(s);
});

module.exports = { validateState, updateLevels, updateShadows, updateColors, updateKnockout, updateHalftone, updateAll };

};
defs["src/ps/mask.js"] = function (module, exports, require) {
// Recalcula la máscara de ART como composición de MAP GROUP.
const { state } = require("../state");
const { bp, layerById, selectLayer, channel, setVisible } = require("./bp");
const { restorePreviewVisibility } = require("./preview");

async function refreshMask(s = state.settings) {
  const L = state.layers;

  // Visibilidad de los componentes del mapa según los ajustes
  await setVisible(L.ko, s.knockout);
  await setVisible(L.desat, s.knockout);
  await setVisible(L.halftone, s.halftone);
  await setVisible(L.threshold, !s.halftone);

  await selectLayer(L.art);
  await bp({ _obj: "select", _target: [channel("mask")], makeVisible: false });

  if (!s.knockout) {
    // Sin knockout: todo opaco (máscara blanca)
    await bp({ _obj: "fill", using: { _enum: "fillContents", _value: "white" },
               opacity: { _unit: "percentUnit", _value: 100 }, mode: { _enum: "blendMode", _value: "normal" } });
  } else {
    // Solo MAP GROUP visible, Imagen > Aplicar imagen (combinado) sobre la máscara
    await bp([
      { _obj: "hide", null: [layerById(L.art), layerById(L.shirt)] },
      { _obj: "show", null: [layerById(L.mapGroup)] },
      { _obj: "applyImageEvent", with: { _obj: "calculation",
          to: [channel("RGB"), { _ref: "layer", _enum: "ordinal", _value: "merged" }],
          calculation: { _enum: "calculationType", _value: "normal" } } },     // 🔍
      { _obj: "hide", null: [layerById(L.mapGroup)] }
    ]);
  }
  await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
  await restorePreviewVisibility();
}

module.exports = { refreshMask };

};
defs["src/ps/pipeline.js"] = function (module, exports, require) {
const { app, constants } = require("photoshop");
const { state, resetState } = require("../state");
const {
  bp, modal, px, layerById, targetLayer, channel, selectLayer, lastLayerId, findLayer, baseName
} = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");
const { nativeScreenMask } = require("./screen");

const CANCELLED = "CANCELLED";

function checkCancel(ctx) {
  if (ctx.isCancelled) throw new Error(CANCELLED);
}

function getWorkDoc() {
  const d = app.documents.find(x => x.id === state.workDocId);
  if (!d) throw new Error("No se encuentra el documento de trabajo.");
  return d;
}

// ---- Preparar ---------------------------------------------------------------
// s = ajustes de la UI + widthPx / heightPx (tamaño objetivo a 300 ppi)
async function runPrep(s) {
  const src = app.activeDocument;
  if (!src) throw new Error("No hay documento abierto.");
  state.phase = "RUNNING";
  state.srcDocId = src.id;
  let work = null;
  let stage = "inicio";
  const at = n => { stage = n; };

  try {
    await modal("Halftones DTF: Preparar", async (ctx) => {
      // 1) Duplicar (documento de trabajo); el original nunca se toca
      at("duplicar documento");
      work = await src.duplicate(`${baseName(src.title)} - Prep`);
      app.activeDocument = work;
      state.workDocId = work.id;
      if (work.mode !== constants.DocumentMode.RGB) await work.changeMode(constants.ChangeMode.RGB);

      at("historial");
      const hid = await ctx.hostControl.suspendHistory({ documentID: work.id, name: "Halftones DTF: Preparar" });
      try {
        ctx.reportProgress({ value: 0.1, commandName: "Duplicando documento" });

        // 2) Redimensionar a 300 ppi y tamaño objetivo
        at(`redimensionar (${s.widthPx}x${s.heightPx})`);
        await work.resizeImage(s.widthPx, s.heightPx, 300, constants.ResampleMethod.BICUBICAUTOMATIC);
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.25, commandName: "Redimensionando" });

        // 3) Aplanar todo en un objeto inteligente "ART"
        at("objeto inteligente ART");
        await bp([{ _obj: "selectAllLayers", _target: [targetLayer] }, { _obj: "newPlacedLayer" }]);   // 🔍
        const artId = await lastLayerId();
        await bp({ _obj: "set", _target: [targetLayer], to: { _obj: "layer", name: "ART" } });
        const artLayer = findLayer(work, artId);

        // 4) Color de prenda (al fondo)
        at("capa SHIRT COLOR");
        const shirtId = await L_.makeSolid("SHIRT COLOR", s.shirt);
        findLayer(work, shirtId).moveBelow(artLayer);                                                  // 🔍
        checkCancel(ctx);

        // 5) MAP GROUP: fondo (color de KO) < arte < KO < desat < niveles < umbral < motivo
        at("MAP ART");
        const mapArt = artLayer.duplicate();
        mapArt.name = "MAP ART";
        const mapArtId = mapArt.id;
        await selectLayer(mapArtId);
        const mapBgId = await L_.makeSolid("MAP BG", s.knockoutColor);   // el arte transparente cuenta como "fondo"
        findLayer(work, mapBgId).moveBelow(findLayer(work, mapArtId));
        await selectLayer(mapArtId);
        at("KO COLOR");
        const koId = await L_.makeSolid("KO COLOR", s.knockoutColor, "difference");
        at("MAP DESAT / MAP LEVELS / umbral");
        const desatId = await L_.makeHueSatDesat("MAP DESAT");
        const levelsId = await L_.makeLevels("MAP LEVELS", s);
        const thrId = await L_.makeThreshold("MAP THRESHOLD");
        at("capa de semitono");
        const htId = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
        findLayer(work, htId).moveAbove(findLayer(work, thrId));
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.6, commandName: "Construyendo mapa de semitono" });

        at("agrupar MAP GROUP");
        const members = [mapBgId, mapArtId, koId, desatId, levelsId, thrId, htId].map(id => findLayer(work, id));
        const group = await work.createLayerGroup({ name: "MAP GROUP", fromLayers: members });        // 🔍
        const mapGroupId = group.id;

        Object.assign(state.layers, { art: artId, shirt: shirtId, mapGroup: mapGroupId, mapArt: mapArtId,
          mapBg: mapBgId, ko: koId, desat: desatId, levels: levelsId, threshold: thrId, halftone: htId });

        // 6) Realce de sombras (filtro inteligente) y máscara en ART
        at("sombras y máscara");
        state.shadowOn = false;
        if (s.shadow > 0) await L_.setShadowBoost(s.shadow);
        await selectLayer(artId);
        await bp({ _obj: "make", new: { _class: "channel" },
                   at: channel("mask"), using: { _enum: "userMaskEnabled", _value: "revealAll" } });

        // 7) Primer cálculo de la máscara y vista
        at("calcular máscara");
        await refreshMask(s);
        at("vista");
        await setPreviewMode("shirt");
        await bp({ _obj: "select", _target: [{ _ref: "menuItemClass", _enum: "menuItemType", _value: "fitOnScreen" }] });
        ctx.reportProgress({ value: 1, commandName: "Listo" });
      } finally {
        await ctx.hostControl.resumeHistory(hid);
      }
    });
    state.phase = "ACTIVE";
  } catch (e) {
    await discardWork(work);
    resetState();
    if (e.message === CANCELLED) return false;
    e.message = `${e.message} [paso: ${stage}]`;
    throw e;
  }
  return true;
}

async function discardWork(work) {
  const doc = work && app.documents.find(d => d.id === work.id);
  if (!doc) return;
  try {
    await modal("Halftones DTF: Descartar", async () => { await doc.closeWithoutSaving(); });
  } catch (e) { /* ya cerrado */ }
}

// ---- Cancelar ----------------------------------------------------------------
async function cancelPrep() {
  const src = app.documents.find(d => d.id === state.srcDocId);
  const work = app.documents.find(d => d.id === state.workDocId);
  await modal("Halftones DTF: Cancelar", async () => {
    if (work) await work.closeWithoutSaving();
    if (src) app.activeDocument = src;
  });
  resetState();
}

// ---- Aplicar -----------------------------------------------------------------
async function applyPrep(s) {
  await modal("Halftones DTF: Aplicar", async (ctx) => {
    const work = getWorkDoc();
    app.activeDocument = work;
    const L = state.layers;
    ctx.reportProgress({ value: 0.1, commandName: "Calculando máscara" });

    // 1) Máscara final: motor nativo de Mapa de bits (opcional) o motivo + Hard Mix
    if (s.nativeFinal && s.halftone && s.knockout) await nativeScreenMask(s);
    else await refreshMask(s);
    checkCancel(ctx);

    await selectLayer(L.art);
    await bp({ _obj: "select", _target: [channel("mask")], makeVisible: false });
    ctx.reportProgress({ value: 0.4, commandName: "Limpieza" });

    // 2) Limpieza sobre la máscara
    const radius = { none: null, standard: 0.6, high: 1.2 }[s.cleanup];
    if (radius) {
      if (s.cleanup === "high") await bp({ _obj: "median", radius: px(1) });
      await bp([{ _obj: "gaussianBlur", radius: px(radius) }, { _obj: "thresholdClassEvent", level: 128 }]);
    }
    // 3) De-fringe: erosionar 1 px la máscara
    if (s.defringe) {
      await bp({ _obj: "minimum", radius: px(1),
                 preserveShape: { _enum: "preserveShape", _value: "roundness" } });                 // 🔍
    }
    checkCancel(ctx);
    ctx.reportProgress({ value: 0.6, commandName: "Rasterizando" });

    // 4) Rasterizar y aplicar la máscara
    await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
    await bp([
      { _obj: "rasterizeLayer", _target: [layerById(L.art)] },
      { _obj: "delete", _target: [channel("mask")], apply: true }
    ]);
    if (s.defringe) await bp({ _obj: "defringe", width: 1 });                                       // 🔍

    // 5) Resultado: documento nuevo con una sola capa con alfa
    const name = baseName(work.title).replace(/ - Prep$/, "") + " - Prepped";
    const layer = findLayer(work, L.art);
    layer.name = name;
    const out = await app.documents.add({
      width: work.width, height: work.height, resolution: work.resolution,
      mode: constants.NewDocumentMode.RGB, fill: constants.DocumentFill.TRANSPARENT, name
    });
    const copy = await layer.duplicate(out);                                                        // 🔍
    for (const l of [...out.layers]) if (l.id !== copy.id) l.delete();
    await work.closeWithoutSaving();
    app.activeDocument = out;
    ctx.reportProgress({ value: 1, commandName: "Listo" });
  });
  resetState();
}

module.exports = { runPrep, applyPrep, cancelPrep, getWorkDoc };

};
defs["src/ps/preview.js"] = function (module, exports, require) {
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

};
defs["src/ps/screen.js"] = function (module, exports, require) {
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

};
defs["src/state.js"] = function (module, exports, require) {
const TILE_PX = 128;

const DEFAULTS = {
  lpi: 30, angle: 33, htType: "ROUND", halftone: true, knockout: true,
  knockoutColor: { r: 0, g: 0, b: 0 }, shirt: { r: 0, g: 0, b: 0 }, linked: true,
  black: 7, gamma: 2.0, white: 100, outBlack: 0, outWhite: 255, shadow: 0,
  cleanup: "standard", defringe: false, nativeFinal: false
};

const HT_TYPES = ["ROUND", "LINE", "DIAMOND", "ELLIPSE"];
const CLEANUPS = ["none", "standard", "high"];

const state = {
  phase: "IDLE",          // IDLE | RUNNING | ACTIVE
  srcDocId: null,         // documento original (no se toca)
  workDocId: null,        // duplicado "<doc> - Prep"
  layers: {},             // IDs: art, shirt, mapGroup, mapArt, mapBg, ko, desat, levels, threshold, halftone
  settings: JSON.parse(JSON.stringify(DEFAULTS)),
  previewMode: "shirt",
  shadowOn: false
};

function resetState() {
  state.phase = "IDLE";
  state.srcDocId = null;
  state.workDocId = null;
  state.layers = {};
  state.previewMode = "shirt";
  state.shadowOn = false;
}

module.exports = { TILE_PX, DEFAULTS, HT_TYPES, CLEANUPS, state, resetState };

};
defs["src/ui/colorPicker.js"] = function (module, exports, require) {
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

};
defs["src/ui/levelsSlider.js"] = function (module, exports, require) {
// Slider compuesto de 1 a 3 asas. Cada asa: { key, kind: "value" | "gamma" }.
// "gamma" se posiciona entre las asas "black" y "white" en escala logarítmica.
const { clamp } = require("../util");

function createSlider(root, { min, max, handles, constrain, onChange }) {
  const values = {};
  root.innerHTML = '<div class="track"></div><div class="fill"></div>';
  const fill = root.querySelector(".fill");
  const els = {};
  let drag = null;

  handles.forEach(h => {
    const el = document.createElement("div");
    el.className = "handle" + (h.kind === "gamma" ? " gamma" : "");
    root.appendChild(el);
    els[h.key] = el;
    el.addEventListener("mousedown", e => { drag = h; e.preventDefault(); });
  });

  const pctOf = v => ((v - min) / (max - min)) * 100;
  const gammaT = g => clamp(0.5 - Math.log10(g) / 2, 0, 1);   // 1 -> 0.5 ; 9.99 -> 0 ; 0.1 -> 1
  const tToGamma = t => clamp(Math.round(Math.pow(10, 2 * (0.5 - t)) * 100) / 100, 0.01, 9.99);

  function render() {
    for (const h of handles) {
      let p;
      if (h.kind === "gamma") p = pctOf(values.black + (values.white - values.black) * gammaT(values.gamma));
      else p = pctOf(values[h.key]);
      els[h.key].style.left = p + "%";
    }
    const lo = values.black !== undefined ? values.black : values.outBlack;
    const hi = values.white !== undefined ? values.white : values.outWhite;
    fill.style.left = pctOf(lo) + "%";
    fill.style.width = Math.max(0, pctOf(hi) - pctOf(lo)) + "%";
  }

  function move(e) {
    if (!drag) return;
    const r = root.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const val = min + x * (max - min);
    if (drag.kind === "gamma") {
      values.gamma = tToGamma(clamp((val - values.black) / (values.white - values.black), 0, 1));
    } else {
      values[drag.key] = constrain(drag.key, Math.round(val), values);
    }
    render();
    onChange({ ...values });
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", () => { drag = null; });

  return {
    set(v) { Object.assign(values, v); render(); },
    get: () => ({ ...values })
  };
}

// Restricciones: negro < blanco - 2
const constrainIn = (key, v, vals) =>
  key === "black" ? clamp(v, 0, Math.min(253, vals.white - 2)) : clamp(v, Math.max(2, vals.black + 2), 255);
const constrainOut = (key, v, vals) =>
  key === "outBlack" ? clamp(v, 0, vals.outWhite) : clamp(v, vals.outBlack, 255);

const createInputSlider = (root, onChange) => createSlider(root, { min: 0, max: 255, constrain: constrainIn, onChange,
  handles: [{ key: "black", kind: "value" }, { key: "gamma", kind: "gamma" }, { key: "white", kind: "value" }] });
const createOutputSlider = (root, onChange) => createSlider(root, { min: 0, max: 255, constrain: constrainOut, onChange,
  handles: [{ key: "outBlack", kind: "value" }, { key: "outWhite", kind: "value" }] });
const createShadowSlider = (root, onChange) => createSlider(root, { min: 0, max: 100, onChange,
  constrain: (k, v) => clamp(v, 0, 100), handles: [{ key: "shadow", kind: "value" }] });

module.exports = { createInputSlider, createOutputSlider, createShadowSlider, constrainIn, constrainOut };

};
defs["src/ui/units.js"] = function (module, exports, require) {
const RES = 300;                       // ppi de trabajo
const INCH = { in: 1, cm: 2.54, mm: 25.4 };

const toPx = (value, unit) => Math.round(value * RES / INCH[unit]);
const fromPx = (px, unit) => Math.round((px / RES) * INCH[unit] * 1000) / 1000;
const lpiToLpc = lpi => lpi / 2.54;

module.exports = { RES, INCH, toPx, fromPx, lpiToLpc };

};
defs["src/util.js"] = function (module, exports, require) {
function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

// Serializa tareas asíncronas: la última pendiente sustituye a las intermedias.
function createQueue() {
  let running = false;
  let next = null;
  return async function enqueue(task) {
    next = task;
    if (running) return;
    running = true;
    try {
      while (next) {
        const t = next;
        next = null;
        await t();
      }
    } finally {
      running = false;
    }
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

module.exports = { debounce, createQueue, clamp };

};
  try {
    load("src/main.js");
  } catch (e) {
    var el = document.getElementById("statusLine");
    if (el) el.textContent = "Error de arranque: " + (e && e.message ? e.message : e);
    console.log("Halftones DTF boot:", e);
  }
})(require);
