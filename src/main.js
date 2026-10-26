const { app } = require("photoshop");
const { state, DEFAULTS, resetState } = require("./state");
const { debounce, clamp } = require("./util");
const { RES, fromPx, toPx, lpiToLpc, wholeCellLpi } = require("./ui/units");
const { pickColor, toCss } = require("./ui/colorPicker");
const sliders = require("./ui/levelsSlider");
const presets = require("./presets");
const pipeline = require("./ps/pipeline");
const live = require("./ps/live");
const events = require("./ps/events");
const perf = require("./perf");

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
const BIG_MP = 150;          // por encima de este área (megapíxeles) se pide confirmación
let bigConfirmed = null;

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
  flushLater.cancel();
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

// La máscara completa es lo más caro: durante un gesto solo se actualiza la vista en vivo y la máscara
// se recalcula tras 300 ms sin cambios (o de inmediato con "flushMask" en controles discretos).
const MASK_DELAY = 300;
const flushLater = debounce(() => touch("flushMask"), MASK_DELAY);
const MASK_AFFECTING = new Set(["ko", "levels", "shadow", "ht", "htType", "mask", "sens", "dots"]);

function touch(...kinds) {
  if (state.phase !== "ACTIVE" || applying) return;
  if (uiLocked) { kinds.forEach(k => held.add(k)); return; }
  kinds.forEach(k => dirty.add(k));
  if (kinds.some(k => MASK_AFFECTING.has(k)) && !kinds.includes("flushMask")) flushLater();
  else if (kinds.includes("flushMask")) flushLater.cancel();
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
let sIn, sOut, sShadow, sSens, sLpi, sAngle;

function setSeg(id, attr, value) {
  $$(`#${id} .seg-btn`).forEach(b => setClass(b, "active", b.dataset[attr] === value));
}

function updateLpiLabel() {
  $("lblLpi").textContent = unit === "in" ? "(líneas/pulgada)" : `(LPI · ${lpiToLpc(S.lpi).toFixed(1)} LPC)`;
  // Con celdas de tamaño no entero el motivo se remuestrea y los puntos salen irregulares (moiré)
  const cell = RES / S.lpi;
  const whole = Math.abs(cell - Math.round(cell)) < 0.05;
  $("lblCell").textContent = `Celda: ${cell.toFixed(2)} px` + (whole ? " · exacta" : " · no entera");
  setDisabled($("btnCell"), whole);
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
  $("inSens").value = S.colorSens;
  $("inDotMin").value = S.dotMin; $("inDotMax").value = S.dotMax;
  sSens.set({ colorSens: S.colorSens });
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
  touch(key === "shirt" && !S.linked ? "shirt" : "ko", "shirt", "flushMask");
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
  const mp = (widthPx * heightPx) / 1e6;
  if (mp > BIG_MP && bigConfirmed !== `${widthPx}x${heightPx}`) {
    bigConfirmed = `${widthPx}x${heightPx}`;
    return message(`Documento de ${Math.round(mp)} MP: tardará y usará mucha memoria (calcula ~${Math.round(mp * 20 / 1000 * 10) / 10} GB). Pulsa Preparar de nuevo para continuar.`, "warn");
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
  flushLater.cancel();
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
  flushLater.cancel();
  try { await pipeline.cancelPrep(); } catch (e) { console.log(e); }
  resetToIdle();
}

// ---------- panel de depuración de rendimiento ----------
function perfEnv() {
  const env = [];
  const safe = (fn, d = "?") => { try { const v = fn(); return v === undefined || v === null ? d : v; } catch (e) { return d; } };
  env.push(`Open-DTF ${safe(() => require("uxp").versions.plugin)} · Photoshop ${safe(() => app.version)} · UXP ${safe(() => require("uxp").versions.uxp)}`);
  const doc = currentDoc();
  if (doc) {
    const w = dimPx(doc.width), h = dimPx(doc.height);
    env.push(`Documento: ${w}×${h} px (${(w * h / 1e6).toFixed(1)} MP) · ${safe(() => doc.mode)} · ${safe(() => doc.bitsPerChannel)} · ${safe(() => doc.layers.length)} capas`);
  }
  env.push(`Ajustes: ${S.htType} ${S.lpi} LPI ${S.angle}° · halftone ${S.halftone} · knockout ${S.knockout} · sombras ${S.shadow} · sens. color ${S.colorSens} · punto ${S.dotMin}-${S.dotMax} % · limpieza ${S.cleanup} · trama nativa ${S.nativeFinal}`);
  return env;
}

function renderPerf() {
  if (!$("perfBlock") || $("perfBlock").classList.contains("hidden")) return;
  $("perfOut").value = perf.report(perfEnv());
}

function setPerfVisible(on) {
  setHidden($("perfBlock"), !on);
  prefs.set("debugPerf", on ? "1" : "0");
  renderPerf();
}

// ---------- cableado ----------
function bindUI() {
  // Panel de depuración: 5 pulsaciones seguidas sobre el nombre lo muestran u ocultan
  let taps = 0, tapTimer = null;
  document.querySelector(".wordmark").addEventListener("click", () => {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (++taps >= 5) { taps = 0; setPerfVisible($("perfBlock").classList.contains("hidden")); }
  });
  $("btnPerfRefresh").addEventListener("click", renderPerf);
  $("btnPerfClear").addEventListener("click", () => { perf.clear(); renderPerf(); });
  $("btnPerfHide").addEventListener("click", () => setPerfVisible(false));
  perf.onUpdate(renderPerf);
  setHidden($("perfBlock"), prefs.get("debugPerf", "0") !== "1");
  renderPerf();

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
    touch("mask", "flushMask");
  });
  $$("#segHtType .seg-btn").forEach(b => b.addEventListener("click", () => {
    if (S.htType === b.dataset.value) return;
    S.htType = b.dataset.value;
    setSeg("segHtType", "value", S.htType);
    touch("htType", "flushMask");
  }));
  sLpi = sliders.createValueSlider($("sldLpi"), "lpi", { min: LPI.min, max: LPI.max, stepBy: 1 }, v => {
    S.lpi = v.lpi; $("inLpi").value = v.lpi; updateLpiLabel(); touch("ht");
  });
  sAngle = sliders.createValueSlider($("sldAngle"), "angle", { min: ANGLE.min, max: ANGLE.max, stepBy: 0.5 }, v => {
    S.angle = v.angle; $("inAngle").value = v.angle; touch("ht");
  });
  $("btnCell").addEventListener("click", () => {
    S.lpi = clamp(wholeCellLpi(S.lpi), 5, 234);
    syncHalftone();
    touch("ht");
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
  $("chkKnockout").addEventListener("change", () => { S.knockout = $("chkKnockout").checked; touch("mask", "flushMask"); });
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
  }, () => touch("shadow", "flushMask"));
  sSens = sliders.createValueSlider($("sldSens"), "colorSens", { min: 0, max: 100 }, v => {
    S.colorSens = v.colorSens; $("inSens").value = v.colorSens; touch("sens");
  });
  bindNumber($("inSens"), v => {
    if (Number.isFinite(v)) { S.colorSens = clamp(Math.round(v), 0, 100); touch("sens"); }
    syncTones();
  });
  bindNumber($("inDotMin"), v => {
    if (Number.isFinite(v)) { S.dotMin = clamp(Math.round(v), 0, 40); touch("dots"); }
    syncTones();
  });
  bindNumber($("inDotMax"), v => {
    if (Number.isFinite(v)) { S.dotMax = clamp(Math.round(v), 60, 100); touch("dots"); }
    syncTones();
  });
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
                       outBlack: DEFAULTS.outBlack, outWhite: DEFAULTS.outWhite, shadow: DEFAULTS.shadow,
                       colorSens: DEFAULTS.colorSens, dotMin: DEFAULTS.dotMin, dotMax: DEFAULTS.dotMax });
    syncTones();
    touch("levels", "shadow", "sens", "dots", "flushMask");
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
