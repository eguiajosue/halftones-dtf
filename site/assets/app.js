import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

// La historia se imprime sobre la plancha negra (K): el fondo de la página cambia cuando ocupa la pantalla
const story = $(".story");
new IntersectionObserver((entries) => {
  for (const e of entries) document.body.classList.toggle("dark", e.isIntersecting);
}, { rootMargin: "-50% 0px -50% 0px" }).observe(story);

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
   Ilustración procedural (propia, sin recursos de terceros):
   atardecer retro: cielo degradado con estrellas, sol con franjas,
   dos cordilleras con luz de borde y lago con el reflejo del sol.
   Todo lo que tiende al negro se elimina con el knockout.
   ============================================================ */
const W = 8, H = 10;               // póster 4:5 en unidades de escena
const HZ = 0.34;                   // línea del horizonte (v)
const hash = (x, y) => { const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return t - Math.floor(t); };
// Perfil de montaña: picos triangulares con una ligera irregularidad
function ridge(u, peaks, jitter) {
  let h = 0;
  for (const [pu, ph, slope] of peaks) h = Math.max(h, ph - Math.abs(u - pu) * slope);
  return h + jitter * (Math.sin(u * 61) * 0.5 + Math.sin(u * 137 + 1.3) * 0.3);
}
const BACK = [[0.12, 0.2, 0.9], [0.4, 0.15, 1.1], [0.82, 0.24, 0.95]];
const FRONT = [[0.26, 0.1, 1.0], [0.64, 0.13, 1.15], [0.96, 0.08, 0.9]];
const SUN = { cx: 0.5, cy: 0.56, R: 0.23 };
function sunColor(t, o) {          // t: 0 abajo (magenta) · 1 arriba (amarillo)
  o.r = 1; o.g = 0.14 + 0.78 * t; o.b = 0.5 - 0.42 * t; return o;
}
function art(u, v, o) {
  if (v >= HZ) {
    // Cielo: negro arriba, violeta y magenta hacia el horizonte
    const t = Math.pow(1 - (v - HZ) / (1 - HZ), 2.4);
    o.r = 0.62 * t; o.g = 0.05 * t + 0.02 * t * t; o.b = 0.5 * t;
    // Estrellas en la parte alta
    const cs = 0.032, ix = Math.floor(u / cs), iy = Math.floor(v / cs);
    if (v > 0.62 && hash(ix, iy) > 0.94) {
      const sx = u / cs - ix - 0.5, sy = v / cs - iy - 0.5;
      if (sx * sx + sy * sy < 0.06) { o.r = o.g = o.b = 0.95; }
    }
    // Sol con halo y franjas que se ensanchan hacia abajo
    const dx = (u - SUN.cx) * (W / H), dy = v - SUN.cy, d = Math.hypot(dx, dy);
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
    // Cordillera trasera (violeta) con luz de borde rosada
    const hb = HZ + ridge(u, BACK, 0.006);
    if (v < hb) {
      const t2 = (v - HZ) / Math.max(0.001, hb - HZ), rim = Math.max(0, 1 - (hb - v) / 0.018);
      o.r = 0.2 + 0.18 * t2 + 0.6 * rim; o.g = 0.1 + 0.08 * t2 + 0.25 * rim; o.b = 0.55 + 0.25 * t2 + 0.2 * rim;
    }
    // Cordillera delantera (azul profundo) con luz de borde cian
    const hf = HZ + ridge(u, FRONT, 0.004);
    if (v < hf) {
      const t3 = (v - HZ) / Math.max(0.001, hf - HZ), rim = Math.max(0, 1 - (hf - v) / 0.014);
      o.r = 0.03 + 0.05 * t3; o.g = 0.18 + 0.2 * t3 + 0.6 * rim; o.b = 0.42 + 0.25 * t3 + 0.5 * rim;
    }
    // Línea de horizonte encendida
    if (v - HZ < 0.006) { o.r = Math.max(o.r, 1); o.g = Math.max(o.g, 0.35); o.b = Math.max(o.b, 0.6); }
    return o;
  }
  // Lago: reflejo del sol en bandas onduladas que se estrechan con la profundidad
  const depth = (HZ - v) / HZ;                       // 0 en el horizonte · 1 abajo
  o.r = o.g = o.b = 0;
  const half = (SUN.R * 0.95) * (1 - depth * 0.55);
  const wave = Math.sin((HZ - v) * 150 + Math.sin(u * 24) * 1.2);
  if (Math.abs((u - SUN.cx) * (W / H)) < half * (0.75 + 0.25 * Math.sin(v * 90)) && wave > -0.15 + depth * 0.9) {
    sunColor(Math.max(0, 0.45 - depth * 0.45), o);
    const f = (1 - depth) * 0.95;
    o.r *= f; o.g *= f; o.b *= f;
  } else if (wave > 0.85) {                           // brillos sueltos en el agua
    const f = (1 - depth) * 0.35; o.r = 0.7 * f; o.g = 0.2 * f; o.b = 0.6 * f;
  }
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
  const MAX = 16000;
  // Cada punto es una gota de tinta con algo de grosor; su forma sigue la del plugin
  const INK = 0.06;
  const GEO = {
    ROUND: new THREE.CylinderGeometry(0.5, 0.5, INK, 14).rotateX(Math.PI / 2),
    ELLIPSE: new THREE.CylinderGeometry(0.5, 0.5, INK, 14).rotateX(Math.PI / 2),
    DIAMOND: new THREE.CylinderGeometry(0.5, 0.5, INK, 4).rotateX(Math.PI / 2),
    LINE: new THREE.BoxGeometry(1, 1, INK),
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, transparent: true });
  const dots = new THREE.InstancedMesh(GEO.ROUND, mat, MAX);
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

  // Camiseta 3D: modelo «T-SHIRT 3D Model Free» de Mohammad Rajabloo (CC BY 4.0), simplificado
  // para la web. Crédito visible en el pie de la página. Sustituye a la silueta plana.
  const SHIRT_SCALE = 22;             // unidades del póster por unidad del modelo
  const shirt = new THREE.Group();
  shirt.visible = false;
  poster.add(shirt);
  const shirtMats = [];
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 1.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(4, 6, 10); scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x6fb6ff, 1.4); rimLight.position.set(-8, 3, -6); scene.add(rimLight);
  new GLTFLoader().load("assets/shirt.glb", (g) => {
    const model = g.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: 0x232328, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0 });
      shirtMats.push(o.material);
    });
    model.updateMatrixWorld(true);
    // El pecho se mide con un rayo hacia -z: la estampa queda justo delante de la tela
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 0.06, 3), new THREE.Vector3(0, 0, -1), 0, 10).intersectObject(model, true)[0];
    const chestZ = hit ? hit.point.z : 0.12;
    shirt.scale.setScalar(SHIRT_SCALE);
    shirt.position.set(0, -0.06 * SHIRT_SCALE, -chestZ * SHIRT_SCALE - 0.75);   // la tela queda detrás de la estampa aunque se curve
    shirt.add(model);
  }, undefined, () => { /* sin modelo: la historia sigue solo con la trama */ });

  // Controles de la demo: frecuencia, ángulo, forma del punto y niveles
  const demo = { lpi: 28, angle: 33, shape: "ROUND", black: 5 / 255, white: 184 / 255 };
  const lpiIn = $("#demoLpi"), angIn = $("#demoAngle"), blackIn = $("#demoBlack"), whiteIn = $("#demoWhite");
  const syncDemo = () => {
    demo.lpi = +lpiIn.value; demo.angle = +angIn.value;
    let bk = +blackIn.value, wt = +whiteIn.value;
    if (wt - bk < 20) { if (document.activeElement === blackIn) bk = wt - 20; else wt = bk + 20; blackIn.value = bk; whiteIn.value = wt; }
    demo.black = bk / 255; demo.white = wt / 255;
    $("#demoLpiOut").textContent = `${demo.lpi} LPI`;
    $("#demoAngleOut").textContent = `${demo.angle}°`;
    $("#demoBlackOut").textContent = bk;
    $("#demoWhiteOut").textContent = wt;
  };
  [lpiIn, angIn, blackIn, whiteIn].forEach((el) => el.addEventListener("input", syncDemo));
  $$("#demoShape button").forEach((btn) => btn.addEventListener("click", () => {
    demo.shape = btn.dataset.shape;
    $$("#demoShape button").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
    dots.geometry = GEO[demo.shape];
  }));
  syncDemo();
  // En móvil la trama va atenuada tras el texto; mientras se usan los controles se ve completa
  let demoInView = false;
  new IntersectionObserver((es) => { demoInView = es[0].isIntersecting; }, { threshold: 0.5 }).observe($(".demo"));

  /* Fotogramas clave de la historia (p = 0 portada · 1..5 pasos) */
  const K = [
    { tiltX: -0.2, tiltY: 0.36, ht: 1, ko: 1, black: -1, white: -1, depth: 0.25, float: 0.35, ang: -1, frame: 0, tee: 0, scale: 1 },   // portada
    { tiltX: 0, tiltY: 0, ht: 0, ko: 0, black: 0.02, white: 1, depth: 0, float: 0, ang: 0, frame: 1, tee: 0, scale: 1 },               // 1 diseño
    { tiltX: -0.5, tiltY: -0.42, ht: 1, ko: 0, black: 0.02, white: 0.9, depth: 1.4, float: 0, ang: -1, frame: 0.6, tee: 0, scale: 1 }, // 2 trama
    { tiltX: -0.2, tiltY: 0.32, ht: 1, ko: 1, black: 0.02, white: 0.8, depth: 0.6, float: 0, ang: -1, frame: 0, tee: 1, scale: 0.85 }, // 3 knockout
    { tiltX: -0.1, tiltY: -0.18, ht: 1, ko: 1, black: 0.02, white: 0.7, depth: 0.3, float: 0, ang: -1, frame: 0, tee: 1, scale: 0.85 }, // 4 en vivo
    { tiltX: -0.05, tiltY: 0.3, ht: 1, ko: 1, black: 0.02, white: 0.68, depth: 0, float: 0, ang: -1, frame: 0, tee: 1, scale: 0.6 }, // 5 aplicar
  ];
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function stateAt(p) {
    const i = Math.min(K.length - 2, Math.floor(p)), t = ease(Math.min(1, Math.max(0, p - i)));
    const a = K[i], b = K[i + 1], s = {};
    for (const k in a) {
      let va = a[k], vb = b[k];
      if (k === "ang") { va = va < 0 ? demo.angle : va; vb = vb < 0 ? demo.angle : vb; }
      if (k === "white") { va = va < 0 ? demo.white : va; vb = vb < 0 ? demo.white : vb; }
      if (k === "black") { va = va < 0 ? demo.black : va; vb = vb < 0 ? demo.black : vb; }
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

  const Z_AXIS = new THREE.Vector3(0, 0, 1);
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
    const baseScale = (wide ? Math.min(0.9, (visH * 0.78) / H) : Math.min(0.62, (visW * 0.86) / W)) * s.scale * (wide ? 1 : lerp(1, 0.6, s.tee));
    poster.scale.setScalar(baseScale);
    const tx = wide ? visW * 0.2 : 0, ty = wide ? visH * 0.03 : visH * (0.16 + 0.1 * s.tee);   // en móvil, más arriba para no quedar bajo el texto
    poster.position.set(tx, ty, 0);
    smX += (pointer.x - smX) * Math.min(1, dt * 3); smY += (pointer.y - smY) * Math.min(1, dt * 3);
    poster.rotation.set(s.tiltX + smY * 0.12, s.tiltY + smX * 0.18, 0);
    // En pantallas estrechas la trama de portada queda detrás del texto: se atenúa para que se lea
    mat.opacity = wide ? 1 : (demoInView ? 1 : lerp(0.3, 1, Math.min(1, Math.max(0, pS))));
    frameMat.opacity = s.frame * 0.9;
    shirt.visible = s.tee > 0.01 && shirtMats.length > 0;
    for (const m of shirtMats) { m.opacity = s.tee; m.transparent = s.tee < 0.999; m.depthWrite = s.tee > 0.5; }

    // Trama: rejilla rotada al ángulo, recortada al póster
    const rows = Math.round(demo.lpi * 1.5);
    const sp = H / rows;
    const D = Math.sqrt(W * W + H * H);
    const side = Math.min(Math.floor(Math.sqrt(MAX)), Math.ceil(D / sp) + 2);
    const n = side * side;
    const a = THREE.MathUtils.degToRad(s.ang), ca = Math.cos(a), sa = Math.sin(a);
    const fullD = sp * 1.42, black = s.black, gammaInv = 1 / 1.25;
    const shape = demo.shape;
    q.setFromAxisAngle(Z_AXIS, a + (shape === "DIAMOND" ? Math.PI / 4 : 0));
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
      // Escala según la forma, con la misma cobertura de tinta que el punto redondo
      if (shape === "LINE") {
        const th = lerp(sp * 1.02, sp * cov, s.ht) * lerp(1, keep, s.ko);
        if (th < 0.004) continue;
        scl.set(sp * 1.02, th, 1);
      } else if (shape === "ELLIPSE") scl.set(d * 1.25, d * 0.8, 1);
      else if (shape === "DIAMOND") scl.set(d * 1.253, d * 1.253, 1);
      else scl.set(d, d, 1);
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
