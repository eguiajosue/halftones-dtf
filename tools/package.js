// Empaqueta dist/HalftonePrep_v<version>.ccx (zip con otra extensión).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const out = path.join(root, "dist", `HalftonePrep_v${version}.ccx`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
execFileSync("zip", ["-qr", out, "manifest.json", "index.html", "styles.css", "src", "assets", "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });
console.log("Creado", path.relative(root, out));
