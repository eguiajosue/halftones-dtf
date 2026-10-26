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
const { state, DEFAULTS, resetState } = require("./state");
const { debounce, clamp } = require("./util");
const { fromPx, toPx, lpiToLpc } = require("./ui/units");
const { pickColor, toCss } = require("./ui/colorPicker");
const sliders = require("./ui/levelsSlider");
const presets = require("./presets");
const pipeline = require("./ps/pipeline");
const live = require("./ps/live");
const events = require("./ps/events");

const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const S = state.settings;

const LPI = { min: 5, max: 120 };      // rango del slider (el campo admite hasta 234)
const ANGLE = { min: 0, max: 180 };

const prefs = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
};
let unit = prefs.get("unit", "in");
let uiLocked = false;

// ---------- utilidades de UI (compatibles con UXP: sin toggleAttribute ni classList.toggle(x, bool)) ----------
const setClass = (el, cls, on) => (on ? el.classList.add(cls) : el.classList.remove(cls));
const setHidden = (el, hidden) => setClass(el, "hidden", hidden);
const setDisabled = (el, on) => (on ? el.setAttribute("disabled", "") : el.removeAttribute("disabled"));
const pickerIndex = el => (el.selectedIndex >= 0 ? el.selectedIndex : 0);
const num = (el, d) => { const v = parseFloat(String(el.value).replace(",", ".")); return Number.isFinite(v) ? v : d; };
const dimPx = v => (typeof v === "number" ? v : v && typeof v.as === "function" ? v.as("px") : Number(v && v.value !== undefined ? v.value : v));
function currentDoc() { try { return app.activeDocument; } catch (e) { return null; } }

// ---------- mensajes ----------
let msgTimer = null;
function message(text, kind = "info", ms = 0) {
  const el = $("msg");
  clearTimeout(msgTimer);
  if (!text) { setHidden(el, true); return; }
  el.textContent = text;
  el.className = "banner" + (kind === "info" ? "" : " " + kind);
  if (ms) msgTimer = setTimeout(() => setHidden(el, true), ms);
}
const status = text => message(text, "error");

async function fail(e) {
  const m = e && e.message ? e.message : String(e);
  if (m === "WRONG_DOC") return lock("Vuelve al documento de trabajo o pulsa Cancelar.");
  if (m === "MISSING_LAYERS") return message("Las capas de trabajo ya no existen (¿deshiciste algo?). Pulsa Cancelar.", "warn");
  if (m === "CANCELLED") return message("Operación cancelada.", "warn", 3000);
  message(m, "error");
  console.log("Halftones DTF:", e);
}

// ---------- pasos ----------
function showStep() {
  const active = state.phase === "ACTIVE";
  setHidden($("step1"), active);
  setHidden($("step2"), !active);
  setHidden($("btnRun"), active);
  setHidden($("btnCancel"), !active);
  setHidden($("btnApply"), !active);
  setHidden($("htLive"), !active);
  $("phaseBadge").textContent = active ? "2 · Ajustar en vivo" : "1 · Configurar";
  setClass($("phaseBadge"), "active", active);
  // Los bloques de semitono y knockout se comparten: se mueven al paso visible
  $(active ? "slotHt2" : "slotHt1").appendChild($("htBlock"));
  $(active ? "slotKo2" : "slotKo1").appendChild($("koBlock"));
}

function lock(msg) {
  uiLocked = true;
  $("lockBanner").textContent = msg;
  setHidden($("lockBanner"), false);
  setClass($("step2"), "locked", true);
  ["btnApply"].forEach(id => setDisabled($(id), true));
}
function unlock() {
  if (!uiLocked) return;
  uiLocked = false;
  state.maskFresh = false;             // el documento pudo cambiar mientras estaba bloqueado
  setHidden($("lockBanner"), true);
  setClass($("step2"), "locked", false);
  setDisabled($("btnApply"), false);
  if (held.size) { const kinds = [...held]; held.clear(); touch(...kinds); }
}

function resetToIdle() {
  held.clear();
  resetState();
  unlock();
  showStep();
  syncUI();
  updateCurrentPrintSize(true);
}

// ---------- tamaño ----------
let sizeSig = null;

function updateCurrentPrintSize(force) {
  const doc = currentDoc();
  setDisabled($("btnRun"), !doc);
  if (!doc) {
    $("lblCurrentSize").textContent = "Abre un documento para empezar.";
    $("inW").value = ""; $("inH").value = ""; sizeSig = null;
    return;
  }
  const wpx = dimPx(doc.width), hpx = dimPx(doc.height);
  const w = fromPx(wpx, unit), h = fromPx(hpx, unit);
  $("lblCurrentSize").textContent = `Lienzo actual a 300 ppi: ${w} × ${h} ${unit}`;
  // Valor inicial = tamaño del lienzo; solo se reescribe si cambia el documento, su tamaño o la unidad
  const sig = `${doc.id}:${wpx}x${hpx}:${unit}`;
  if (force || sig !== sizeSig) { $("inW").value = w; $("inH").value = h; sizeSig = sig; }
}

// Edición proporcional: cambiar un lado recalcula el otro con la proporción del lienzo
function linkSize(from) {
  const doc = currentDoc(); if (!doc) return;
  const ratio = dimPx(doc.height) / dimPx(doc.width);
  const v = num($(from), NaN);
  if (!Number.isFinite(v) || v <= 0) return;
  if (from === "inW") $("inH").value = +(v * ratio).toFixed(3);
  else $("inW").value = +(v / ratio).toFixed(3);
}

function targetSize() {
  const doc = currentDoc();
  let widthPx = toPx(num($("inW"), 0), unit), heightPx = toPx(num($("inH"), 0), unit);
  if (!widthPx || !heightPx) { widthPx = dimPx(doc.width); heightPx = dimPx(doc.height); }   // 0 o vacío: tamaño actual
  return { widthPx, heightPx };
}

// ---------- tiempo real: cola de cambios pendientes ----------
// Cada control marca qué cambió; un único bucle aplica el último estado sin perder tipos de cambio.
const dirty = new Set();
const held = new Set();       // cambios que no pudieron aplicarse (documento equivocado): se reintentan al desbloquear
let pumping = false;
let applying = false;
let eventsApi = null;

function touch(...kinds) {
  if (state.phase !== "ACTIVE") return;
  if (uiLocked) { kinds.forEach(k => held.add(k)); return; }
  kinds.forEach(k => dirty.add(k));
  pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  setHidden($("busy"), false);
  try {
    while (dirty.size) {
      const kinds = new Set(dirty);
      dirty.clear();
      try { await live.sync(S, kinds); }
      catch (e) {
        // Si el documento no era el correcto, el cambio se conserva y se reaplica al volver
        if (e && (e.message === "WRONG_DOC" || e.message === "MISSING_LAYERS")) kinds.forEach(k => held.add(k));
        dirty.forEach(k => held.add(k));
        dirty.clear();
        await fail(e);
      }
    }
  } finally {
    pumping = false;
    setHidden($("busy"), true);
    if (eventsApi) eventsApi.check();     // eventos ignorados mientras se trabajaba
  }
}

// ---------- sincronización ajustes -> UI ----------
let sIn, sOut, sShadow, sLpi, sAngle;

function setSeg(id, attr, value) {
  $$(`#${id} .seg-btn`).forEach(b => setClass(b, "active", b.dataset[attr] === value));
}

function updateLpiLabel() {
  $("lblLpi").textContent = unit === "in" ? "(líneas/pulgada)" : `(LPI · ${lpiToLpc(S.lpi).toFixed(1)} LPC)`;
}

function syncHalftone() {
  $("chkHalftone").checked = S.halftone;
  setHidden($("htBody"), !S.halftone);
  setSeg("segHtType", "value", S.htType);
  $("inLpi").value = S.lpi;
  $("inAngle").value = S.angle;
  sLpi.set({ lpi: clamp(S.lpi, LPI.min, LPI.max) });
  sAngle.set({ angle: clamp(S.angle, ANGLE.min, ANGLE.max) });
  updateLpiLabel();
}

function syncTones() {
  $("inBlack").value = S.black; $("inGamma").value = S.gamma.toFixed(2); $("inWhite").value = S.white;
  $("inOutBlack").value = S.outBlack; $("inOutWhite").value = S.outWhite;
  $("inShadow").value = S.shadow;
  sIn.set({ black: S.black, gamma: S.gamma, white: S.white });
  sOut.set({ outBlack: S.outBlack, outWhite: S.outWhite });
  sShadow.set({ shadow: S.shadow });
}

function syncColors() {
  $("chkKnockout").checked = S.knockout;
  $("chkLinked").checked = S.linked;
  $$(".sw").forEach(e => { e.style.background = toCss(S[e.dataset.color]); });
}

function syncUI() {
  syncHalftone();
  syncTones();
  syncColors();
  setSeg("segPreview", "mode", state.previewMode);
  setSeg("segCleanup", "value", S.cleanup);
  $("chkDefringe").checked = S.defringe;
  $("chkNativeFinal").checked = S.nativeFinal;
}

// ---------- campos numéricos: flechas ±1 (Mayús ±10), Intro o salir para confirmar ----------
function bindNumber(el, apply, { step = 1, decimals = 0, liveTyping = false } = {}) {
  const commit = () => apply(num(el, NaN));
  el.addEventListener("change", commit);
  if (liveTyping) el.addEventListener("input", debounce(commit, 200));
  el.addEventListener("keydown", e => {
    if (e.key === "Enter") { commit(); return; }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const d = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
    el.value = +(num(el, 0) + d).toFixed(decimals);
    commit();
    e.preventDefault();
  });
}

// ---------- colores ----------
async function onSwatch(key) {
  let c;
  try { c = await pickColor(S[key]); } catch (e) { return fail(e); }
  if (!c) return;
  S[key] = c;
  if (S.linked) { S.knockoutColor = { ...c }; S.shirt = { ...c }; }
  syncColors();
  touch(key === "shirt" && !S.linked ? "shirt" : "ko", "shirt");
}

// ---------- presets ----------
async function refreshPresets(selected) {
  const names = await presets.list();
  const idx = Math.max(0, names.indexOf(selected || prefs.get("lastPreset", "Default")));
  // Se recrea el picker completo (con sus items) para que UXP lo renderice bien
  $("presetHolder").innerHTML = '<sp-picker id="presetPicker" size="s" class="full" label="Preset"><sp-menu slot="options">' +
    names.map(n => `<sp-menu-item>${n.replace(/[<&]/g, "")}</sp-menu-item>`).join("") + "</sp-menu></sp-picker>";
  $("presetPicker").selectedIndex = idx;
  $("presetPicker").addEventListener("change", onPresetChange);
  return names[idx];
}

function currentPresetName() {
  const items = $("presetPicker").querySelectorAll("sp-menu-item");
  const it = items[pickerIndex($("presetPicker"))];
  return it ? it.textContent : "Default";
}

async function onPresetChange() {
  const name = currentPresetName();
  prefs.set("lastPreset", name);
  Object.assign(S, await presets.load(name));
  syncUI();
  touch(...live.ALL_KINDS);
  message(`Preset "${name}" cargado.`, "ok", 2000);
}

async function askPresetName() {
  const dlg = $("dlgPreset");
  $("dlgPresetName").value = "";
  const done = new Promise(res => {
    $("dlgPresetOk").onclick = e => { e.preventDefault(); dlg.close("ok"); res(true); };
    $("dlgPresetCancel").onclick = e => { e.preventDefault(); dlg.close("cancel"); res(false); };
  });
  const shown = dlg.uxpShowModal({ title: "Guardar preset", resize: "none", size: { width: 300, height: 160 } });
  const r = await Promise.race([shown, done]);
  return (r === "ok" || r === true) ? $("dlgPresetName").value.trim() : "";
}

// ---------- Preparar / Aplicar / Cancelar ----------
async function onRun() {
  const doc = currentDoc();
  if (!doc) return message("Abre un documento primero.", "warn");
  const { widthPx, heightPx } = targetSize();
  if (Math.max(widthPx, heightPx) > 20000) {
    return message(`Tamaño muy grande (${widthPx}×${heightPx} px). Máximo recomendado: 20 000 px por lado.`, "warn");
  }
  message("");
  setDisabled($("btnRun"), true);
  try {
    const ok = await pipeline.runPrep({ ...S, widthPx, heightPx });
    if (ok) {
      state.previewMode = "shirt";
      message("Listo. Los cambios se aplican en vivo.", "ok", 3000);
    }
  } catch (e) {
    await fail(e);
    resetState();
  } finally {
    setDisabled($("btnRun"), false);
    showStep();
    syncUI();
  }
}

async function onApply() {
  message("");
  setDisabled($("btnApply"), true);
  applying = true;
  try {
    while (pumping) await new Promise(r => setTimeout(r, 50));   // terminar ajustes pendientes
    await pipeline.applyPrep(S);
    resetToIdle();
    message("Listo: se creó el documento «- Prepped».", "ok", 4000);
  } catch (e) {
    await fail(e);
  } finally {
    applying = false;
    setDisabled($("btnApply"), false);
    if (eventsApi) eventsApi.check();
  }
}

async function onCancel() {
  dirty.clear();
  held.clear();
  try { await pipeline.cancelPrep(); } catch (e) { console.log(e); }
  resetToIdle();
}

// ---------- cableado ----------
function bindUI() {
  // Tamaño
  $("btnUnit").addEventListener("change", () => {
    unit = ["in", "cm", "mm"][pickerIndex($("btnUnit"))];
    prefs.set("unit", unit);
    updateCurrentPrintSize(true);
    updateLpiLabel();
  });
  for (const id of ["inW", "inH"]) {
    for (const ev of ["input", "change"]) $(id).addEventListener(ev, () => linkSize(id));
  }

  // Semitono (en vivo en el paso 2)
  $("chkHalftone").addEventListener("change", () => {
    S.halftone = $("chkHalftone").checked;
    setHidden($("htBody"), !S.halftone);
    touch("mask");
  });
  $$("#segHtType .seg-btn").forEach(b => b.addEventListener("click", () => {
    if (S.htType === b.dataset.value) return;
    S.htType = b.dataset.value;
    setSeg("segHtType", "value", S.htType);
    touch("htType");
  }));
  sLpi = sliders.createValueSlider($("sldLpi"), "lpi", { min: LPI.min, max: LPI.max, stepBy: 1 }, v => {
    S.lpi = v.lpi; $("inLpi").value = v.lpi; updateLpiLabel(); touch("ht");
  });
  sAngle = sliders.createValueSlider($("sldAngle"), "angle", { min: ANGLE.min, max: ANGLE.max, stepBy: 0.5 }, v => {
    S.angle = v.angle; $("inAngle").value = v.angle; touch("ht");
  });
  bindNumber($("inLpi"), v => {
    if (!Number.isFinite(v)) return syncHalftone();
    S.lpi = clamp(Math.round(v * 10) / 10, 5, 234); syncHalftone(); touch("ht");
  }, { liveTyping: true });
  bindNumber($("inAngle"), v => {
    if (!Number.isFinite(v)) return syncHalftone();
    S.angle = clamp(v, -360, 360); syncHalftone(); touch("ht");
  }, { step: 0.5, decimals: 1, liveTyping: true });

  // Knockout y colores
  $("chkKnockout").addEventListener("change", () => { S.knockout = $("chkKnockout").checked; touch("mask"); });
  $("chkLinked").addEventListener("change", () => {
    S.linked = $("chkLinked").checked;
    if (S.linked) S.shirt = { ...S.knockoutColor };
    syncColors();
    touch("shirt");
  });
  $$(".sw").forEach(e => e.addEventListener("click", () => onSwatch(e.dataset.color)));

  // Tonos (en vivo mientras se arrastra)
  sIn = sliders.createInputSlider($("lvlIn"), v => {
    S.black = v.black; S.gamma = v.gamma; S.white = v.white;
    $("inBlack").value = v.black; $("inGamma").value = v.gamma.toFixed(2); $("inWhite").value = v.white;
    touch("levels");
  });
  sOut = sliders.createOutputSlider($("lvlOut"), v => {
    S.outBlack = v.outBlack; S.outWhite = v.outWhite;
    $("inOutBlack").value = v.outBlack; $("inOutWhite").value = v.outWhite;
    touch("levels");
  });
  sShadow = sliders.createValueSlider($("sldShadow"), "shadow", { min: 0, max: 100 }, v => {
    S.shadow = v.shadow; $("inShadow").value = v.shadow;      // el realce es caro: se aplica al soltar
  }, () => touch("shadow"));
  const levelField = (id, fn, opts) => bindNumber($(id), v => {
    if (Number.isFinite(v)) { fn(v); touch("levels"); }
    syncTones();
  }, opts);
  levelField("inBlack", v => { S.black = sliders.constrainIn("black", v, S); });
  levelField("inWhite", v => { S.white = sliders.constrainIn("white", v, S); });
  levelField("inGamma", v => { S.gamma = clamp(Math.round(v * 100) / 100, 0.01, 9.99); }, { step: 0.1, decimals: 2 });
  levelField("inOutBlack", v => { S.outBlack = sliders.constrainOut("outBlack", v, S); });
  levelField("inOutWhite", v => { S.outWhite = sliders.constrainOut("outWhite", v, S); });
  bindNumber($("inShadow"), v => {
    if (Number.isFinite(v)) { S.shadow = clamp(Math.round(v), 0, 100); touch("shadow"); }
    syncTones();
  });

  $("btnDefaults").addEventListener("click", () => {
    Object.assign(S, { black: DEFAULTS.black, gamma: DEFAULTS.gamma, white: DEFAULTS.white,
                       outBlack: DEFAULTS.outBlack, outWhite: DEFAULTS.outWhite, shadow: DEFAULTS.shadow });
    syncTones();
    touch("levels", "shadow");
  });

  // Vista y acabado
  $$("#segPreview .seg-btn").forEach(b => b.addEventListener("click", () => {
    state.previewMode = b.dataset.mode;
    setSeg("segPreview", "mode", state.previewMode);
    touch("preview");
  }));
  $$("#segCleanup .seg-btn").forEach(b => b.addEventListener("click", () => {
    S.cleanup = b.dataset.value;
    setSeg("segCleanup", "value", S.cleanup);
  }));
  $("chkDefringe").addEventListener("change", () => { S.defringe = $("chkDefringe").checked; });
  $("chkNativeFinal").addEventListener("change", () => { S.nativeFinal = $("chkNativeFinal").checked; });

  // Presets
  $("btnPresetSave").addEventListener("click", async () => {
    const name = await askPresetName();
    if (!name) return;
    try {
      await presets.save(name, S);
      prefs.set("lastPreset", name);
      await refreshPresets(name);
      message(`Preset "${name}" guardado.`, "ok", 2500);
    } catch (e) { message(e.message, "warn"); }
  });
  $("btnPresetDel").addEventListener("click", async () => {
    const name = currentPresetName();
    try {
      await presets.remove(name);
      prefs.set("lastPreset", "Default");
      await refreshPresets("Default");
      await onPresetChange();
      message(`Preset "${name}" borrado.`, "ok", 2500);
    } catch (e) { message(e.message, "warn"); }
  });

  // Acciones
  $("btnRun").addEventListener("click", onRun);
  $("btnCancel").addEventListener("click", onCancel);
  $("btnApply").addEventListener("click", onApply);
}

// ---------- arranque ----------
async function step(name, fn) {
  try { await fn(); } catch (e) { console.log("init " + name + ":", e); status(`Error al iniciar (${name}): ${e.message}`); }
}

async function main() {
  await step("ui", bindUI);
  await step("unidad", () => { $("btnUnit").selectedIndex = Math.max(0, ["in", "cm", "mm"].indexOf(unit)); });
  await step("presets", async () => {
    await refreshPresets();
    Object.assign(S, await presets.load(currentPresetName()));
  });
  await step("sync", () => { showStep(); syncUI(); });
  await step("tamaño", () => updateCurrentPrintSize(true));
  await step("eventos", () => { eventsApi = events.init({
    isBusy: () => pumping || applying,
    onIdleChange: () => updateCurrentPrintSize(),
    onWorkClosed: () => { message("El documento de trabajo se cerró.", "warn"); resetToIdle(); },
    onLock: lock,
    onUnlock: unlock
  }); });
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

};
defs["src/ps/events.js"] = function (module, exports, require) {
const { action, app } = require("photoshop");
const { state } = require("../state");
const { debounce } = require("../util");

// historyStateChanged solo importa con el trabajo en curso (deshacer/borrar capas); en reposo solo el tamaño
const IDLE_EVENTS = ["select", "close", "open", "imageSize", "canvasSize"];
const EVENTS = [...IDLE_EVENTS, "historyStateChanged"];

// handlers: { isBusy(), onIdleChange(), onWorkClosed(), onLock(msg), onUnlock() }
function init(handlers) {
  function evaluate() {
    try {
      if (state.phase === "RUNNING" || handlers.isBusy()) return;
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
      console.log("events:", e);
    }
  }

  // Las acciones del propio plugin generan decenas de eventos: se ignoran mientras trabaja
  // y el resto se agrupa. Al terminar, main.js llama a check() para no perder ninguno.
  const check = debounce(evaluate, 150);
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), (event, descriptor) => {
    if (handlers.isBusy() || state.phase === "RUNNING") return;
    if (state.phase !== "ACTIVE" && event === "historyStateChanged") return;
    check();
  });
  return { check };
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

// Nombres de motivos que ya existen en la biblioteca del usuario (persisten entre sesiones).
async function libraryPatternNames() {
  try {
    const r = await bp({ _obj: "get", _target: [{ _property: "presetManager" }, { _ref: "application" }] });   // 🔍
    const names = new Set();
    for (const m of (r[0] && r[0].presetManager) || []) {
      if (Array.isArray(m.name)) m.name.forEach(n => names.add(n));
    }
    return names;
  } catch (e) { return new Set(); }
}

// Define el motivo de umbral a partir del PNG propio del plugin, solo si no existe ya en la biblioteca.
async function ensurePattern(type) {
  const name = `HT ${type}`;
  if (definedPatterns.has(name)) return { name, id: definedPatterns.get(name) };
  if ((await libraryPatternNames()).has(name)) {
    definedPatterns.set(name, null);        // se usa por nombre; evita duplicados entre sesiones
    return { name, id: null };
  }

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

// Precarga los 4 motivos (una vez por sesión) para que cambiar de tipo en vivo no abra archivos.
async function ensureAllPatterns() {
  for (const type of ["ROUND", "LINE", "DIAMOND", "ELLIPSE"]) await ensurePattern(type);
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
  makeHalftoneLayer, setHalftoneParams, setShadowBoost, ensureAllPatterns
};

};
defs["src/ps/live.js"] = function (module, exports, require) {
const { app } = require("photoshop");
const { state } = require("../state");
const { modal, findLayer, selectLayer } = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");

// Los IDs pueden desaparecer (deshacer, borrado manual): validar antes de operar.
function validateState() {
  const doc = app.activeDocument;
  if (!doc || doc.id !== state.workDocId) throw new Error("WRONG_DOC");
  const present = new Set();
  (function collect(container) {
    for (const l of container.layers) {
      present.add(l.id);
      if (l.layers && l.layers.length) collect(l);
    }
  })(doc);
  for (const id of Object.values(state.layers)) {
    if (!present.has(id)) throw new Error("MISSING_LAYERS");
  }
}

async function replaceHalftone(s) {
  const L = state.layers;
  const doc = app.activeDocument;
  const old = findLayer(doc, L.halftone);
  await selectLayer(L.threshold);
  const id = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
  await findLayer(doc, id).moveAbove(findLayer(doc, L.threshold));
  await old.delete();
  L.halftone = id;
}

// Aplica en una sola operación modal (una entrada de historial) solo lo que cambió.
// kinds: shirt, ko, levels, shadow, ht, htType, mask, preview
const MASK_KINDS = ["ko", "levels", "shadow", "ht", "htType", "mask"];

function sync(s, kinds) {
  return modal("Open-DTF: Ajuste en vivo", async () => {
    validateState();
    const L = state.layers;
    if (kinds.has("shirt")) await L_.setSolid(L.shirt, s.shirt);
    if (kinds.has("ko")) { await L_.setSolid(L.ko, s.knockoutColor); await L_.setSolid(L.mapBg, s.knockoutColor); }
    if (kinds.has("levels")) await L_.setLevels(L.levels, s);
    if (kinds.has("shadow")) await L_.setShadowBoost(s.shadow);
    if (kinds.has("htType")) await replaceHalftone(s);
    else if (kinds.has("ht")) await L_.setHalftoneParams(L.halftone, s.lpi, s.angle);

    if (MASK_KINDS.some(k => kinds.has(k))) { state.maskFresh = false; await refreshMask(s); }   // restaura también la vista
    else if (kinds.has("preview")) await setPreviewMode(state.previewMode);
  }, { history: true });
}

module.exports = { validateState, sync, ALL_KINDS: ["shirt", "ko", "levels", "shadow", "htType", "mask"] };

};
defs["src/ps/mask.js"] = function (module, exports, require) {
// Recalcula la máscara de ART como la composición de MAP GROUP.
// Se carga la luminosidad compuesta (solo MAP GROUP visible) como selección y se crea la
// máscara de capa desde ella (conserva los grises). Agrupado en pocas llamadas para ir rápido en vivo.
const { state } = require("../state");
const { bp, layerById, channel } = require("./bp");
const { previewDescs, vis } = require("./preview");

const SELECTION = { _ref: "channel", _property: "selection" };
const selectArt = () => ({ _obj: "select", _target: [layerById(state.layers.art)], makeVisible: false });
const makeMask = how => ({ _obj: "make", new: { _class: "channel" }, at: channel("mask"),
                           using: { _enum: "userMaskEnabled", _value: how } });

async function deleteMask() {
  try {
    await bp([selectArt(), { _obj: "delete", _target: [channel("mask")] }]);
  } catch (e) { /* aún no hay máscara */ }
}

async function refreshMask(s = state.settings) {
  state.maskFresh = false;
  const L = state.layers;
  const parts = [vis(L.ko, s.knockout), vis(L.desat, s.knockout),
                 vis(L.halftone, s.halftone), vis(L.threshold, !s.halftone)];

  if (s.knockout) {
    // Solo MAP GROUP visible -> luminosidad compuesta como selección
    await bp([...parts, vis(L.art, false), vis(L.shirt, false), vis(L.mapGroup, true),
              { _obj: "set", _target: [SELECTION], to: channel("RGB") },
              vis(L.mapGroup, false)]);
    await deleteMask();
    await bp([selectArt(), makeMask("revealSelection"),
              { _obj: "set", _target: [SELECTION], to: { _enum: "ordinal", _value: "none" } },
              { _obj: "select", _target: [channel("RGB")], makeVisible: false },
              ...previewDescs(state.previewMode)]);
  } else {
    // Sin knockout: todo opaco
    await bp(parts);
    await deleteMask();
    await bp([selectArt(), makeMask("revealAll"),
              { _obj: "select", _target: [channel("RGB")], makeVisible: false },
              ...previewDescs(state.previewMode)]);
  }
  state.maskFresh = true;
}

module.exports = { refreshMask };

};
defs["src/ps/pipeline.js"] = function (module, exports, require) {
const { app, constants } = require("photoshop");
const { state, resetState } = require("../state");
const {
  bp, modal, px, validId, layerById, targetLayer, channel, selectLayer, lastLayerId, findLayer, baseName
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

// Fusiona las capas visibles en una sola (conserva la transparencia) y descarta las ocultas:
// el objeto inteligente ART no arrastra un PSB con todas las capas originales.
async function mergeVisibleLayers(work) {
  try {
    const visible = work.layers.filter(l => l.visible);
    if (visible.length > 1) await bp({ _obj: "mergeVisible" });                                          // 🔍
    const keep = work.layers.filter(l => l.visible);
    if (keep.length !== 1) return;                                           // estado inesperado: se deja como estaba
    for (const l of [...work.layers]) if (l.id !== keep[0].id) await l.delete();
  } catch (e) { console.log("No se pudo fusionar las capas visibles:", e); }
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
    await modal("Open-DTF: Preparar", async (ctx) => {
      // 1) Duplicar (documento de trabajo); el original nunca se toca
      at("duplicar documento");
      work = await src.duplicate(`${baseName(src.title)} - Prep`);
      app.activeDocument = work;
      state.workDocId = work.id;
      if (work.mode !== constants.DocumentMode.RGB) await work.changeMode(constants.ChangeMode.RGB);
      // 8 bits/canal: con 16/32 bits la memoria y el tiempo de cada render se duplican o cuadruplican
      try { await bp({ _obj: "convertMode", depth: 8, merge: false, rasterize: false }); }                // 🔍
      catch (e) { console.log("Profundidad 8 bits no aplicada:", e); }
      at("motivos");
      await L_.ensureAllPatterns();           // una vez por sesión; cambiar de tipo en vivo ya no abre archivos
      app.activeDocument = work;

      at("historial");
      const hid = await ctx.hostControl.suspendHistory({ documentID: work.id, name: "Open-DTF: Preparar" });
      try {
        ctx.reportProgress({ value: 0.1, commandName: "Duplicando documento" });

        // 2) Redimensionar a 300 ppi y tamaño objetivo
        at(`redimensionar (${s.widthPx}x${s.heightPx})`);
        await work.resizeImage(s.widthPx, s.heightPx, 300, constants.ResampleMethod.BICUBICAUTOMATIC);
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.25, commandName: "Redimensionando" });

        // 3) Aplanar todo en un objeto inteligente "ART"
        at("objeto inteligente ART");
        await mergeVisibleLayers(work);
        await bp([{ _obj: "selectAllLayers", _target: [targetLayer] }, { _obj: "newPlacedLayer" }]);   // 🔍
        const artId = await lastLayerId();
        await bp({ _obj: "set", _target: [targetLayer], to: { _obj: "layer", name: "ART" } });
        validId(artId, "ART");
        const artLayer = findLayer(work, artId);
        if (!artLayer) throw new Error("No se encontró la capa ART");

        // 4) Color de prenda (al fondo)
        at("capa SHIRT COLOR");
        const shirtId = await L_.makeSolid("SHIRT COLOR", s.shirt);
        await findLayer(work, shirtId).moveBelow(artLayer);                                                  // 🔍
        checkCancel(ctx);

        // 5) MAP GROUP: fondo (color de KO) < arte < KO < desat < niveles < umbral < motivo
        at("MAP ART");
        const mapArt = await artLayer.duplicate();     // en UXP puede ser una promesa
        if (!mapArt) throw new Error("No se pudo duplicar ART");
        mapArt.name = "MAP ART";
        const mapArtId = validId(mapArt.id, "MAP ART");
        await selectLayer(mapArtId);
        const mapBgId = await L_.makeSolid("MAP BG", s.knockoutColor);   // el arte transparente cuenta como "fondo"
        await findLayer(work, mapBgId).moveBelow(findLayer(work, mapArtId));
        await selectLayer(mapArtId);
        at("KO COLOR");
        const koId = await L_.makeSolid("KO COLOR", s.knockoutColor, "difference");
        at("MAP DESAT / MAP LEVELS / umbral");
        const desatId = await L_.makeHueSatDesat("MAP DESAT");
        const levelsId = await L_.makeLevels("MAP LEVELS", s);
        const thrId = await L_.makeThreshold("MAP THRESHOLD");
        at("capa de semitono");
        const htId = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
        await findLayer(work, htId).moveAbove(findLayer(work, thrId));
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.6, commandName: "Construyendo mapa de semitono" });

        at("agrupar MAP GROUP");
        const members = [mapBgId, mapArtId, koId, desatId, levelsId, thrId, htId].map(id => {
          const l = findLayer(work, id);
          if (!l) throw new Error(`Capa no encontrada (id ${id})`);
          return l;
        });
        const group = await work.createLayerGroup({ name: "MAP GROUP", fromLayers: members });        // 🔍
        const mapGroupId = validId(group.id, "MAP GROUP");

        Object.assign(state.layers, { art: artId, shirt: shirtId, mapGroup: mapGroupId, mapArt: mapArtId,
          mapBg: mapBgId, ko: koId, desat: desatId, levels: levelsId, threshold: thrId, halftone: htId });

        // 6) Realce de sombras (filtro inteligente) y máscara en ART
        at("sombras y máscara");
        state.shadowOn = false;
        if (s.shadow > 0) await L_.setShadowBoost(s.shadow);

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
    throw new Error(`${e.message} [paso: ${stage}]`);
  }
  return true;
}

async function discardWork(work) {
  const doc = work && app.documents.find(d => d.id === work.id);
  if (!doc) return;
  try {
    await modal("Open-DTF: Descartar", async () => { await doc.closeWithoutSaving(); });
  } catch (e) { /* ya cerrado */ }
}

// ---- Cancelar ----------------------------------------------------------------
async function cancelPrep() {
  const src = app.documents.find(d => d.id === state.srcDocId);
  const work = app.documents.find(d => d.id === state.workDocId);
  await modal("Open-DTF: Cancelar", async () => {
    if (work) await work.closeWithoutSaving();
    if (src) app.activeDocument = src;
  });
  resetState();
}

// ---- Aplicar -----------------------------------------------------------------
async function applyPrep(s) {
  await modal("Open-DTF: Aplicar", async (ctx) => {
    const work = getWorkDoc();
    app.activeDocument = work;
    const L = state.layers;
    ctx.reportProgress({ value: 0.1, commandName: "Calculando máscara" });

    // 1) Máscara final: motor nativo de Mapa de bits (opcional) o motivo + Hard Mix
    if (!state.maskFresh) await refreshMask(s);          // la vista en vivo ya la dejó al día
    if (s.nativeFinal && s.halftone && s.knockout) {
      try { await nativeScreenMask(s); }
      catch (e) { console.log("Trama nativa no disponible, se usa el motivo:", e); await refreshMask(s); }
      state.maskFresh = false;
    }
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
    for (const l of [...out.layers]) if (l.id !== copy.id) await l.delete();
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

module.exports = { setPreviewMode, previewDescs, vis };

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
  try {
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
    await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
    await bp({ _obj: "hide", null: [layerById(L.mapGroup)] });
    await setVisible(L.halftone, true);
  } finally {
    try { await tmp.closeWithoutSaving(); } catch (e) { /* ya cerrado */ }
    app.activeDocument = work;
  }
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

const state = {
  phase: "IDLE",          // IDLE | RUNNING | ACTIVE
  srcDocId: null,         // documento original (no se toca)
  workDocId: null,        // duplicado "<doc> - Prep"
  layers: {},             // IDs: art, shirt, mapGroup, mapArt, mapBg, ko, desat, levels, threshold, halftone
  settings: JSON.parse(JSON.stringify(DEFAULTS)),
  previewMode: "shirt",
  shadowOn: false,
  maskFresh: false        // la máscara de ART refleja los ajustes actuales
};

function resetState() {
  state.phase = "IDLE";
  state.srcDocId = null;
  state.workDocId = null;
  state.layers = {};
  state.previewMode = "shirt";
  state.shadowOn = false;
  state.maskFresh = false;
}

module.exports = { TILE_PX, DEFAULTS, state, resetState };

};
defs["src/ui/colorPicker.js"] = function (module, exports, require) {
const { action, core } = require("photoshop");

// Selector de color nativo de Photoshop. Devuelve {r,g,b} o null si se cancela.
async function pickColor(initial) {
  const res = await core.executeAsModal(() => action.batchPlay([{
    _obj: "showColorPicker", context: "Open-DTF",
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
// onChange se llama en cada movimiento (tiempo real); onCommit al soltar.
const { clamp } = require("../util");

function createSlider(root, { min, max, handles, constrain, fill = null, gradient = false, onChange, onCommit }) {
  const values = {};
  root.innerHTML = `<div class="track${gradient ? " grad" : ""}"></div><div class="fill"></div>`;
  const fillEl = root.querySelector(".fill");
  const els = {};
  let drag = null;

  handles.forEach(h => {
    const el = document.createElement("div");
    el.className = "handle" + (h.kind === "gamma" ? " gamma" : "");
    root.appendChild(el);
    els[h.key] = el;
    el.addEventListener("mousedown", e => { drag = h; e.preventDefault(); e.stopPropagation(); });
  });

  const pctOf = v => ((clamp(v, min, max) - min) / (max - min)) * 100;
  const gammaT = g => clamp(0.5 - Math.log10(g) / 2, 0, 1);   // 1 -> 0.5 ; 9.99 -> 0 ; 0.1 -> 1
  const tToGamma = t => clamp(Math.round(Math.pow(10, 2 * (0.5 - t)) * 100) / 100, 0.01, 9.99);

  function render() {
    for (const h of handles) {
      const p = h.kind === "gamma"
        ? pctOf(values.black + (values.white - values.black) * gammaT(values.gamma))
        : pctOf(values[h.key]);
      els[h.key].style.left = p + "%";
    }
    if (fill) {
      const lo = fill[0] === null ? min : values[fill[0]];
      const hi = values[fill[1]];
      fillEl.style.left = pctOf(lo) + "%";
      fillEl.style.width = Math.max(0, pctOf(hi) - pctOf(lo)) + "%";
    } else {
      fillEl.style.width = "0";
    }
  }

  function valueAt(clientX) {
    const r = root.getBoundingClientRect();
    return min + clamp((clientX - r.left) / r.width, 0, 1) * (max - min);
  }

  function apply(h, val) {
    if (h.kind === "gamma") {
      values.gamma = tToGamma(clamp((val - values.black) / Math.max(1, values.white - values.black), 0, 1));
    } else {
      values[h.key] = constrain(h.key, val, values);
    }
    render();
    onChange({ ...values });
  }

  // Clic en la pista: mueve el asa más cercana y empieza a arrastrarla
  root.addEventListener("mousedown", e => {
    const val = valueAt(e.clientX);
    let best = null, bestD = Infinity;
    for (const h of handles) {
      if (h.kind === "gamma") continue;
      const d = Math.abs(values[h.key] - val);
      if (d < bestD) { bestD = d; best = h; }
    }
    if (!best) return;
    drag = best;
    apply(best, val);
  });

  document.addEventListener("mousemove", e => { if (drag) apply(drag, valueAt(e.clientX)); });
  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    if (onCommit) onCommit({ ...values });
  });

  return {
    set(v) { Object.assign(values, v); render(); },
    get: () => ({ ...values })
  };
}

const step = (v, s) => Math.round(v / s) * s;

// Restricciones: negro < blanco - 2
const constrainIn = (key, v, vals) =>
  key === "black" ? clamp(Math.round(v), 0, Math.min(253, vals.white - 2))
                  : clamp(Math.round(v), Math.max(2, vals.black + 2), 255);
const constrainOut = (key, v, vals) =>
  key === "outBlack" ? clamp(Math.round(v), 0, vals.outWhite) : clamp(Math.round(v), vals.outBlack, 255);

const createInputSlider = (root, onChange) => createSlider(root, {
  min: 0, max: 255, constrain: constrainIn, onChange, gradient: true, fill: ["black", "white"],
  handles: [{ key: "black", kind: "value" }, { key: "gamma", kind: "gamma" }, { key: "white", kind: "value" }] });

const createOutputSlider = (root, onChange) => createSlider(root, {
  min: 0, max: 255, constrain: constrainOut, onChange, gradient: true, fill: ["outBlack", "outWhite"],
  handles: [{ key: "outBlack", kind: "value" }, { key: "outWhite", kind: "value" }] });

// Slider de un valor (sombras, LPI, ángulo)
const createValueSlider = (root, key, { min, max, stepBy = 1 }, onChange, onCommit) => createSlider(root, {
  min, max, onChange, onCommit, fill: [null, key],
  constrain: (k, v) => clamp(+step(v, stepBy).toFixed(2), min, max),
  handles: [{ key, kind: "value" }] });

module.exports = { createInputSlider, createOutputSlider, createValueSlider, constrainIn, constrainOut };

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

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

module.exports = { debounce, clamp };

};
  try {
    load("src/main.js");
  } catch (e) {
    var el = document.getElementById("statusLine");
    if (el) el.textContent = "Error de arranque: " + (e && e.message ? e.message : e);
    console.log("Open-DTF boot:", e);
  }
})(require);
