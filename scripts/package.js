// Genera dist/halftones-dtf.ccx (zip con la extensión renombrada).
const { execSync } = require("child_process");
const fs = require("fs");
fs.mkdirSync("dist", { recursive: true });
fs.rmSync("dist/halftones-dtf.ccx", { force: true });
execSync("zip -r dist/halftones-dtf.ccx manifest.json index.html src icons -x '*.DS_Store'", { stdio: "inherit" });
