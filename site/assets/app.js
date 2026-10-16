import * as THREE from "three";

const REPO = "eguiajosue/halftones-dtf";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ============================================================
   UI: navegación, pasos y descarga
   ============================================================ */
const nav = $(".nav");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

const steps = $$(".step");
const io = new IntersectionObserver((entries) => {
  for (const e of entries) e.target.classList.toggle("on", e.isIntersecting);
}, { rootMargin: "-35% 0px -35% 0px" });
steps.forEach((s) => io.observe(s));

// Versión publicada (si existe) desde la API pública de GitHub
let release = null;
async function loadRelease() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(String(r.status));
    release = await r.json();
  } catch (e) {
    release = false;
  }
  renderRelease();
}
function renderRelease() {
  const btn = $("#dlButton");
  if (release) {
    const assets = release.assets || [];
    const stable = assets.find((a) => a.name === "OpenDTF.ccx") || assets.find((a) => /\.ccx$/i.test(a.name));
    if (stable) btn.href = stable.browser_download_url;
    $("#dlVersion").textContent = release.tag_name;
    const d = new Date(release.published_at);
    $("#dlDate").textContent = d.toLocaleDateString(document.documentElement.lang, { year: "numeric", month: "long", day: "numeric" });
    $("#dlNone").classList.add("hidden");
  } else if (release === false) {
    btn.href = `https://github.com/${REPO}#desarrollo`;
    $("#dlNone").classList.remove("hidden");
  }
}
addEventListener("langchange", renderRelease);
loadRelease();

/* ============================================================
   Ilustración procedural (sin imágenes de terceros):
   sol retro con franjas y dos cordilleras sobre negro
   ============================================================ */
const W = 8, H = 10;               // póster 4:5 en unidades de escena
function art(u, v, o) {
  let r = 0, g = 0, b = 0;
  const cx = 0.5, cy = 0.6, R = 0.27;
  const dx = (u - cx) * (W / H), dy = v - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= R) {
    const t = (v - (cy - R)) / (2 * R);                     // 0 abajo · 1 arriba
    r = 1; g = 0.22 + 0.62 * t; b = 0.42 - 0.2 * t;
    if (v < cy) {                                           // franjas del sol
      const k = (cy - v) / R, period = 0.052, gap = 0.008 + 0.03 * k;
      if ((cy - v) % period < gap) { r = g = b = 0; }
    }
  } else {
    const glow = Math.max(0, 1 - (d - R) / 0.24);           // halo: transición hacia el negro
    const gl = glow * glow * 0.6;
    r = gl; g = 0.32 * gl; b = 0.3 * gl;
  }
  const h1 = 0.36 - Math.abs(u - 0.3) * 0.62;               // cordillera trasera
  const h2 = 0.25 - Math.abs(u - 0.74) * 0.5;               // cordillera delantera
  if (v < h1) { const t = v / Math.max(0.01, h1); r = 0.1 + 0.08 * t; g = 0.3 + 0.48 * t; b = 0.85 + 0.1 * t; }
  if (v < h2) { const t = v / Math.max(0.01, h2); r = 0.35 + 0.53 * t; g = 0.08 + 0.15 * t; b = 0.66 + 0.34 * t; }
  const fade = Math.min(1, v / 0.09);                       // base que se funde con el negro
  o.r = r * fade; o.g = g * fade; o.b = b * fade;
  return o;
}

/* ============================================================
   Escena
   ============================================================ */
const canvas = $("#scene");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  document.documentElement.classList.add("no-webgl");
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 22);

  const poster = new THREE.Group();
  scene.add(poster);

  // Puntos de la trama
  const MAX = 8200;
  const geo = new THREE.CircleGeometry(0.5, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  const dots = new THREE.InstancedMesh(geo, mat, MAX);
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  dots.instanceColor.setUsage(THREE.DynamicDrawUsage);
  dots.frustumCulled = false;
  poster.add(dots);

  // Marco del documento (pasos 1-2)
  const frameGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-W / 2, -H / 2, 0), new THREE.Vector3(W / 2, -H / 2, 0),
    new THREE.Vector3(W / 2, H / 2, 0), new THREE.Vector3(-W / 2, H / 2, 0), new THREE.Vector3(-W / 2, -H / 2, 0)]);
  const frameMat = new THREE.LineBasicMaterial({ color: 0x8a877f, transparent: true, opacity: 0 });
  const frameLine = new THREE.Line(frameGeo, frameMat);
  poster.add(frameLine);

  // Camiseta (paso 5): silueta propia
  const tee = new THREE.Shape();
  const P = [[-3.4, 6.2], [-1.6, 6.9], [-0.9, 6.3], [0, 6.0], [0.9, 6.3], [1.6, 6.9], [3.4, 6.2], [6.6, 4.0], [5.4, 1.7], [3.9, 2.6],
             [3.9, -8.4], [-3.9, -8.4], [-3.9, 2.6], [-5.4, 1.7], [-6.6, 4.0]];
  tee.moveTo(P[0][0], P[0][1]); P.slice(1).forEach(([x, y]) => tee.lineTo(x, y)); tee.lineTo(P[0][0], P[0][1]);
  const teeGroup = new THREE.Group();
  const teeMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1e, transparent: true, opacity: 0 });
  const teeLineMat = new THREE.LineBasicMaterial({ color: 0x55545a, transparent: true, opacity: 0 });
  teeGroup.add(new THREE.Mesh(new THREE.ShapeGeometry(tee), teeMat));
  teeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tee.getPoints()), teeLineMat));
  teeGroup.position.set(0, -0.6, -1.2);
  teeGroup.scale.setScalar(1.55);
  poster.add(teeGroup);

  // Controles de la demo
  const demo = { lpi: 28, angle: 33, ko: true };
  const lpiIn = $("#demoLpi"), angIn = $("#demoAngle"), koIn = $("#demoKo");
  const syncDemo = () => {
    demo.lpi = +lpiIn.value; demo.angle = +angIn.value; demo.ko = koIn.checked;
    $("#demoLpiOut").textContent = `${demo.lpi} LPI`;
    $("#demoAngleOut").textContent = `${demo.angle}°`;
  };
  [lpiIn, angIn, koIn].forEach((el) => el.addEventListener("input", syncDemo));
  syncDemo();

  /* Fotogramas clave de la historia (p = 0 portada · 1..5 pasos) */
  const K = [
    { tiltX: -0.42, tiltY: 0.5, ht: 1, ko: -1, white: 0.72, depth: 0.9, float: 1, ang: -1, frame: 0, tee: 0, scale: 1 },   // portada
    { tiltX: 0, tiltY: 0, ht: 0, ko: 0, white: 1, depth: 0, float: 0, ang: 0, frame: 1, tee: 0, scale: 1 },               // 1 diseño
    { tiltX: -0.5, tiltY: -0.42, ht: 1, ko: 0, white: 0.9, depth: 1.4, float: 0, ang: -1, frame: 0.6, tee: 0, scale: 1 }, // 2 trama
    { tiltX: -0.2, tiltY: 0.32, ht: 1, ko: 1, white: 0.8, depth: 0.6, float: 0, ang: -1, frame: 0, tee: 0, scale: 0.92 }, // 3 knockout
    { tiltX: -0.1, tiltY: -0.18, ht: 1, ko: 1, white: 0.7, depth: 0.3, float: 0, ang: -1, frame: 0, tee: 0, scale: 0.92 }, // 4 en vivo
    { tiltX: 0, tiltY: 0, ht: 1, ko: 1, white: 0.68, depth: 0, float: 0, ang: -1, frame: 0, tee: 1, scale: 0.5 },         // 5 aplicar
  ];
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function stateAt(p) {
    const i = Math.min(K.length - 2, Math.floor(p)), t = ease(Math.min(1, Math.max(0, p - i)));
    const a = K[i], b = K[i + 1], s = {};
    for (const k in a) {
      let va = a[k], vb = b[k];
      if (k === "ang") { va = va < 0 ? demo.angle : va; vb = vb < 0 ? demo.angle : vb; }
      if (k === "ko") { va = va < 0 ? (demo.ko ? 1 : 0) : va; vb = vb < 0 ? (demo.ko ? 1 : 0) : vb; }
      s[k] = lerp(va, vb, t);
    }
    return s;
  }

  // Scroll -> p: el centro de la ventana recorre portada y pasos
  const anchors = [$(".hero"), ...steps];
  const storyEnd = () => steps[steps.length - 1].getBoundingClientRect().bottom;
  function scrollP() {
    const vc = innerHeight / 2;
    const c = anchors.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    if (vc <= c[0]) return 0;
    for (let k = 0; k < c.length - 1; k++) if (vc <= c[k + 1]) return k + (vc - c[k]) / (c[k + 1] - c[k]);
    return c.length - 1;
  }

  // Encaje según el ancho: póster a la derecha en escritorio, arriba y más pequeño en móvil
  let wide = true, visH = 1, visW = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visW = visH * camera.aspect;
    wide = camera.aspect > 1.1;
  }
  addEventListener("resize", resize);
  resize();

  const pointer = { x: 0, y: 0 };
  if (!reduceMotion) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const col = { r: 0, g: 0, b: 0 }, ccol = new THREE.Color();
  const miniWhite = $("#miniWhite"), miniWhiteVal = $("#miniWhiteVal");
  let pS = scrollP(), last = performance.now(), time = 0, smX = 0, smY = 0;

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    if (storyEnd() < -innerHeight * 0.2) { canvas.style.visibility = "hidden"; return; }  // tapado por secciones sólidas
    canvas.style.visibility = "visible";
    if (!reduceMotion) time += dt;

    pS += (scrollP() - pS) * Math.min(1, dt * 5);
    const s = stateAt(pS);

    // Paso 4: los niveles se mueven solos para mostrar el ajuste en vivo
    const w4 = Math.max(0, 1 - Math.abs(pS - 4));
    const white = lerp(s.white, reduceMotion ? 0.62 : 0.6 + 0.3 * Math.sin(time * 1.3), w4);
    if (w4 > 0.05) {
      const v = Math.round(white * 255);
      miniWhite.style.left = `${(white * 100).toFixed(1)}%`;
      miniWhiteVal.textContent = v;
    }

    // Composición
    const baseScale = (wide ? Math.min(0.9, (visH * 0.78) / H) : Math.min(0.62, (visW * 0.86) / W)) * s.scale;
    poster.scale.setScalar(baseScale);
    const tx = wide ? visW * 0.2 : 0, ty = wide ? 0 : visH * 0.16;
    poster.position.set(tx, ty + (1 - s.scale) * 1.4 * (s.tee), 0);
    smX += (pointer.x - smX) * Math.min(1, dt * 3); smY += (pointer.y - smY) * Math.min(1, dt * 3);
    poster.rotation.set(s.tiltX + smY * 0.12, s.tiltY + smX * 0.18, 0);
    // En pantallas estrechas la trama de portada queda detrás del texto: se atenúa para que se lea
    mat.opacity = wide ? 1 : lerp(0.3, 1, Math.min(1, Math.max(0, pS)));
    frameMat.opacity = s.frame * 0.9;
    teeMat.opacity = s.tee; teeLineMat.opacity = s.tee * 0.9;

    // Trama: rejilla rotada al ángulo, recortada al póster
    const rows = Math.round(demo.lpi * 1.1);
    const sp = H / rows;
    const D = Math.sqrt(W * W + H * H);
    const side = Math.min(Math.floor(Math.sqrt(MAX)), Math.ceil(D / sp) + 2);
    const n = side * side;
    const a = THREE.MathUtils.degToRad(s.ang), ca = Math.cos(a), sa = Math.sin(a);
    const fullD = sp * 1.42, black = 0.02, gammaInv = 1 / 1.25;
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const gx = ((i % side) - side / 2 + 0.5) * sp, gy = (Math.floor(i / side) - side / 2 + 0.5) * sp;
      const x = gx * ca - gy * sa, y = gx * sa + gy * ca;
      if (x < -W / 2 || x > W / 2 || y < -H / 2 || y > H / 2) continue;
      art(x / W + 0.5, y / H + 0.5, col);
      const L = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
      const mx = Math.max(col.r, col.g, col.b);
      let cov = Math.min(1, Math.max(0, (L - black) / Math.max(0.05, white - black)));
      cov = Math.pow(cov, gammaInv);
      // Tamaño: tono continuo (píxel) -> punto de semitono de área proporcional
      const htD = sp * 1.13 * Math.sqrt(cov);
      let d = lerp(fullD, htD, s.ht);
      // Knockout: lo cercano al negro cae y desaparece
      const keep = Math.min(1, cov * 6);
      d *= lerp(1, keep, s.ko);
      let z = cov * s.depth * 1.6 - (1 - keep) * s.ko * 3.2;
      if (s.float > 0.001) z += Math.sin(x * 0.55 + time * 0.9) * Math.cos(y * 0.45 + time * 0.7) * 0.45 * s.float;
      if (d < 0.004) continue;
      // Color: en tono continuo el real; en trama, la tinta pura (saturada)
      const inkK = mx > 0.001 ? 1 / mx : 0;
      const kk = lerp(1, inkK, s.ht * 0.85);
      ccol.setRGB(Math.min(1, col.r * kk), Math.min(1, col.g * kk), Math.min(1, col.b * kk));
      if (mx < 0.02) ccol.setRGB(0.07, 0.07, 0.075);   // negro: apenas visible sobre la prenda
      pos.set(x, y, z);
      scl.set(d, d, 1);
      m4.compose(pos, q, scl);
      dots.setMatrixAt(shown, m4);
      dots.setColorAt(shown, ccol);
      shown++;
    }
    dots.count = shown;
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor.needsUpdate = true;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
