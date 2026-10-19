// Empaqueta src/**/*.js en un único main.js (sin require relativos, que UXP resuelve de forma poco fiable).
// Solo "photoshop" y "uxp" se piden al require nativo. Los errores de arranque se muestran en el panel.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const defs = walk(srcDir).map(p => {
  const id = path.relative(root, p).split(path.sep).join("/");
  return `defs[${JSON.stringify(id)}] = function (module, exports, require) {\n${fs.readFileSync(p, "utf8")}\n};`;
});

const out = `// GENERADO por tools/build.js a partir de src/. No editar a mano.
(function (nativeRequire) {
  var defs = {}, cache = {};
  function norm(from, req) {
    var parts = from.split("/").slice(0, -1);
    req.split("/").forEach(function (seg) {
      if (seg === "" || seg === ".") return;
      if (seg === "..") parts.pop(); else parts.push(seg);
    });
    var p = parts.join("/");
    return /\\.js$/.test(p) ? p : p + ".js";
  }
  function load(id) {
    if (cache[id]) return cache[id].exports;
    if (!defs[id]) throw new Error("Módulo no encontrado: " + id);
    var m = { exports: {} };
    cache[id] = m;
    defs[id](m, m.exports, function (r) { return r.charAt(0) === "." ? load(norm(id, r)) : nativeRequire(r); });
    return m.exports;
  }
${defs.join("\n")}
  try {
    load("src/main.js");
  } catch (e) {
    var box = document.getElementById("msg"), txt = document.getElementById("msgText") || box;
    if (txt) txt.textContent = "Error de arranque: " + (e && e.message ? e.message : e);
    if (box) box.className = "banner error";
    console.log("Open-DTF boot:", e);
  }
})(require);
`;

fs.writeFileSync(path.join(root, "main.js"), out);
console.log("Generado main.js (" + defs.length + " módulos)");
