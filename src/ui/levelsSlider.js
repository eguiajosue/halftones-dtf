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
