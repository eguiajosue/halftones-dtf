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

// Dimensión del documento (UnitValue, número u objeto con .value) en píxeles.
const dimPx = v => (typeof v === "number" ? v : v && typeof v.as === "function" ? v.as("px") : Number(v && v.value !== undefined ? v.value : v));

// Texto legible de cualquier cosa lanzada. Photoshop/UXP a veces rechaza con cadenas, números u
// objetos sin `message`; sin esto el panel mostraba solo "undefined".
function errText(e) {
  if (e === undefined || e === null) return "Error desconocido de Photoshop";
  if (typeof e === "string") return e || "Error desconocido de Photoshop";
  if (typeof e === "number") return `Código de error ${e}`;
  if (e.message) return String(e.message);
  try {
    const j = JSON.stringify(e);
    if (j && j !== "{}") return j;
  } catch (_) { /* objeto no serializable */ }
  const s = String(e);
  return s && s !== "[object Object]" ? s : "Error desconocido de Photoshop";
}

module.exports = { debounce, createQueue, clamp, dimPx, errText };
