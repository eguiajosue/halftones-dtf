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

module.exports = { debounce, createQueue, clamp, dimPx };
