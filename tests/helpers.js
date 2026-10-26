// Sustituye los módulos nativos de UXP/Photoshop para probar la lógica pura en Node.
const Module = require("module");
const path = require("path");

const calls = [];
const stubs = {
  photoshop: {
    action: { batchPlay: async (descs) => { calls.push(descs); return descs.map(() => ({})); }, addNotificationListener() {} },
    core: { executeAsModal: async fn => fn({ hostControl: {}, reportProgress() {} }) },
    app: { documents: [], activeDocument: null },
    constants: {}
  },
  uxp: { storage: { localFileSystem: {} } }
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  return stubs[request] || origLoad.call(this, request, ...rest);
};

const src = p => require(path.join(__dirname, "..", "src", p));
module.exports = { src, stubs, calls };
