// Stubs mínimos de los módulos nativos de UXP ("photoshop", "uxp") y del DOM, para cargar src/ en Node.
// No simulan Photoshop: solo permiten probar la lógica pura (cola, presets, sliders, unidades).
const Module = require("module");

const natives = { photoshop: { app: {}, action: {}, core: {}, constants: {} }, uxp: { storage: {} } };
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(natives, request)) return natives[request];
  return origLoad.call(this, request, ...rest);
};

// Carpeta de datos en memoria (storage.localFileSystem.getDataFolder)
function memoryFolder(files = {}) {
  const entry = name => ({ name, read: async () => files[name], write: async t => { files[name] = String(t); } });
  return {
    files,
    getEntry: async name => { if (!(name in files)) throw new Error("no existe"); return entry(name); },
    createFile: async name => entry(name)
  };
}
function useFolder(folder) {
  natives.uxp.storage.localFileSystem = { getDataFolder: async () => folder };   // presets.js guarda la referencia a storage
}

// DOM mínimo para levelsSlider: elementos con estilo, listeners y un rectángulo fijo de 100 px
function fakeElement() {
  const listeners = {};
  const el = {
    style: {}, className: "", children: [], listeners,
    set innerHTML(v) { el.children = []; el._fill = fakeElement(); },
    querySelector: () => el._fill,
    appendChild: c => { el.children.push(c); return c; },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    fire: (t, e = {}) => (listeners[t] || []).forEach(f => f({ preventDefault() {}, stopPropagation() {}, ...e }))
  };
  return el;
}
function installDocument() {
  global.document = Object.assign(fakeElement(), { createElement: () => fakeElement() });
  return global.document;
}

module.exports = { natives, memoryFolder, useFolder, fakeElement, installDocument };
