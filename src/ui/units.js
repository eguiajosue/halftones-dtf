const RES = 300;                       // ppi de trabajo
const INCH = { in: 1, cm: 2.54, mm: 25.4 };

const toPx = (value, unit) => Math.round(value * RES / INCH[unit]);
const fromPx = (px, unit) => Math.round((px / RES) * INCH[unit] * 1000) / 1000;
const lpiToLpc = lpi => lpi / 2.54;
// LPI más cercano cuya celda mide un número entero de píxeles a 300 ppi
const wholeCellLpi = lpi => Math.round((RES / Math.max(1, Math.round(RES / lpi))) * 10) / 10;

module.exports = { RES, INCH, toPx, fromPx, lpiToLpc, wholeCellLpi };
