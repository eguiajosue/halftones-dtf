// T14: el plugin no debe procesar píxeles en JS (regla nativa, spec §0.1).
// Además, reglas de compatibilidad UXP (CONTRIBUTING.md): sin toggleAttribute, sin classList.toggle(x, bool)
// y sin CSS gap/grid. Se revisan src/, el main.js generado y styles.css.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const FORBIDDEN = /\b(imaging|getPixels|putPixels|ImageData|Uint8Array)\b/;
const JS_COMPAT = [
  [/\.toggleAttribute\s*\(/, "toggleAttribute no existe en UXP"],
  [/classList\.toggle\s*\([^)]*,/, "classList.toggle(x, bool) no funciona en UXP"]
];
const CSS_COMPAT = [
  [/(^|[\s;{])(gap|row-gap|column-gap|grid(-[a-z]+)*)\s*:/, "gap/grid no existen en UXP"],
  [/display\s*:\s*(inline-)?grid\b/, "display: grid no existe en UXP"]
];
let bad = 0;
const report = (p, i, line, why) => { console.error(`${path.relative(root, p)}:${i + 1}: ${why ? why + ": " : ""}${line.trim()}`); bad++; };

function checkJs(p) {
  fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
    if (FORBIDDEN.test(line)) report(p, i, line);
    const code = line.replace(/\/\/.*$/, "");      // las reglas UXP ignoran comentarios de línea
    for (const [re, why] of JS_COMPAT) if (re.test(code)) report(p, i, line, why);
  });
}

(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (p.endsWith(".js")) checkJs(p);
  }
})(path.join(root, "src"));
checkJs(path.join(root, "main.js"));

// CSS: se quitan los comentarios conservando los saltos de línea (para los números de línea)
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " "));
css.split("\n").forEach((line, i) => {
  for (const [re, why] of CSS_COMPAT) if (re.test(line)) report(path.join(root, "styles.css"), i, line, why);
});

if (bad) { console.error(`\nFALLO: ${bad} coincidencia(s).`); process.exit(1); }
console.log("OK: regla nativa (sin imaging/getPixels/putPixels/ImageData/Uint8Array) y compatibilidad UXP en src/, main.js y styles.css");
