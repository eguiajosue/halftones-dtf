// Escena 3D (Three.js). La carga ui.js con import() dinámico; si algo falla aquí, la página sigue funcionando.
// Render bajo demanda: solo se dibuja cuando algo cambia (scroll, puntero, demo, animación) y nunca fuera de pantalla.
import * as THREE from "three";

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
export function start(ctx) {
  const { demo, reduceMotion } = ctx;
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const canvas = $("#scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
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
  const ROUND = new THREE.CylinderGeometry(0.5, 0.5, INK, 14).rotateX(Math.PI / 2);
  const GEO = {
    ROUND,
    ELLIPSE: ROUND,                  // la elipse es el punto redondo escalado
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
  // para la web. Crédito visible en el pie de la página. Se descarga cuando la historia se acerca.
  const SHIRT_SCALE = 22;             // unidades del póster por unidad del modelo
  const shirt = new THREE.Group();
  shirt.visible = false;
  poster.add(shirt);
  const shirtMats = [];
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 1.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(4, 6, 10); scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x6fb6ff, 1.4); rimLight.position.set(-8, 3, -6); scene.add(rimLight);
  async function loadShirt() {
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const g = await new GLTFLoader().loadAsync("assets/shirt.glb");
      const model = g.scene;
      model.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material && o.material.dispose) o.material.dispose();
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
      invalidate();
    } catch (e) { /* sin modelo: la historia sigue solo con la trama */ }
  }
  new IntersectionObserver(([e], o) => {
    if (e.isIntersecting) { o.disconnect(); loadShirt(); }
  }, { rootMargin: "100% 0px" }).observe($('[data-story="2"]'));

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
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function stateAt(p) {
    const i = Math.min(K.length - 2, Math.floor(p)), t = ease(clamp01(p - i));
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

  // Scroll -> p: el centro de la ventana recorre portada y pasos.
  // Los centros se miden una vez (en coordenadas de página) y se vuelven a medir solo si cambia el diseño.
  const hero = $(".hero"), story = $(".story");
  const anchors = [hero, ...document.querySelectorAll(".step")];
  let centers = [];
  function measure() {
    const y = scrollY;
    centers = anchors.map((el) => { const r = el.getBoundingClientRect(); return r.top + y + r.height / 2; });
  }
  function scrollP() {
    const vc = scrollY + innerHeight / 2, c = centers;
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
    measure();
    invalidate();
  }
  // Pantallas con otra densidad (mover la ventana de monitor, zoom): se ajusta la resolución
  const watchDpr = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      resize();
      watchDpr();
    }, { once: true });
  };

  /* ---------- Planificación de fotogramas ---------- */
  const AMBIENT_MS = 5000;           // la trama flota y los niveles se mueven solos un rato tras cada interacción
  let raf = 0, idle = true, visible = true, lost = false, last = 0, ambientUntil = performance.now() + AMBIENT_MS;
  function invalidate() {
    if (raf || !visible || lost || document.hidden) return;
    if (idle) { idle = false; last = performance.now(); }
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { ambientUntil = performance.now() + AMBIENT_MS; invalidate(); };
  ctx.invalidate = wake;

  const pointer = { x: 0, y: 0 };
  addEventListener("scroll", wake, { passive: true });
  addEventListener("resize", resize);
  addEventListener("langchange", () => { measure(); invalidate(); });
  if (!reduceMotion) addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; wake(); }, { passive: true });
  document.addEventListener("visibilitychange", wake);
  new ResizeObserver(() => { measure(); invalidate(); }).observe($("main"));

  // Fuera de pantalla (tapado por las secciones sólidas) no se dibuja
  const seen = new Map();
  const vis = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target, e.isIntersecting);
    const v = [...seen.values()].some(Boolean);
    if (v === visible) return;
    visible = v;
    canvas.style.visibility = v ? "" : "hidden";
    if (v) invalidate(); else if (raf) { cancelAnimationFrame(raf); raf = 0; idle = true; }
  }, { rootMargin: "20% 0px 0px 0px" });
  [hero, story].forEach((el) => vis.observe(el));

  // Si la GPU pierde el contexto, se muestra la trama CSS hasta que vuelva
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    if (raf) { cancelAnimationFrame(raf); raf = 0; idle = true; }
    root.classList.add("no-webgl");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    instKey = "";
    root.classList.remove("no-webgl");
    invalidate();
  });

  /* ---------- Muestreo del póster: art() solo se recalcula al cambiar LPI o ángulo ---------- */
  const cell = { x: new Float32Array(MAX), y: new Float32Array(MAX), r: new Float32Array(MAX), g: new Float32Array(MAX),
                 b: new Float32Array(MAX), L: new Float32Array(MAX), mx: new Float32Array(MAX), n: 0, sp: 1, key: "" };
  const col = { r: 0, g: 0, b: 0 };
  function sample(lpi, ang) {
    const key = `${lpi}|${ang}`;
    if (key === cell.key) return;
    const rows = Math.round(lpi * 1.5);
    const sp = H / rows;
    const D = Math.sqrt(W * W + H * H);
    const side = Math.min(Math.floor(Math.sqrt(MAX)), Math.ceil(D / sp) + 2);
    const a = THREE.MathUtils.degToRad(ang), ca = Math.cos(a), sa = Math.sin(a);
    let n = 0;
    for (let i = 0, N = side * side; i < N; i++) {
      const gx = ((i % side) - side / 2 + 0.5) * sp, gy = (Math.floor(i / side) - side / 2 + 0.5) * sp;
      const x = gx * ca - gy * sa, y = gx * sa + gy * ca;
      if (x < -W / 2 || x > W / 2 || y < -H / 2 || y > H / 2) continue;
      art(x / W + 0.5, y / H + 0.5, col);
      cell.x[n] = x; cell.y[n] = y; cell.r[n] = col.r; cell.g[n] = col.g; cell.b[n] = col.b;
      cell.L[n] = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
      cell.mx[n] = Math.max(col.r, col.g, col.b);
      n++;
    }
    cell.n = n; cell.sp = sp; cell.key = key;
  }

  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const ccol = new THREE.Color();
  const miniWhite = $("#miniWhite"), miniWhiteVal = $("#miniWhiteVal");
  let pS = 0, time = 0, smX = 0, smY = 0, opacity = -1, instKey = "", miniLast = -1;

  // Recalcula matrices y colores de los puntos (solo los que se ven) y sube a la GPU únicamente ese tramo
  function layoutDots(s, white) {
    const sp = cell.sp, shape = demo.shape;
    const fullD = sp * 1.42, black = s.black, gammaInv = 1 / 1.25;
    const a = THREE.MathUtils.degToRad(s.ang);
    q.setFromAxisAngle(Z_AXIS, a + (shape === "DIAMOND" ? Math.PI / 4 : 0));
    const floating = s.float > 0.001;
    let shown = 0;
    for (let i = 0; i < cell.n; i++) {
      const x = cell.x[i], y = cell.y[i];
      let cov = clamp01((cell.L[i] - black) / Math.max(0.05, white - black));
      cov = Math.pow(cov, gammaInv);
      // Tamaño: tono continuo (píxel) -> punto de semitono de área proporcional
      const htD = sp * 1.13 * Math.sqrt(cov);
      let d = lerp(fullD, htD, s.ht);
      // Knockout: lo cercano al negro cae y desaparece
      const keep = Math.min(1, cov * 6);
      d *= lerp(1, keep, s.ko);
      let z = cov * s.depth * 1.6 - (1 - keep) * s.ko * 3.2;
      if (floating) z += Math.sin(x * 0.55 + time * 0.9) * Math.cos(y * 0.45 + time * 0.7) * 0.45 * s.float;
      if (d < 0.004) continue;
      // Color: en tono continuo el real; en trama, la tinta pura (saturada)
      const mx = cell.mx[i];
      const inkK = mx > 0.001 ? 1 / mx : 0;
      const kk = lerp(1, inkK, s.ht * 0.85);
      if (mx < 0.02) ccol.setRGB(0.07, 0.07, 0.075);   // negro: apenas visible sobre la prenda
      else ccol.setRGB(Math.min(1, cell.r[i] * kk), Math.min(1, cell.g[i] * kk), Math.min(1, cell.b[i] * kk));
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
    if (shown > 0) {
      dots.instanceMatrix.clearUpdateRanges(); dots.instanceMatrix.addUpdateRange(0, shown * 16);
      dots.instanceColor.clearUpdateRanges(); dots.instanceColor.addUpdateRange(0, shown * 3);
      dots.instanceMatrix.needsUpdate = true;
      dots.instanceColor.needsUpdate = true;
    }
  }

  function frame() {
    raf = 0;
    const now = performance.now(), dtRaw = Math.max(0, now - last) / 1000, dt = Math.min(0.05, dtRaw);
    const dtE = Math.min(0.2, dtRaw);  // los suavizados siguen el tiempo real, también en equipos lentos
    last = now;
    const ambient = !reduceMotion && now < ambientUntil;
    if (ambient) time += dt;

    // Con movimiento reducido el póster salta al estado del scroll, sin interpolar
    const target = scrollP();
    pS = reduceMotion ? target : pS + (target - pS) * Math.min(1, dtE * 5);
    if (Math.abs(target - pS) < 5e-4) pS = target;
    const s = stateAt(pS);

    // Paso 4: los niveles se mueven solos para mostrar el ajuste en vivo
    const w4 = Math.max(0, 1 - Math.abs(pS - 4));
    const white = lerp(s.white, reduceMotion ? 0.62 : 0.6 + 0.3 * Math.sin(time * 1.3), w4);
    if (w4 > 0.05) {
      const v = Math.round(white * 255);
      if (v !== miniLast) {
        miniLast = v;
        miniWhite.style.left = `${(white * 100).toFixed(1)}%`;
        miniWhiteVal.textContent = v;
      }
    }

    // Composición
    const baseScale = (wide ? Math.min(0.9, (visH * 0.78) / H) : Math.min(0.62, (visW * 0.86) / W)) * s.scale * (wide ? 1 : lerp(1, 0.6, s.tee));
    poster.scale.setScalar(baseScale);
    const tx = wide ? visW * 0.2 : 0, ty = wide ? visH * 0.03 : visH * (0.16 + 0.1 * s.tee);   // en móvil, más arriba para no quedar bajo el texto
    poster.position.set(tx, ty, 0);
    const k = reduceMotion ? 1 : Math.min(1, dtE * 3);
    smX += (pointer.x - smX) * k; smY += (pointer.y - smY) * k;
    if (Math.abs(pointer.x - smX) + Math.abs(pointer.y - smY) < 5e-4) { smX = pointer.x; smY = pointer.y; }
    poster.rotation.set(s.tiltX + smY * 0.12, s.tiltY + smX * 0.18, 0);
    // En pantallas estrechas la trama de portada queda detrás del texto: se atenúa para que se lea,
    // y solo se ve completa mientras se usan los controles de la demo
    const opTarget = wide || ctx.active ? 1 : lerp(0.3, 1, clamp01(pS));
    opacity = opacity < 0 || reduceMotion ? opTarget : opacity + (opTarget - opacity) * Math.min(1, dtE * 6);
    if (Math.abs(opTarget - opacity) < 1e-3) opacity = opTarget;
    mat.opacity = opacity;
    frameMat.opacity = s.frame * 0.9;
    shirt.visible = s.tee > 0.01 && shirtMats.length > 0;
    for (const m of shirtMats) { m.opacity = s.tee; m.transparent = s.tee < 0.999; m.depthWrite = s.tee > 0.5; }

    // Trama: rejilla rotada al ángulo, recortada al póster. Solo se recalcula si cambia algo que la afecte.
    if (dots.geometry !== GEO[demo.shape]) dots.geometry = GEO[demo.shape];
    sample(demo.lpi, s.ang);
    const key = [cell.key, demo.shape, s.ht, s.ko, s.depth, s.black, white, s.float > 0.001 ? time + s.float : 0].join("|");
    if (key !== instKey) { instKey = key; layoutDots(s, white); }
    renderer.render(scene, camera);

    // ¿Sigue moviéndose algo? Si no, el bucle se detiene hasta el próximo cambio
    const moving = pS !== target || smX !== pointer.x || smY !== pointer.y || opacity !== opTarget
      || (ambient && (s.float > 0.001 || w4 > 0.05));
    if (moving) invalidate(); else idle = true;
  }

  resize();
  watchDpr();
  pS = scrollP();
  invalidate();
  return { invalidate: wake };
}
