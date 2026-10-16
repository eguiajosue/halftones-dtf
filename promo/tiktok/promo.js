/* ============================================================
   Open-DTF · video promocional 9:16 (TikTok), 15 s a 30 fps.
   Cada fotograma es una función pura del tiempo: frame(i) dibuja
   exactamente lo mismo cada vez, así el render es reproducible.
   Los tiempos de los eventos (T) se repiten en audio.py.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const FPS = 30, DURATION = 15, W = 1080, H = 1920;
const INK = { paper: "#f4f5f3", k: "#0b0b0c", c: "#00aeef", m: "#ec008c", y: "#ffe600", gray: "#6b6d70" };

// Guion (segundos). Rejilla de 120 BPM: un pulso cada 0,5 s.
const T = {
  hookWords: [0.08, 0.32, 0.56, 0.86, 1.10, 1.40],
  highlight: 1.52, strike: 1.95, wipeK: 2.45,
  alt: [2.80, 2.95, 3.20],
  poster: 3.85, scan: 4.45, tune: 5.55, knock: 6.65,
  wipePaper: 7.90, print: 8.30, land: 8.60, teeCap: [8.70, 8.85, 9.20],
  fields: [10.70, 11.45, 12.20],
  end: 13.05, dots: [13.35, 13.45, 13.55], word: 13.65, cta: 13.95, bio: 14.15,
};

const cv = document.getElementById("v");
const ctx = cv.getContext("2d");

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, d) => clamp((t - a) / d);
const lerp = (a, b, p) => a + (b - a) * p;
const eOut = (p) => 1 - Math.pow(1 - p, 3);
const eIn = (p) => p * p * p;
const eIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const eBack = (p) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

const DISPLAY = (s, w = 800) => `${w} ${s}px "Bricolage Grotesque"`;
const BODY = (s, w = 600) => `${w} ${s}px "Archivo"`;
const SERIF = (s) => `italic 400 ${s}px "Instrument Serif"`;

/* ------------------------------------------------------------
   Ilustración: la misma escena procedural de la web
   (site/assets/app.js · art), sin recursos de terceros.
   ------------------------------------------------------------ */
const AW = 8, AH = 10, HZ = 0.34;
const hash = (x, y) => { const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return t - Math.floor(t); };
function ridge(u, peaks, jitter) {
  let h = 0;
  for (const [pu, ph, slope] of peaks) h = Math.max(h, ph - Math.abs(u - pu) * slope);
  return h + jitter * (Math.sin(u * 61) * 0.5 + Math.sin(u * 137 + 1.3) * 0.3);
}
const BACK = [[0.12, 0.2, 0.9], [0.4, 0.15, 1.1], [0.82, 0.24, 0.95]];
const FRONT = [[0.26, 0.1, 1.0], [0.64, 0.13, 1.15], [0.96, 0.08, 0.9]];
const SUN = { cx: 0.5, cy: 0.56, R: 0.23 };
function sunColor(t, o) { o.r = 1; o.g = 0.14 + 0.78 * t; o.b = 0.5 - 0.42 * t; return o; }
function art(u, v, o) {
  if (v >= HZ) {
    const t = Math.pow(1 - (v - HZ) / (1 - HZ), 2.4);
    o.r = 0.62 * t; o.g = 0.05 * t + 0.02 * t * t; o.b = 0.5 * t;
    const cs = 0.032, ix = Math.floor(u / cs), iy = Math.floor(v / cs);
    if (v > 0.62 && hash(ix, iy) > 0.94) {
      const sx = u / cs - ix - 0.5, sy = v / cs - iy - 0.5;
      if (sx * sx + sy * sy < 0.06) { o.r = o.g = o.b = 0.95; }
    }
    const dx = (u - SUN.cx) * (AW / AH), dy = v - SUN.cy, d = Math.hypot(dx, dy);
    if (d <= SUN.R) {
      sunColor((v - (SUN.cy - SUN.R)) / (2 * SUN.R), o);
      const top = SUN.cy + 0.03;
      if (v < top) {
        const k = (top - v) / SUN.R, period = 0.042, gap = 0.003 + 0.024 * k;
        if ((top - v) % period < gap) { const tt = Math.pow(1 - (v - HZ) / (1 - HZ), 2.4); o.r = 0.62 * tt; o.g = 0.05 * tt; o.b = 0.5 * tt; }
      }
    } else if (d < SUN.R + 0.2) {
      const gl = Math.pow(1 - (d - SUN.R) / 0.2, 2) * 0.55;
      o.r = Math.min(1, o.r + gl); o.g = Math.min(1, o.g + gl * 0.3); o.b = Math.min(1, o.b + gl * 0.35);
    }
    const hb = HZ + ridge(u, BACK, 0.006);
    if (v < hb) {
      const t2 = (v - HZ) / Math.max(0.001, hb - HZ), rim = Math.max(0, 1 - (hb - v) / 0.018);
      o.r = 0.2 + 0.18 * t2 + 0.6 * rim; o.g = 0.1 + 0.08 * t2 + 0.25 * rim; o.b = 0.55 + 0.25 * t2 + 0.2 * rim;
    }
    const hf = HZ + ridge(u, FRONT, 0.004);
    if (v < hf) {
      const t3 = (v - HZ) / Math.max(0.001, hf - HZ), rim = Math.max(0, 1 - (hf - v) / 0.014);
      o.r = 0.03 + 0.05 * t3; o.g = 0.18 + 0.2 * t3 + 0.6 * rim; o.b = 0.42 + 0.25 * t3 + 0.5 * rim;
    }
    if (v - HZ < 0.006) { o.r = Math.max(o.r, 1); o.g = Math.max(o.g, 0.35); o.b = Math.max(o.b, 0.6); }
    return o;
  }
  const depth = (HZ - v) / HZ;
  o.r = o.g = o.b = 0;
  const half = (SUN.R * 0.95) * (1 - depth * 0.55);
  const wave = Math.sin((HZ - v) * 150 + Math.sin(u * 24) * 1.2);
  if (Math.abs((u - SUN.cx) * (AW / AH)) < half * (0.75 + 0.25 * Math.sin(v * 90)) && wave > -0.15 + depth * 0.9) {
    sunColor(Math.max(0, 0.45 - depth * 0.45), o);
    const f = (1 - depth) * 0.95;
    o.r *= f; o.g *= f; o.b *= f;
  } else if (wave > 0.85) {
    const f = (1 - depth) * 0.35; o.r = 0.7 * f; o.g = 0.2 * f; o.b = 0.6 * f;
  }
  return o;
}

// Póster en pantalla y su versión de tono continuo
const P = { x: 180, y: 330, w: 720, h: 900 };
const tone = document.createElement("canvas");
tone.width = P.w; tone.height = P.h;
const px = new Float32Array(P.w * P.h * 3);
function buildArt() {
  const img = tone.getContext("2d").createImageData(P.w, P.h), o = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    art((x + 0.5) / P.w, 1 - (y + 0.5) / P.h, o);
    const i = y * P.w + x;
    px[i * 3] = o.r; px[i * 3 + 1] = o.g; px[i * 3 + 2] = o.b;
    img.data[i * 4] = o.r * 255; img.data[i * 4 + 1] = o.g * 255; img.data[i * 4 + 2] = o.b * 255; img.data[i * 4 + 3] = 255;
  }
  tone.getContext("2d").putImageData(img, 0, 0);
}

/* Trama: puntos del color de la ilustración, área proporcional al brillo.
   thr > 0 elimina lo que tiende al negro (knockout). */
function dots(g, ox, oy, { cell, angle, thr = 0, maxY = Infinity }) {
  const a = angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const cx = P.w / 2, cy = P.h / 2, n = Math.ceil(Math.hypot(P.w, P.h) / 2 / cell) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = cx + (i * ux - j * uy) * cell, y = cy + (i * uy + j * ux) * cell;
    if (x < 0 || y < 0 || x >= P.w || y >= P.h || y > maxY) continue;
    const k = ((y | 0) * P.w + (x | 0)) * 3, r = px[k], gg = px[k + 1], b = px[k + 2];
    const m = Math.max(r, gg, b);
    let s = m;
    if (thr > 0) s *= clamp((m - thr) / 0.06);
    if (s < 0.004) continue;
    const rad = cell * Math.sqrt(s / Math.PI) * 1.02;
    g.fillStyle = `rgb(${(r / m * 255) | 0},${(gg / m * 255) | 0},${(b / m * 255) | 0})`;
    g.beginPath(); g.arc(ox + x, oy + y, rad, 0, Math.PI * 2); g.fill();
  }
}

/* ------------------------------------------------------------
   Piezas gráficas
   ------------------------------------------------------------ */
function cropMarks(color, inset = 46, len = 46) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x - sx * 18, y); ctx.lineTo(x + sx * len, y);
    ctx.moveTo(x, y - sy * 18); ctx.lineTo(x, y + sy * len);
    ctx.stroke();
  }
  ctx.restore();
}
function regMark(x, y, r, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 1.7, y); ctx.lineTo(x + r * 1.7, y); ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x, y + r * 1.7); ctx.stroke();
  ctx.restore();
}
function slug(text, color) {
  ctx.save(); ctx.font = BODY(20, 600); ctx.letterSpacing = "3px"; ctx.fillStyle = color;
  ctx.fillText(text, 96, 104); ctx.restore();
  regMark(W - 120, 97, 11, color);
}
function paper(dark) {
  ctx.fillStyle = dark ? INK.k : INK.paper; ctx.fillRect(0, 0, W, H);
}

/* Texto que entra «fuera de registro»: las planchas C y M llegan
   desplazadas y se asientan bajo la tinta principal. */
function stamp(text, x, y, font, color, t, t0, { light = true, d = 30, align = "left", dur = 0.34 } = {}) {
  const p = prog(t, t0, dur);
  if (p <= 0) return;
  const off = d * (1 - eOut(p)), sc = lerp(1.16, 1, eOut(prog(t, t0, 0.16)));
  ctx.save(); ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.translate(x, y); ctx.scale(sc, sc);
  if (off > 0.4) {
    ctx.globalCompositeOperation = light ? "multiply" : "screen";
    ctx.globalAlpha = clamp(p * 5);
    ctx.fillStyle = INK.c; ctx.fillText(text, -off, -off * 0.45);
    ctx.fillStyle = INK.m; ctx.fillText(text, off, off * 0.45);
  }
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = clamp((p - 0.05) * 4);
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* Barrido de tinta con borde de trama: el frente es una fila de puntos
   que decrecen, como una tinta plana que se convierte en semitono. */
function wipe(color, p, dir) {
  if (p <= 0) return;
  const band = 150, s = 30, vert = dir === "up" || dir === "down";
  const L = vert ? H : W, C = vert ? W : H;
  const a = -band + p * (L + 2 * band);            // posición del frente desde el origen
  ctx.save(); ctx.fillStyle = color;
  const rect = (a0, a1) => {
    const lo = Math.max(0, a0), hi = Math.min(L, a1); if (hi <= lo) return;
    if (dir === "left") ctx.fillRect(lo, 0, hi - lo, H);
    else if (dir === "right") ctx.fillRect(W - hi, 0, hi - lo, H);
    else if (dir === "down") ctx.fillRect(0, lo, W, hi - lo);
    else ctx.fillRect(0, H - hi, W, hi - lo);
  };
  rect(-1, a);
  ctx.beginPath();
  for (let k = 0; k * s < band; k++) {
    const d = k * s + s / 2, r = s * 0.74 * (1 - d / band);
    const at = a + d; if (at < -s || at > L + s) continue;
    for (let c = (k % 2) * s / 2; c < C + s; c += s) {
      let x, y;
      if (dir === "left") { x = at; y = c; } else if (dir === "right") { x = W - at; y = c; }
      else if (dir === "down") { x = c; y = at; } else { x = c; y = H - at; }
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill(); ctx.restore();
}

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function chip(text, x, y, bg, fg, t, t0, size = 34) {
  const p = prog(t, t0, 0.32); if (p <= 0) return 0;
  ctx.save(); ctx.font = BODY(size, 700); ctx.letterSpacing = "1px";
  const w = ctx.measureText(text).width + size * 1.4, h = size * 1.9, sc = eBack(p);
  ctx.translate(x, y + h / 2); ctx.scale(sc, sc);
  ctx.fillStyle = bg; roundRect(0, -h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = "middle"; ctx.fillText(text, size * 0.7, 2);
  ctx.restore();
  return w;
}

// Réplica mínima del panel del plugin (no es una captura)
function panel(t, lpi, angle, lpiP, angP, knockOn) {
  const p = eOut(prog(t, T.poster + 0.2, 0.4)); if (p <= 0) return;
  const x = 120, w = 840, y = 1262 + (1 - p) * 60, h = 234;
  ctx.save(); ctx.globalAlpha = p;
  ctx.fillStyle = "#18181b"; roundRect(x, y, w, h, 20); ctx.fill();
  ctx.strokeStyle = "#2e2e33"; ctx.lineWidth = 2; ctx.stroke();
  const row = (i, label, value, f) => {
    const ry = y + 50 + i * 68;
    ctx.font = BODY(28, 600); ctx.fillStyle = "#b8b9bf"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(label, x + 32, ry);
    if (f === null) {                                // interruptor
      const on = knockOn, sx = x + w - 32 - 84;
      ctx.fillStyle = on > 0.5 ? INK.c : "#3a3a40"; roundRect(sx, ry - 21, 84, 42, 21); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx + 21 + 42 * eOut(on), ry, 16, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const tx = x + 270, tw = 380;
    ctx.fillStyle = "#34343a"; roundRect(tx, ry - 4, tw, 8, 4); ctx.fill();
    ctx.fillStyle = INK.c; roundRect(tx, ry - 4, tw * f, 8, 4); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(tx + tw * f, ry, 15, 0, Math.PI * 2); ctx.fill();
    ctx.font = BODY(30, 700); ctx.textAlign = "right"; ctx.fillText(value, x + w - 32, ry + 1);
  };
  row(0, "Frecuencia", `${lpi} LPI`, lpiP);
  row(1, "Ángulo", `${angle}°`, angP);
  row(2, "Knockout del negro", "", null);
  ctx.restore();
}

/* ------------------------------------------------------------
   Escena 3D: camiseta negra con la estampa
   Modelo «T-SHIRT 3D Model Free» de Mohammad Rajabloo (CC BY 4.0).
   ------------------------------------------------------------ */
const glCanvas = document.createElement("canvas");
let renderer, scene3, cam, rig, printMesh, printMat, chestZ = 0, shirtReady = false;
const printCanvas = document.createElement("canvas");
printCanvas.width = P.w; printCanvas.height = P.h;

async function buildShirt() {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene3 = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
  cam.position.set(0, 0.05, 9.2); cam.lookAt(0, 0.05, 0);
  scene3.add(new THREE.HemisphereLight(0xffffff, 0x2a2a30, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 10); scene3.add(key);
  const rim = new THREE.DirectionalLight(0x6fb6ff, 1.6); rim.position.set(-8, 3, -6); scene3.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff4fb0, 0.9); rim2.position.set(8, -2, -5); scene3.add(rim2);
  rig = new THREE.Group(); scene3.add(rig);

  const g = await new GLTFLoader().loadAsync("../../site/assets/shirt.glb");
  const model = g.scene;
  model.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }); });
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const s = 2.75 / size.y;
  model.position.copy(mid).multiplyScalar(-s); model.scale.setScalar(s);
  rig.add(model); rig.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(0, 0.3, 10), new THREE.Vector3(0, 0, -1)).intersectObject(model, true)[0];
  chestZ = hit ? hit.point.z : 0.3;

  // Estampa: la versión con knockout, fondo transparente
  dots(printCanvas.getContext("2d"), 0, 0, { cell: 24, angle: 33, thr: 0.2 });
  const tex = new THREE.CanvasTexture(printCanvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pw = size.x * s * 0.3;
  printMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  printMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw * P.h / P.w), printMat);
  printMesh.position.set(0, 0.35, chestZ + 0.04);
  rig.add(printMesh);
  shirtReady = true;
}
const tmpV = new THREE.Vector3();
function drawShirt(t) {
  if (!shirtReady) return null;
  const p0 = eOut(prog(t, T.wipePaper + 0.05, 0.5));
  rig.position.y = -0.62 - (1 - p0) * 1.4;
  rig.rotation.y = lerp(-0.55, 0.32, eIO(prog(t, T.wipePaper, 2.8)));
  rig.rotation.x = 0.05;
  const pf = prog(t, T.print, T.land - T.print), squash = 1 + 0.05 * Math.sin(Math.PI * prog(t, T.land, 0.18));
  printMesh.visible = pf > 0;
  printMesh.position.z = chestZ + 0.04 + 3.2 * (1 - eIn(pf));
  printMesh.scale.setScalar(lerp(1.9, 1, eIn(pf)) * squash);
  printMat.opacity = clamp(pf * 2.5);
  renderer.render(scene3, cam);
  ctx.drawImage(glCanvas, 0, 0);
  printMesh.getWorldPosition(tmpV).project(cam);
  return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H };
}

/* ------------------------------------------------------------
   Escenas
   ------------------------------------------------------------ */
const HOOK = ["¿Sigues", "pagando", "licencias", "para hacer", "semitonos", "DTF?"];
let hookSize = 150;
function layout() {
  ctx.font = DISPLAY(100);
  const wmax = Math.max(...HOOK.map((s) => ctx.measureText(s).width));
  hookSize = Math.floor(100 * 880 / wmax);
}

function sceneHook(t) {
  paper(false); cropMarks(INK.k); slug("OPEN-DTF · HOJA DE PRUEBAS · 01", INK.gray);
  const push = lerp(1, 1.045, prog(t, 0, 2.6));
  ctx.save(); ctx.translate(W / 2, 800); ctx.scale(push, push); ctx.translate(-W / 2, -800);
  const fs = hookSize, lh = fs * 0.96, y0 = 330 + fs * 0.8;
  ctx.font = DISPLAY(fs); ctx.letterSpacing = "-2px";
  // Marca amarilla bajo «DTF?»
  const hp = eOut(prog(t, T.highlight, 0.22));
  if (hp > 0) {
    const w = ctx.measureText(HOOK[5]).width;
    ctx.fillStyle = INK.y; ctx.fillRect(80 - 14, y0 + 5 * lh - fs * 0.72, (w + 28) * hp, fs * 0.86);
  }
  HOOK.forEach((s, i) => stamp(s, 80, y0 + i * lh, DISPLAY(fs), INK.k, t, T.hookWords[i]));
  // Tachado de «pagando»
  const sp = eOut(prog(t, T.strike, 0.2));
  if (sp > 0) {
    ctx.font = DISPLAY(fs); const w = ctx.measureText(HOOK[1]).width;
    ctx.fillStyle = INK.m; ctx.save(); ctx.translate(70, y0 + lh - fs * 0.3); ctx.rotate(-0.035);
    ctx.fillRect(0, -fs * 0.06, (w + 22) * sp, fs * 0.12); ctx.restore();
  }
  ctx.restore();
}

function sceneAlt(t) {
  paper(true); cropMarks("#3a3a3e"); slug("OPEN-DTF · HOJA DE PRUEBAS · 02", "#8a8b90");
  stamp("Hay una", 80, 760, DISPLAY(150), "#fff", t, T.alt[0], { light: false });
  stamp("alternativa", 80, 910, DISPLAY(150), "#fff", t, T.alt[1], { light: false });
  stamp("libre.", 70, 1190, SERIF(330), INK.y, t, T.alt[2], { light: false, d: 40 });
  const p = prog(t, T.alt[2] + 0.2, 0.3);
  if (p > 0) {
    ctx.save(); ctx.globalAlpha = p; ctx.font = BODY(40, 600); ctx.fillStyle = "#c9cacf";
    ctx.fillText("Plugin de Photoshop · código abierto", 84, 1290); ctx.restore();
  }
}

function sceneHalftone(t) {
  paper(true); cropMarks("#3a3a3e"); slug("OPEN-DTF · PRUEBA DE TRAMA", "#8a8b90");
  const push = lerp(1, 1.035, prog(t, T.knock, 1.25));
  ctx.save(); ctx.translate(W / 2, 780); ctx.scale(push, push); ctx.translate(-W / 2, -780);

  const enter = eOut(prog(t, T.poster, 0.45));
  const scanP = eIO(prog(t, T.scan, 1.0));
  const tuneP = eIO(prog(t, T.tune, 1.0));
  const cell = lerp(10, 24, tuneP), angle = lerp(0, 33, tuneP);
  const lpi = Math.round(720 / cell), ang = Math.round(angle);
  const knockOn = eOut(prog(t, T.knock, 0.18));
  const reveal = eOut(prog(t, T.knock + 0.05, 0.55));
  const thr = 0.2 * eOut(prog(t, T.knock + 0.08, 0.6));

  // Marco y marcas de corte del póster
  ctx.save();
  ctx.strokeStyle = "#5a5a60"; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[P.x, P.y, -1, -1], [P.x + P.w, P.y, 1, -1], [P.x, P.y + P.h, -1, 1], [P.x + P.w, P.y + P.h, 1, 1]]) {
    ctx.beginPath(); ctx.moveTo(x + sx * 12, y); ctx.lineTo(x + sx * 44, y); ctx.moveTo(x, y + sy * 12); ctx.lineTo(x, y + sy * 44); ctx.stroke();
  }
  ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h * enter); ctx.clip();
  // Fondo: negro de la ilustración → transparencia (cuadrícula) con el knockout
  ctx.fillStyle = "#000"; ctx.fillRect(P.x, P.y, P.w, P.h);
  if (reveal > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(P.x + P.w / 2, P.y + P.h * 0.56, reveal * 700, 0, Math.PI * 2); ctx.clip();
    for (let y = 0; y < P.h; y += 30) for (let x = 0; x < P.w; x += 30) {
      ctx.fillStyle = ((x + y) / 30) % 2 ? "#d7d8db" : "#f2f2f4"; ctx.fillRect(P.x + x, P.y + y, 30, 30);
    }
    ctx.restore();
  }
  const scanY = scanP * (P.h + 20) - 10;
  if (scanP < 1) {                                   // tono continuo por debajo de la línea
    ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y + Math.max(0, scanY), P.w, P.h); ctx.clip();
    ctx.drawImage(tone, P.x, P.y); ctx.restore();
  }
  if (scanP > 0) dots(ctx, P.x, P.y, { cell, angle, thr, maxY: scanY });
  if (enter < 1 || (scanP > 0 && scanP < 1)) {       // línea de lectura cian
    const ly = enter < 1 ? P.y + P.h * enter : P.y + scanY;
    ctx.fillStyle = INK.c; ctx.shadowColor = INK.c; ctx.shadowBlur = 24; ctx.fillRect(P.x - 30, ly - 2, P.w + 60, 4);
  }
  ctx.restore();

  // Rótulos
  ctx.restore();
  // Rótulo de cada paso, en el mismo sitio (uno sustituye al anterior)
  if (t >= T.knock + 0.05) chip("3 · Knockout del negro", 80, 206, INK.m, "#fff", t, T.knock + 0.05, 40);
  else if (t >= T.tune) chip(`2 · ${lpi} LPI · ${ang}°`, 80, 206, INK.y, INK.k, t, T.tune, 40);
  else chip("1 · Semitono nativo", 80, 206, INK.c, INK.k, t, T.scan, 40);
  panel(t, lpi, ang, lerp(0.86, 0.28, tuneP), angle / 90, knockOn);
}

function sceneTee(t) {
  paper(false); cropMarks(INK.k); slug("OPEN-DTF · PRUEBA SOBRE PRENDA", INK.gray);
  const at = drawShirt(t);
  // Salpicadura de tinta al asentarse la estampa
  const bp = prog(t, T.land, 0.55);
  if (at && bp > 0 && bp < 1) {
    for (let i = 0; i < 26; i++) {
      const a = hash(i, 3) * Math.PI * 2, dist = (160 + hash(i, 7) * 260) * eOut(bp), r = (8 + hash(i, 11) * 18) * (1 - bp);
      ctx.fillStyle = [INK.c, INK.m, INK.y][i % 3];
      ctx.beginPath(); ctx.arc(at.x + Math.cos(a) * dist, at.y + Math.sin(a) * dist * 0.9, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  stamp("Listo para", 80, 330, DISPLAY(124), INK.k, t, T.teeCap[0]);
  stamp("película DTF", 80, 456, DISPLAY(124), INK.k, t, T.teeCap[1]);
  const p = prog(t, T.teeCap[2], 0.3);
  if (p > 0) {
    ctx.save(); ctx.globalAlpha = p; ctx.font = BODY(38, 600); ctx.fillStyle = "#3b3c40";
    ctx.fillText("Una capa transparente a 300 ppi", 84, 540 + (1 - eOut(p)) * 16); ctx.restore();
  }
}

// Fondo de trama decorativo para los campos de tinta
function fieldTexture(color, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  const a = 33 * Math.PI / 180, s = 46; ctx.translate(W, H * 0.62); ctx.rotate(a);
  ctx.beginPath();
  for (let y = -1400; y < 1400; y += s) for (let x = -1600; x < 200; x += s) {
    const f = clamp(1 + x / 1300), r = s * 0.62 * f * f; if (r < 1) continue;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.restore();
}
function fitSize(text, font, w, ref = 100) { ctx.font = font(ref); return Math.floor(ref * w / ctx.measureText(text).width); }

function sceneFields(t) {
  const [f1, f2, f3] = T.fields;
  // Amarillo
  ctx.fillStyle = INK.y; ctx.fillRect(0, 0, W, H); fieldTexture(INK.k, 0.07);
  cropMarks(INK.k); slug("PLANCHA Y", INK.k);
  const g = fitSize("GRATIS", DISPLAY, 900);
  stamp("GRATIS", 80, 860, DISPLAY(g), INK.k, t, f1 + 0.12);
  const p1 = prog(t, f1 + 0.3, 0.3);
  if (p1 > 0) { ctx.save(); ctx.globalAlpha = p1; ctx.font = BODY(48, 600); ctx.fillStyle = INK.k; ctx.fillText("Sin licencias ni suscripciones", 86, 960); ctx.restore(); }
  // Cian
  if (t >= f2 - 0.3) {
    wipe(INK.c, eIO(prog(t, f2 - 0.2, 0.3)), "right");
    if (t >= f2 + 0.1) {
      fieldTexture(INK.k, 0.08); cropMarks(INK.k); slug("PLANCHA C", INK.k);
      const s = fitSize("abierto", DISPLAY, 820);
      stamp("Código", 80, 760, DISPLAY(s), INK.k, t, f2 + 0.1);
      stamp("abierto", 80, 760 + s * 0.95, DISPLAY(s), INK.k, t, f2 + 0.2);
      chip("Licencia MIT", 84, 820 + s, INK.k, "#fff", t, f2 + 0.35, 40);
    }
  }
  // Magenta
  if (t >= f3 - 0.3) {
    wipe(INK.m, eIO(prog(t, f3 - 0.2, 0.3)), "up");
    if (t >= f3 + 0.1) {
      fieldTexture("#5a0035", 0.18); cropMarks("#fff"); slug("PLANCHA M", "#fff");
      const s = fitSize("Photoshop", DISPLAY, 900);
      stamp("Photoshop", 80, 760, DISPLAY(s), "#fff", t, f3 + 0.1, { light: false });
      stamp("2022+", 70, 760 + s * 1.45, SERIF(s * 1.6), "#fff", t, f3 + 0.22, { light: false });
      const p = prog(t, f3 + 0.4, 0.3);
      if (p > 0) { ctx.save(); ctx.globalAlpha = p; ctx.font = BODY(44, 600); ctx.fillStyle = "#fff"; ctx.fillText("Panel UXP · funciona sin conexión", 86, 760 + s * 1.95); ctx.restore(); }
    }
  }
}

function sceneEnd(t) {
  paper(false); cropMarks(INK.k); slug("OPEN-DTF · PLIEGO FINAL", INK.gray);
  // Marca: tres puntos que crecen (C, M, Y)
  const cx = W / 2, by = 720, sizes = [44, 78, 112], cols = [INK.c, INK.m, INK.y];
  let x = cx - (sizes.reduce((a, b) => a + b, 0) + 2 * 22) / 2;
  sizes.forEach((d, i) => {
    const p = prog(t, T.dots[i], 0.36), sc = p > 0 ? eBack(p) : 0, r = d / 2;
    if (sc > 0) {
      ctx.beginPath(); ctx.arc(x + r, by - r, r * sc, 0, Math.PI * 2); ctx.fillStyle = cols[i]; ctx.fill();
      if (i === 2) { ctx.lineWidth = 4; ctx.strokeStyle = INK.k; ctx.stroke(); }
    }
    x += d + 22;
  });
  // Logotipo: «Open» en serif itálica + «-DTF»
  const wp = prog(t, T.word, 0.34);
  if (wp > 0) {
    ctx.save(); ctx.font = SERIF(230); const w1 = ctx.measureText("Open").width;
    ctx.font = DISPLAY(190, 700); ctx.letterSpacing = "-4px"; const w2 = ctx.measureText("-DTF").width; ctx.restore();
    const x0 = cx - (w1 + w2) / 2;
    stamp("Open", x0, 960, SERIF(230), INK.k, t, T.word);
    ctx.save(); ctx.letterSpacing = "-4px"; stamp("-DTF", x0 + w1, 960, DISPLAY(190, 700), INK.k, t, T.word + 0.04); ctx.restore();
  }
  stamp("Descárgalo gratis", cx, 1170, DISPLAY(fitSize("Descárgalo gratis", DISPLAY, 900)), INK.k, t, T.cta, { align: "center" });
  // «link en la bio» en una píldora magenta, con un leve latido al pulso
  const bp = prog(t, T.bio, 0.34);
  if (bp > 0) {
    const beat = 1 + 0.03 * Math.pow(Math.max(0, Math.cos(Math.PI * 2 * (t - T.bio) / 0.5)), 8) * (t > T.bio + 0.4 ? 1 : 0);
    ctx.save(); ctx.font = BODY(54, 700); const w = ctx.measureText("link en la bio").width + 96, h = 104;
    ctx.translate(cx, 1236 + h / 2); ctx.scale(eBack(bp) * beat, eBack(bp) * beat);
    ctx.fillStyle = INK.m; roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("link en la bio", 0, 3);
    ctx.restore();
  }
  // Barra de control de color
  const cp = eOut(prog(t, T.end + 0.3, 0.5));
  const swatches = [INK.c, INK.m, INK.y, INK.k, "#7fd6f7", "#f57fc5", "#fff27f", "#858586", "#00aeef", "#ec008c", "#ffe600", "#0b0b0c"];
  swatches.forEach((c, i) => {
    if (i / swatches.length > cp) return;
    ctx.fillStyle = c; ctx.fillRect(80 + i * 76.6, 1440, 70, 30);
  });
  const lp = prog(t, T.bio + 0.25, 0.3);
  if (lp > 0) {
    ctx.save(); ctx.globalAlpha = lp; ctx.font = BODY(26, 600); ctx.fillStyle = INK.gray; ctx.textAlign = "center";
    ctx.fillText("Licencia MIT · Photoshop 2022 o posterior", cx, 1404); ctx.restore();
  }
}

/* ------------------------------------------------------------
   Montaje
   ------------------------------------------------------------ */
export function draw(t) {
  ctx.save(); ctx.letterSpacing = "0px";
  if (t < T.wipeK + 0.35) sceneHook(t);
  if (t >= T.wipeK && t < T.poster) {
    if (t < T.wipeK + 0.35) wipe(INK.k, eIO(prog(t, T.wipeK, 0.32)), "up");
    else sceneAlt(t);
  }
  if (t >= T.poster && t < T.wipePaper + 0.32) sceneHalftone(t);
  if (t >= T.wipePaper && t < T.fields[0] - 0.05) {
    if (t < T.wipePaper + 0.32) wipe(INK.paper, eIO(prog(t, T.wipePaper, 0.3)), "up");
    else sceneTee(t);
  }
  if (t >= T.fields[0] - 0.3 && t < T.end + 0.3) {
    if (t < T.fields[0] - 0.05) { sceneTee(t); wipe(INK.y, eIO(prog(t, T.fields[0] - 0.3, 0.26)), "left"); }
    else sceneFields(t);
  }
  if (t >= T.end) {
    if (t < T.end + 0.3) wipe(INK.paper, eIO(prog(t, T.end, 0.28)), "down");
    else sceneEnd(t);
  }
  ctx.restore();
}

const ready = (async () => {
  await Promise.all([
    document.fonts.load(DISPLAY(100)), document.fonts.load(DISPLAY(100, 700)),
    document.fonts.load(BODY(30, 600)), document.fonts.load(BODY(30, 700)), document.fonts.load(SERIF(100)),
  ]);
  buildArt(); layout();
  try { await buildShirt(); } catch (e) { console.error("camiseta:", e); }
})();

window.promo = { ready, FPS, DURATION, frame: (i) => draw(i / FPS) };

// Vista previa en el navegador (sin ?render): reproduce en bucle con el audio si existe
if (!new URLSearchParams(location.search).has("render")) {
  document.body.classList.add("preview");
  const audio = new Audio("build/audio.wav");
  let start = null, paused = true, at = 0;
  cv.addEventListener("click", () => {
    paused = !paused;
    if (!paused) { start = performance.now() - at * 1000; audio.currentTime = at; audio.play().catch(() => {}); }
    else audio.pause();
  });
  ready.then(() => {
    draw(0);
    const loop = (now) => {
      if (!paused) {
        at = (now - start) / 1000;
        if (at >= DURATION) { at = 0; start = now; audio.currentTime = 0; audio.play().catch(() => {}); }
        draw(at);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
