const test = require("node:test");
const assert = require("node:assert/strict");
const { src, stubs, calls } = require("./helpers");

const { debounce, clamp } = src("util");
const units = src("ui/units");
const sliders = src("ui/levelsSlider");
const { DEFAULTS, state, resetState } = src("state");

test("clamp limita al rango", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test("debounce agrupa llamadas y se puede cancelar", async () => {
  let n = 0;
  const d = debounce(() => n++, 20);
  d(); d(); d();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(n, 1);
  d(); d.cancel();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(n, 1);
});

test("unidades: conversión px <-> in/cm/mm a 300 ppi", () => {
  assert.equal(units.toPx(1, "in"), 300);
  assert.equal(units.toPx(2.54, "cm"), 300);
  assert.equal(units.toPx(25.4, "mm"), 300);
  assert.equal(units.fromPx(300, "in"), 1);
  assert.equal(units.fromPx(300, "cm"), 2.54);
});

test("celda entera: el LPI resultante da una celda de px enteros", () => {
  for (const lpi of [5, 17, 30, 33.3, 45, 55, 120, 234]) {
    const w = units.wholeCellLpi(lpi);
    const cell = units.RES / w;
    assert.ok(Math.abs(cell - Math.round(cell)) < 0.05, `${lpi} -> ${w} (celda ${cell})`);
  }
  assert.equal(units.wholeCellLpi(45), 42.9);   // celda 6,67 px -> 7 px
  assert.equal(units.wholeCellLpi(30), 30);
});

test("restricciones de niveles de entrada: negro < blanco - 2", () => {
  const v = { black: 10, white: 100 };
  assert.equal(sliders.constrainIn("black", 200, v), 98);
  assert.equal(sliders.constrainIn("black", -5, v), 0);
  assert.equal(sliders.constrainIn("white", 5, v), 12);
  assert.equal(sliders.constrainIn("white", 999, v), 255);
});

test("restricciones de niveles de salida", () => {
  const v = { outBlack: 20, outWhite: 200 };
  assert.equal(sliders.constrainOut("outBlack", 250, v), 200);
  assert.equal(sliders.constrainOut("outWhite", 5, v), 20);
});

test("resetState limpia el estado de trabajo", () => {
  Object.assign(state, { phase: "ACTIVE", workDocId: 3, maskFresh: true, shadowOn: true });
  state.layers = { art: 1 };
  resetState();
  assert.equal(state.phase, "IDLE");
  assert.equal(state.workDocId, null);
  assert.equal(state.maskFresh, false);
  assert.deepEqual(state.layers, {});
});

test("presets: normalize completa los valores que faltan y list incluye Default", async () => {
  let stored = JSON.stringify({ Mio: { lpi: 55 } });
  stubs.uxp.storage.localFileSystem.getDataFolder = async () => ({
    getEntry: async () => ({ read: async () => stored }),
    createFile: async () => ({ write: async s => { stored = s; } })
  });
  const presets = src("presets");
  assert.deepEqual(await presets.list(), ["Default", "Mio"]);
  const p = await presets.load("Mio");
  assert.equal(p.lpi, 55);
  assert.equal(p.angle, DEFAULTS.angle);
  await assert.rejects(presets.save("Default", DEFAULTS));
  await presets.save("Otro", { lpi: 40 });
  assert.ok(JSON.parse(stored).Otro);
});

// ---- Descriptores de vista previa: cambios accidentales rompen el flujo de Photoshop ----
test("previewDescs: las vistas con máscara al día y caducada", () => {
  const { previewDescs } = src("ps/preview");
  state.layers = { art: 1, shirt: 2, mapGroup: 3, ko: 4, desat: 5, halftone: 6, threshold: 7 };
  const s = { knockout: true, halftone: true };
  const summary = ds => ds.map(d => {
    if (d._obj === "show" || d._obj === "hide") return `${d._obj}:${d.null[0]._id}`;
    if (d.to && d.to.mode) return `mode:${d._target[0]._id}=${d.to.mode._value}`;
    if (d.to && "userMaskEnabled" in d.to) return `mask:${d._target[0]._id}=${d.to.userMaskEnabled}`;
    return d._obj;
  });
  assert.deepEqual(summary(previewDescs("shirt", false, s)), ["hide:3", "show:1", "mask:1=true", "show:2"]);
  assert.deepEqual(summary(previewDescs("original", false, s)), ["hide:3", "show:1", "mask:1=false", "hide:2"]);
  assert.deepEqual(summary(previewDescs("shirt", true, s)), [
    "show:4", "show:5", "show:6", "hide:7", "mode:3=multiply", "show:1", "mask:1=false", "show:2", "show:3"]);
  assert.deepEqual(summary(previewDescs("mask", false, s)), ["mode:3=passThrough", "hide:1", "hide:2", "show:3"]);
});

test("bpThenId añade la lectura del ID de capa y lo devuelve", async () => {
  stubs.photoshop.action.batchPlay = async descs => { calls.push(descs); return [{}, { layerID: 42 }]; };
  const { bpThenId } = src("ps/bp");
  const id = await bpThenId({ _obj: "make" });
  assert.equal(id, 42);
  const sent = calls[calls.length - 1];
  assert.equal(sent.length, 2);
  assert.equal(sent[1]._obj, "get");
});

test("perf: percentiles, track anidado y informe", async () => {
  const perf = src("perf");
  assert.equal(perf.percentile([10, 20, 30, 40, 100], 50), 30);
  assert.equal(perf.percentile([10, 20, 30, 40, 100], 95), 100);
  assert.equal(perf.percentile([], 50), 0);
  perf.clear();
  const r = await perf.track("Prueba", async () => {
    perf.noteBatch("make", 5);
    perf.noteBatch("set", 9);
    return perf.track("interna", async () => { perf.noteBatch("get", 1); return 7; });   // se atribuye a la exterior
  });
  assert.equal(r, 7);
  const s = perf.stats();
  assert.equal(s.length, 1);
  assert.equal(s[0].label, "Prueba");
  assert.equal(s[0].calls, 3);
  const txt = perf.report(["ENV"]);
  assert.match(txt, /^ENV/);
  assert.match(txt, /Prueba: n=1/);
  assert.match(txt, /set/);              // el batchPlay más lento aparece en la última operación
  perf.clear();
  assert.match(perf.report(), /Sin mediciones/);
});

test("halftone: tile exacto para la celda y escala ~100 %", () => {
  const { tileFor, EXACT_MIN, EXACT_MAX } = src("halftone");
  const t = tileFor(30, 300);                       // celda de 10 px
  assert.equal(t.n, 10);
  assert.equal(t.scale, 100);
  const u = tileFor(45, 300);                       // celda de 6,67 px -> tile de 7
  assert.equal(u.n, 7);
  assert.ok(Math.abs(u.scale - 95.24) < 0.1);
  assert.equal(tileFor(234, 300).n, EXACT_MIN);     // fuera de rango: tile más cercano
  assert.equal(tileFor(5, 300).n, EXACT_MAX);
  assert.ok(tileFor(234, 300).scale >= 1);
});

test("halftone: pesos de Blanco y negro según la sensibilidad", () => {
  const { bwWeights } = src("halftone");
  assert.deepEqual(bwWeights(0), { red: 40, yellow: 60, green: 40, cyan: 60, blue: 20, magenta: 80 });
  assert.deepEqual(Object.values(bwWeights(100)), [100, 100, 100, 100, 100, 100]);
  const mid = bwWeights(50);
  assert.equal(mid.red, 70);
  assert.equal(mid.blue, 60);
  assert.deepEqual(bwWeights(999), bwWeights(100));       // se limita a 0..100
});

test("halftone: curva de punto mínimo y máximo", () => {
  const { dotCurve } = src("halftone");
  assert.deepEqual(dotCurve(0, 100), [[0, 0], [255, 255]]);                 // identidad
  assert.deepEqual(dotCurve(10, 100), [[0, 0], [25, 0], [26, 26], [255, 255]]);
  assert.deepEqual(dotCurve(0, 90), [[0, 0], [230, 230], [231, 255], [255, 255]]);
  const xs = dotCurve(5, 95).map(p => p[0]);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));                      // entradas crecientes y sin repetir
  assert.equal(new Set(xs).size, xs.length);
  assert.deepEqual(dotCurve(0.2, 100)[0], [0, 0]);                          // lo = 1 no duplica el punto (0,0)
});

test("tiles exactos: existen para todos los tipos y tamaños", () => {
  const fs = require("fs"), path = require("path");
  const { EXACT_MIN, EXACT_MAX } = src("halftone");
  for (const t of ["round", "line", "diamond", "ellipse"]) {
    for (let n = EXACT_MIN; n <= EXACT_MAX; n++) {
      assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "tiles", `ht_${t}_${n}.png`)), `${t} ${n}`);
    }
  }
});
