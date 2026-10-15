// T14: el plugin no debe procesar píxeles en JS (regla nativa, spec §0.1).
const fs = require("fs");
const path = require("path");

const FORBIDDEN = /\b(imaging|getPixels|putPixels|ImageData|Uint8Array)\b/;
let bad = 0;

(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith(".js")) continue;
    fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (FORBIDDEN.test(line)) { console.error(`${p}:${i + 1}: ${line.trim()}`); bad++; }
    });
  }
})(path.join(__dirname, "..", "src"));

if (bad) { console.error(`\nFALLO: ${bad} coincidencia(s).`); process.exit(1); }
console.log("OK: 0 coincidencias de imaging/getPixels/putPixels/ImageData/Uint8Array en src/");
