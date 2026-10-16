#!/usr/bin/env node
/* Renderiza promo/tiktok a MP4 (1080×1920, 30 fps, H.264 + AAC).
   Uso:
     python3 promo/tiktok/audio.py            # genera build/audio.wav
     node promo/tiktok/render.js              # genera build/open-dtf-tiktok.mp4
     node promo/tiktok/render.js --stills 0,60,150   # solo fotogramas sueltos (PNG)
   Requiere ffmpeg y playwright (npm i -D playwright, o NODE_PATH apuntando a él).
   Variables opcionales:
     CHROMIUM_PATH  ejecutable de Chromium
     THREE_DIR      carpeta local del paquete three (sin acceso al CDN) */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(__dirname, "build");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".wav": "audio/wav" };

const args = process.argv.slice(2);
const stillsArg = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  if (process.env.THREE_DIR) {
    const dir = process.env.THREE_DIR;
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, (r) =>
      r.fulfill({ body: fs.readFileSync(path.join(dir, r.request().url().split("three@0.160.0/")[1])), contentType: "text/javascript" }));
  }
  await page.goto(`http://127.0.0.1:${port}/promo/tiktok/index.html?render`);
  await page.waitForFunction(() => window.promo);
  await page.evaluate(() => window.promo.ready);
  const { FPS, DURATION } = await page.evaluate(() => ({ FPS: window.promo.FPS, DURATION: window.promo.DURATION }));
  const total = FPS * DURATION, clip = { x: 0, y: 0, width: 1080, height: 1920 };

  if (stillsArg) {
    for (const i of stillsArg.split(",").map(Number)) {
      await page.evaluate((n) => window.promo.frame(n), i);
      await page.screenshot({ path: path.join(OUT, `still_${String(i).padStart(3, "0")}.png`), clip });
    }
  } else {
    const wav = path.join(OUT, "audio.wav"), mp4 = path.join(OUT, "open-dtf-tiktok.mp4");
    const audioIn = fs.existsSync(wav) ? ["-i", wav] : [];
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", ...audioIn,
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS),
      ...(audioIn.length ? ["-c:a", "aac", "-b:a", "192k", "-ar", "44100"] : []),
      "-t", String(DURATION), "-movflags", "+faststart", mp4,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    for (let i = 0; i < total; i++) {
      await page.evaluate((n) => window.promo.frame(n), i);
      const png = await page.screenshot({ type: "png", clip });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 30 === 0) process.stdout.write(`\r${i}/${total}`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c ? j(new Error("ffmpeg " + c)) : r())));
    console.log(`\n${mp4}${audioIn.length ? "" : " (sin audio: falta build/audio.wav)"}`);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
