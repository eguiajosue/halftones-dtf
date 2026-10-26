// Medición de rendimiento: tiempo total de cada operación del plugin, nº de batchPlay y los más lentos.
// Siempre registra (coste mínimo); el panel de depuración solo lo muestra.
const MAX_SAMPLES = 50;

const samples = {};          // etiqueta -> [{ ms, calls, bpMs }]
let current = null;
let last = null;
let listener = null;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function percentile(values, p) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}

// Llamado desde bp(): una entrada por batchPlay
function noteBatch(names, ms) {
  if (!current) return;
  current.calls++;
  current.bpMs += ms;
  current.slow.push({ name: names, ms });
  if (current.slow.length > 20) { current.slow.sort((a, b) => b.ms - a.ms); current.slow.length = 5; }
}

// Si ya hay una operación en curso, la anidada se atribuye a la exterior.
async function track(label, fn) {
  if (current) return fn();
  const op = { label, t0: now(), calls: 0, bpMs: 0, slow: [] };
  current = op;
  try {
    return await fn();
  } finally {
    current = null;
    op.ms = now() - op.t0;
    op.slow.sort((a, b) => b.ms - a.ms);
    op.slow.length = Math.min(op.slow.length, 3);
    const list = samples[label] || (samples[label] = []);
    list.push({ ms: op.ms, calls: op.calls, bpMs: op.bpMs });
    if (list.length > MAX_SAMPLES) list.shift();
    last = op;
    if (listener) { try { listener(); } catch (e) { /* UI */ } }
  }
}

function stats() {
  return Object.keys(samples).sort().map(label => {
    const l = samples[label];
    const ms = l.map(x => x.ms);
    return { label, n: l.length, p50: percentile(ms, 50), p95: percentile(ms, 95), max: Math.max(...ms),
             calls: Math.round(l.reduce((a, x) => a + x.calls, 0) / l.length) };
  });
}

const fmt = ms => (ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : Math.round(ms) + " ms");

// Texto listo para pegar en una incidencia. env: líneas de contexto (documento, versión…)
function report(env = []) {
  const out = [...env, ""];
  const s = stats();
  if (!s.length) out.push("Sin mediciones todavía.");
  for (const r of s) {
    out.push(`${r.label}: n=${r.n} · p50 ${fmt(r.p50)} · p95 ${fmt(r.p95)} · máx ${fmt(r.max)} · ~${r.calls} batchPlay`);
  }
  if (last) {
    out.push("", `Última: ${last.label} ${fmt(last.ms)} (${last.calls} batchPlay, ${fmt(last.bpMs)} en Photoshop)`);
    last.slow.forEach(x => out.push(`  · ${fmt(x.ms)}  ${x.name}`));
  }
  return out.join("\n");
}

function clear() { for (const k of Object.keys(samples)) delete samples[k]; last = null; }
function onUpdate(fn) { listener = fn; }

module.exports = { track, noteBatch, stats, report, clear, onUpdate, percentile, fmt };
