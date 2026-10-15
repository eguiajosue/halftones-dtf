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

function status(msg) { $("statusLine").textContent = msg || ""; }
async function fail(e) {
  const m = e && e.message ? e.message : String(e);
  if (m === "WRONG_DOC") return lock("Vuelve al documento de trabajo o pulsa Cancelar");
  if (m === "MISSING_LAYERS") {
    status("Las capas de trabajo ya no existen (¿deshacer?). Pulsa Cancelar.");
    return;
  }
  status(m);
  console.log("HalftonePrep:", e);
}

function showStep() {
  const active = state.phase === "ACTIVE";
  $("step1").classList.toggle("hidden", active);
  $("step2").classList.toggle("hidden", !active);
}

function lock(msg) {
  uiLocked = true;
  $("lockBanner").textContent = msg;
  $("lockBanner").classList.remove("hidden");
  $$("#step2 sp-button, #step2 sp-action-button, #step2 sp-checkbox, #step2 sp-textfield, #step2 sp-picker")
    .forEach(e => e.setAttribute("disabled", ""));
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
  updateCurrentPrintSize();
}

// ---------- tamaño actual ----------
function currentDoc() { try { return app.activeDocument; } catch (e) { return null; } }

function updateCurrentPrintSize() {
  const doc = currentDoc();
  $("btnRun").toggleAttribute("disabled", !doc);
  if (!doc) { $("lblCurrentSize").textContent = "Tamaño actual a 300 ppi: —"; return; }
  const w = fromPx(doc.width, unit), h = fromPx(doc.height, unit);
  $("lblCurrentSize").textContent = `Tamaño actual a 300 ppi: ${w} × ${h} ${unit}`;
  if (!$("inW").value) { $("inW").value = w; $("inH").value = h; }
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
  $$("#segPreview sp-action-button").forEach(b => b.classList.toggle("active", b.dataset.mode === state.previewMode));
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
  const menu = $("presetPicker").querySelector("sp-menu");
  menu.innerHTML = "";
  names.forEach(n => { const it = document.createElement("sp-menu-item"); it.textContent = n; menu.appendChild(it); });
  const idx = Math.max(0, names.indexOf(selected || prefs.get("lastPreset", "Default")));
  $("presetPicker").selectedIndex = idx;
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
  if (!widthPx || !heightPx) { widthPx = doc.width; heightPx = doc.height; }   // 0 o vacío: tamaño actual
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
    $("inW").value = ""; $("inH").value = "";
    updateCurrentPrintSize();
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
    $("inW").value = ""; $("inH").value = "";
    updateCurrentPrintSize(); updateLpiLabel();
  });
  $("inW").addEventListener("input", () => {
    const doc = currentDoc(); if (!doc) return;
    $("inH").value = +(num($("inW"), 0) * doc.height / doc.width).toFixed(3);
  });
  $("inH").addEventListener("input", () => {
    const doc = currentDoc(); if (!doc) return;
    $("inW").value = +(num($("inH"), 0) * doc.width / doc.height).toFixed(3);
  });
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
  $("presetPicker").addEventListener("change", onPresetChange);
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
      await modal("HalftonePrep: Vista", async () => { live.validateState(); await setPreviewMode(b.dataset.mode); });
      syncUI();
    });
  }));

  $("radCleanup").addEventListener("change", () => { S.cleanup = CLEANUPS[pickerIndex($("radCleanup"))]; });
  $("chkDefringe").addEventListener("change", () => { S.defringe = $("chkDefringe").checked; });
  $("chkNativeFinal").addEventListener("change", () => { S.nativeFinal = $("chkNativeFinal").checked; });
  $("btnCancel").addEventListener("click", onCancel);
  $("btnApply").addEventListener("click", onApply);
}

async function main() {
  bindUI();
  setPicker($("btnUnit"), ["in", "cm", "mm"].indexOf(unit));
  await refreshPresets();
  Object.assign(S, await presets.load(currentPresetName()));
  syncUI();
  showStep();
  updateCurrentPrintSize();
  events.init({
    onIdleChange: updateCurrentPrintSize,
    onWorkClosed: () => { status("El documento de trabajo se cerró."); resetToIdle(); },
    onLock: lock,
    onUnlock: unlock
  });
}

main().catch(e => { console.log("HalftonePrep init:", e); status(e.message); });
