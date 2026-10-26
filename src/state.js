const TILE_PX = 128;

const DEFAULTS = {
  lpi: 30, angle: 33, htType: "ROUND", halftone: true, knockout: true,
  knockoutColor: { r: 0, g: 0, b: 0 }, shirt: { r: 0, g: 0, b: 0 }, linked: true,
  black: 7, gamma: 2.0, white: 100, outBlack: 0, outWhite: 255, shadow: 0,
  cleanup: "standard", defringe: false, nativeFinal: false
};

const state = {
  phase: "IDLE",          // IDLE | RUNNING | ACTIVE
  srcDocId: null,         // documento original (no se toca)
  workDocId: null,        // duplicado "<doc> - Prep"
  layers: {},             // IDs: art, shirt, mapGroup, mapArt, mapBg, ko, desat, levels, threshold, halftone
  settings: JSON.parse(JSON.stringify(DEFAULTS)),
  previewMode: "shirt",
  shadowOn: false,
  maskFresh: false        // la máscara de ART refleja los ajustes actuales
};

function resetState() {
  state.phase = "IDLE";
  state.srcDocId = null;
  state.workDocId = null;
  state.layers = {};
  state.previewMode = "shirt";
  state.shadowOn = false;
  state.maskFresh = false;
}

module.exports = { TILE_PX, DEFAULTS, state, resetState };
