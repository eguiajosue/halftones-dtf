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
const createValueSlider = (root, key, { min, max, stepBy = 1 }, onChange) => createSlider(root, {
  min, max, onChange, fill: [null, key],
  constrain: (k, v) => clamp(+step(v, stepBy).toFixed(2), min, max),
  handles: [{ key, kind: "value" }] });

module.exports = { createInputSlider, createOutputSlider, createValueSlider, constrainIn, constrainOut };
