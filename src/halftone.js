// Cálculos puros del semitono (sin Photoshop): se prueban en Node.
const { clamp } = require("./util");

const EXACT_MIN = 3, EXACT_MAX = 48;      // tamaños de celda con tile propio (assets/tiles/ht_<tipo>_<n>.png)

// Celda de la trama en px y tile que la reproduce a escala ~100 %. Fuera de rango se usa el tile más cercano.
function tileFor(lpi, resolution) {
  const cell = resolution / lpi;
  const n = clamp(Math.round(cell), EXACT_MIN, EXACT_MAX);
  return { cell, n, scale: Math.max(1, (100 * cell) / n) };
}

// Pesos de la capa Blanco y negro (porcentaje por color). Con sensibilidad 0 son los de Photoshop;
// con 100 todos los colores saturados cuentan como tinta completa. Neutros: sin cambio.
const BW_BASE = { red: 40, yellow: 60, green: 40, cyan: 60, blue: 20, magenta: 80 };
function bwWeights(sens) {
  const t = clamp(sens, 0, 100) / 100;
  const out = {};
  for (const k of Object.keys(BW_BASE)) out[k] = Math.round(BW_BASE[k] + (100 - BW_BASE[k]) * t);
  return out;
}

// Puntos de la curva (entrada, salida) en 0..255: por debajo del punto mínimo no hay punto (0),
// por encima del máximo es sólido (255), y entre ambos la respuesta es lineal.
function dotCurve(minPct, maxPct) {
  const lo = Math.round(clamp(minPct, 0, 100) * 255 / 100), hi = Math.round(clamp(maxPct, 0, 100) * 255 / 100);
  const pts = [[0, 0]];
  if (lo > 0) pts.push([lo - 1, 0], [lo, lo]);
  if (hi < 255) pts.push([hi, hi], [hi + 1, 255]);
  pts.push([255, 255]);
  const seen = new Set();
  return pts.filter(([x]) => (seen.has(x) ? false : (seen.add(x), true)));
}

module.exports = { EXACT_MIN, EXACT_MAX, tileFor, bwWeights, dotCurve };
