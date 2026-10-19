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
const { createLiveQueue } = require("./liveQueue");

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
let uiLocked = false;     // el documento activo no es el de trabajo
let opBusy = false;       // Preparar / Aplicar / Cancelar en curso

const LOCK_MSG = "Vuelve al documento de trabajo o pulsa Cancelar.";
const BTN_LABELS = { btnRun: "Preparar", btnApply: "Aplicar", btnCancel: "Cancelar" };

// ---------- utilidades de UI (compatibles con UXP: sin toggleAttribute ni classList.toggle(x, bool)) ----------
const setClass = (el, cls, on) => (on ? el.classList.add(cls) : el.classList.remove(cls));
const setHidden = (el, hidden) => setClass(el, "hidden", hidden);
const setDisabled = (el, on) => (on ? el.setAttribute("disabled", "") : el.removeAttribute("disabled"));
const pickerIndex = el => (el.selectedIndex >= 0 ? el.selectedIndex : 0);
const num = (el, d) => { const v = parseFloat(String(el.value).replace(",", ".")); return Number.isFinite(v) ? v : d; };
const dimPx = v => (typeof v === "number" ? v : v && typeof v.as === "function" ? v.as("px") : Number(v && v.value !== undefined ? v.value : v));
function currentDoc() { try { return app.activeDocument; } catch (e) { return null; } }
const inStep2 = () => state.phase === "ACTIVE" || state.phase === "APPLYING" || state.phase === "CANCELLING";

// Clic y teclado (Intro / Espacio) para los controles hechos con div
function onActivate(el, fn) {
  el.addEventListener("click", fn);
  el.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); fn(); }
  });
}

// ---------- mensajes ----------
let msgTimer = null;
function message(text, kind = "info", ms = 0) {
  const el = $("msg");
  clearTimeout(msgTimer);
  if (!text) { setHidden(el, true); return; }
  $("msgText").textContent = text;
  el.className = "banner" + (kind === "info" ? "" : " " + kind);
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  if (ms) msgTimer = setTimeout(() => setHidden(el, true), ms);
}
const status = text => message(text, "error");

// Errores: frase clara con qué hacer en el panel; el detalle técnico, a la consola (UXP Developer Tool)
const DETAILS = " Detalles en la consola.";
async function fail(e, what = "No se pudo actualizar la vista previa. Vuelve a mover el control o pulsa Cancelar.") {
  const m = e && e.message ? e.message : String(e);
  if (m === "WRONG_DOC") { if (state.phase === "ACTIVE") lock(); return; }
  if (m === "MISSING_LAYERS") return message("Las capas de trabajo ya no existen (¿deshiciste algo?). Pulsa Cancelar.", "warn");
  if (m === "CANCELLED") return message("Operación cancelada.", "warn", 3000);
  console.log("Open-DTF:", e);
  if (/Reinstala el plugin/.test(m)) return message(m.replace(/\s*\[paso:.*\]$/, ""), "error");
  message(what + DETAILS, "error");
}

// ---------- pasos ----------
function showStep() {
  const active = inStep2();
  setHidden($("step1"), active);
  setHidden($("step2"), !active);
  setHidden($("btnRun"), active);
  setHidden($("btnCancel"), !active);
  setHidden($("btnApply"), !active);
  setHidden($("htLive"), !active);
  setHidden($("busy"), !active);
  $("phaseBadge").textContent = active ? "2 · En vivo" : "1 · Configurar";
  setClass($("phaseBadge"), "active", active);
  // Los bloques de semitono y knockout se comparten: se mueven al paso visible
  $(active ? "slotHt2" : "slotHt1").appendChild($("htBlock"));
  $(active ? "slotKo2" : "slotKo1").appendChild($("koBlock"));
}

// Estado de bloqueo y botones en un solo sitio (bloqueo por documento ajeno u operación en curso)
function refreshControls() {
  setClass(document.querySelector(".cards"), "locked", opBusy);
  setClass($("step2"), "locked", uiLocked && !opBusy);
  setClass(document.querySelector(".presetbar"), "locked", opBusy || uiLocked);
  setDisabled($("btnRun"), opBusy || !currentDoc() || !sizeValid());
  setDisabled($("btnApply"), opBusy || uiLocked);
  setDisabled($("btnCancel"), opBusy);
}

// Preparar / Aplicar / Cancelar: etiqueta de progreso en el botón y controles bloqueados mientras dura
function setBusy(btnId, label) {
  opBusy = !!btnId;
  for (const id of Object.keys(BTN_LABELS)) $(id).textContent = id === btnId ? label : BTN_LABELS[id];
  refreshControls();
}

function lock(msg = LOCK_MSG) {
  uiLocked = true;
  $("lockBanner").textContent = msg;
  setHidden($("lockBanner"), false);
  refreshControls();
}
function unlock(force) {
  if (!uiLocked && !force) return;
  uiLocked = false;
  setHidden($("lockBanner"), true);
  refreshControls();
  if (state.phase === "ACTIVE") queue.pump();   // aplicar lo que cambió mientras estaba bloqueado
}

function resetToIdle() {
  resetState();
  queue.clear();
  unlock(true);
  showStep();
  syncUI();
  updateCurrentPrintSize(true);
}

// ---------- tamaño ----------
let sizeSig = null;

function updateCurrentPrintSize(force) {
  const doc = currentDoc();
  if (!doc) {
    $("lblCurrentSize").textContent = "Abre un documento para empezar.";
    $("inW").value = ""; $("inH").value = ""; sizeSig = null;
    validateSize();
    return;
  }
  const wpx = dimPx(doc.width), hpx = dimPx(doc.height);
  const w = fromPx(wpx, unit), h = fromPx(hpx, unit);
  $("lblCurrentSize").textContent = `Lienzo actual a 300 ppi: ${w} × ${h} ${unit}`;
  // Valor inicial = tamaño del lienzo; solo se reescribe si cambia el documento, su tamaño o la unidad
  const sig = `${doc.id}:${wpx}x${hpx}:${unit}`;
  if (force || sig !== sizeSig) { $("inW").value = w; $("inH").value = h; sizeSig = sig; }
  validateSize();
}

// Vacío = tamaño actual; cualquier otro valor debe ser un número mayor que 0
function sizeFieldOk(id) {
  const raw = String($(id).value).trim();
  return raw === "" || num($(id), NaN) > 0;
}
const sizeValid = () => sizeFieldOk("inW") && sizeFieldOk("inH");

function validateSize() {
  for (const id of ["inW", "inH"]) setClass($(id), "invalid", !sizeFieldOk(id));
  setHidden($("lblSizeErr"), sizeValid());
  refreshControls();
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
// Con la UI bloqueada (u otra operación en curso) el cambio se anota y se aplica después.
const queue = createLiveQueue({
  sync: kinds => live.sync(S, kinds),
  onError: e => fail(e),
  canPump: () => state.phase === "ACTIVE",
  onBusy: on => setClass($("busy"), "invisible", !on)   // visibility: no mueve la cabecera
});

function touch(...kinds) {
  if (state.phase !== "ACTIVE" && state.phase !== "APPLYING") return;
  queue.mark(...kinds);
  if (state.phase === "ACTIVE" && !uiLocked) queue.pump();
}

// ---------- sincronización ajustes -> UI ----------
let sIn, sOut, sShadow, sLpi, sAngle;

function setSeg(id, attr, value) {
  $$(`#${id} .seg-btn`).forEach(b => {
    const on = b.dataset[attr] === value;
    setClass(b, "active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
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
  // Sin knockout el color a eliminar no se usa (el de la prenda sí: vista Prenda)
  setClass($("swKo").parentNode, "locked", !S.knockout);
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
  if (opBusy || uiLocked) return;
  let c;
  await queue.drain();   // el selector abre su propio modal: no competir con un ajuste en curso
  try { c = await pickColor(S[key]); } catch (e) { return fail(e, "No se pudo abrir el selector de color."); }
  if (!c) return;
  S[key] = c;
  if (S.linked) { S.knockoutColor = { ...c }; S.shirt = { ...c }; }
  syncColors();
  touch(key === "shirt" && !S.linked ? "shirt" : "ko", "shirt");
}

// ---------- presets ----------
// Los nombres se resuelven por índice (no por el texto del item, que va escapado)
let presetNames = ["Default"];
const escapeHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function refreshPresets(selected) {
  presetNames = await presets.list();
  const idx = Math.max(0, presetNames.indexOf(selected || prefs.get("lastPreset", "Default")));
  // Se recrea el picker completo (con sus items) para que UXP lo renderice bien
  $("presetHolder").innerHTML = '<sp-picker id="presetPicker" size="s" class="full" label="Preset"><sp-menu slot="options">' +
    presetNames.map(n => `<sp-menu-item>${escapeHtml(n)}</sp-menu-item>`).join("") + "</sp-menu></sp-picker>";
  $("presetPicker").selectedIndex = idx;
  $("presetPicker").addEventListener("change", onPresetChange);
  setDisabled($("btnPresetDel"), presetNames[idx] === "Default");
  return presetNames[idx];
}

function currentPresetName() {
  return presetNames[pickerIndex($("presetPicker"))] || "Default";
}

// Aviso del módulo de presets (archivo dañado); true si se mostró
function presetWarning() {
  const w = presets.takeWarning();
  if (w) message(w, "warn");
  return !!w;
}

async function onPresetChange() {
  const name = currentPresetName();
  prefs.set("lastPreset", name);
  setDisabled($("btnPresetDel"), name === "Default");
  Object.assign(S, await presets.load(name));
  syncUI();
  touch(...live.ALL_KINDS);
  if (!presetWarning()) message(`Preset "${name}" cargado.`, "ok", 2000);
}

// Diálogos modales: un solo "done" pendiente; Esc o cerrar la ventana cuentan como cancelar
let dialogDone = () => {};
async function runDialog(id, title, height) {
  const dlg = $(id);
  const done = new Promise(res => { dialogDone = ok => { dlg.close(ok ? "ok" : "cancel"); res(ok); }; });
  const shown = dlg.uxpShowModal({ title, resize: "none", size: { width: 300, height } });
  const r = await Promise.race([shown, done]);
  return r === true || r === "ok";
}

function refreshPresetDialog() {
  const n = $("dlgPresetName").value.trim();
  const exists = n !== "Default" && presetNames.includes(n);
  setDisabled($("dlgPresetOk"), !n || n === "Default");
  $("dlgPresetOk").textContent = exists ? "Reemplazar" : "Guardar";
  const hint = n === "Default" ? 'El preset "Default" no se puede sobrescribir.'
             : exists ? "Ya existe un preset con ese nombre: se reemplazará." : "";
  $("dlgPresetHint").textContent = hint;
  setHidden($("dlgPresetHint"), !hint);
}
const presetNameOk = () => { const n = $("dlgPresetName").value.trim(); return !!n && n !== "Default"; };

async function askPresetName() {
  const cur = currentPresetName();
  $("dlgPresetName").value = cur === "Default" ? "" : cur;
  refreshPresetDialog();
  const ok = await runDialog("dlgPreset", "Guardar preset", 190);
  return ok && presetNameOk() ? $("dlgPresetName").value.trim() : "";
}

async function askConfirm(text, okLabel) {
  $("dlgConfirmText").textContent = text;
  $("dlgConfirmOk").textContent = okLabel;
  return runDialog("dlgConfirm", "Open-DTF", 170);
}

// ---------- Preparar / Aplicar / Cancelar ----------
async function onRun() {
  if (opBusy || state.phase !== "IDLE") return;
  const doc = currentDoc();
  if (!doc) return message("Abre un documento primero.", "warn");
  if (!sizeValid()) return message("Indica un tamaño mayor que 0.", "warn");
  const { widthPx, heightPx } = targetSize();
  if (Math.max(widthPx, heightPx) > 20000) {
    return message(`Tamaño muy grande (${widthPx}×${heightPx} px). Máximo recomendado: 20 000 px por lado.`, "warn");
  }
  message("Preparando el documento de trabajo…");
  setBusy("btnRun", "Preparando…");
  const before = JSON.stringify(S);
  try {
    const ok = await pipeline.runPrep({ ...S, widthPx, heightPx });
    if (ok) {
      state.previewMode = "shirt";
      message("Listo. Los cambios se aplican en vivo.", "ok", 3000);
    } else {
      message("Preparación cancelada.", "warn", 3000);
    }
  } catch (e) {
    await fail(e, "No se pudo preparar el documento. Comprueba que tiene al menos una capa visible y vuelve a intentarlo.");
    resetState();
  } finally {
    setBusy(null);
    showStep();
    syncUI();
    // Ajustes cambiados durante la preparación (p. ej. con el teclado): aplicarlos ya
    if (state.phase === "ACTIVE" && JSON.stringify(S) !== before) touch(...live.ALL_KINDS, "ht");
  }
}

async function onApply() {
  if (opBusy || state.phase !== "ACTIVE" || uiLocked) return;
  message("");
  state.phase = "APPLYING";             // touch() solo anota; events.js no bloquea ni resetea
  setBusy("btnApply", "Aplicando…");
  try {
    await queue.flush();                // Aplicar usa exactamente lo que muestra el panel
    const name = await pipeline.applyPrep(S);
    resetToIdle();
    message(`Listo: se creó «${name}». El original no se modificó.`, "ok", 5000);
  } catch (e) {
    if (state.phase === "APPLYING") state.phase = "ACTIVE";
    await fail(e, "No se pudo aplicar. El documento de trabajo se dejó como estaba: vuelve a intentarlo o pulsa Cancelar.");
    if (state.phase === "ACTIVE" && !uiLocked) queue.pump();
  } finally {
    setBusy(null);
  }
}

async function onCancel() {
  if (opBusy || state.phase !== "ACTIVE") return;
  state.phase = "CANCELLING";           // la cola deja de aplicar; events.js no interviene
  setBusy("btnCancel", "Cancelando…");
  try {
    await queue.drain();                // no cerrar el documento con un ajuste en vuelo
    await pipeline.cancelPrep();
    resetToIdle();
  } catch (e) {
    // El documento de trabajo sigue abierto: se continúa en vivo
    if (state.phase === "CANCELLING") state.phase = "ACTIVE";
    await fail(e, "No se pudo cerrar el documento de trabajo. Ciérralo a mano o vuelve a pulsar Cancelar.");
    if (state.phase === "ACTIVE" && !uiLocked) queue.pump();
  } finally {
    setBusy(null);
  }
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
    for (const ev of ["input", "change"]) $(id).addEventListener(ev, () => { linkSize(id); validateSize(); });
  }

  // Semitono (en vivo en el paso 2)
  $("chkHalftone").addEventListener("change", () => {
    S.halftone = $("chkHalftone").checked;
    setHidden($("htBody"), !S.halftone);
    touch("mask");
  });
  $$("#segHtType .seg-btn").forEach(b => onActivate(b, () => {
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
  $("chkKnockout").addEventListener("change", () => { S.knockout = $("chkKnockout").checked; syncColors(); touch("mask"); });
  $("chkLinked").addEventListener("change", () => {
    S.linked = $("chkLinked").checked;
    if (S.linked) S.shirt = { ...S.knockoutColor };
    syncColors();
    touch("shirt");
  });
  $$(".sw").forEach(e => onActivate(e, () => onSwatch(e.dataset.color)));

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
  // Sombras: re-renderiza Sombras/Iluminaciones a resolución completa; se aplica al soltar, no en cada movimiento
  sShadow = sliders.createValueSlider($("sldShadow"), "shadow", { min: 0, max: 100 }, v => {
    S.shadow = v.shadow; $("inShadow").value = v.shadow;
    if (state.phase === "ACTIVE") queue.defer("shadow");   // si no llega a soltarse, Aplicar lo recoge
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

  onActivate($("btnDefaults"), () => {
    Object.assign(S, { black: DEFAULTS.black, gamma: DEFAULTS.gamma, white: DEFAULTS.white,
                       outBlack: DEFAULTS.outBlack, outWhite: DEFAULTS.outWhite, shadow: DEFAULTS.shadow });
    syncTones();
    touch("levels", "shadow");
  });

  // Vista y acabado
  $$("#segPreview .seg-btn").forEach(b => onActivate(b, () => {
    state.previewMode = b.dataset.mode;
    setSeg("segPreview", "mode", state.previewMode);
    touch("preview");
  }));
  $$("#segCleanup .seg-btn").forEach(b => onActivate(b, () => {
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
      if (!presetWarning()) message(`Preset "${name}" guardado.`, "ok", 2500);
    } catch (e) { message(e.message, "warn"); }
  });
  $("btnPresetDel").addEventListener("click", async () => {
    const name = currentPresetName();
    if (name === "Default") return;
    if (!(await askConfirm(`¿Borrar el preset "${name}"? Tus ajustes actuales no cambian.`, "Borrar"))) return;
    try {
      await presets.remove(name);
      prefs.set("lastPreset", "Default");
      await refreshPresets("Default");   // solo cambia la selección: los ajustes se quedan como están
      if (!presetWarning()) message(`Preset "${name}" borrado.`, "ok", 2500);
    } catch (e) { message(e.message, "warn"); }
  });

  // Diálogos: Intro confirma, el botón principal solo se activa con un nombre válido
  $("dlgPresetName").addEventListener("input", refreshPresetDialog);
  $("dlgPresetName").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (presetNameOk()) dialogDone(true);
  });
  $("dlgPresetOk").addEventListener("click", e => { e.preventDefault(); if (presetNameOk()) dialogDone(true); });
  $("dlgPresetCancel").addEventListener("click", e => { e.preventDefault(); dialogDone(false); });
  $("dlgConfirmOk").addEventListener("click", e => { e.preventDefault(); dialogDone(true); });
  $("dlgConfirmCancel").addEventListener("click", e => { e.preventDefault(); dialogDone(false); });

  // Avisos: se pueden cerrar
  onActivate($("msgClose"), () => message(""));

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
    presetWarning();
  });
  await step("sync", () => { showStep(); syncUI(); });
  await step("tamaño", () => updateCurrentPrintSize(true));
  await step("eventos", () => events.init({
    onIdleChange: () => updateCurrentPrintSize(),
    onWorkClosed: () => { message("El documento de trabajo se cerró.", "warn"); resetToIdle(); },
    onLock: () => lock(),
    onUnlock: () => unlock()
  }));
}

// Cualquier error no controlado se avisa en el panel; el detalle va a la consola
window.addEventListener("error", e => { console.log("Open-DTF:", e.error || e.message); status("Error inesperado del panel." + DETAILS); });
window.addEventListener("unhandledrejection", e => { console.log("Open-DTF:", e.reason); status("Error inesperado del panel." + DETAILS); });

main().catch(e => { console.log("Halftones DTF init:", e); status(e.message); });
