// UI de la página, sin dependencias externas: navegación, pasos, descarga y controles de la demo.
// La escena 3D (Three.js) se carga aparte con import() dinámico: si falla, la página sigue funcionando.
const REPO = "eguiajosue/halftones-dtf";
const STATIC_CCX = `https://github.com/${REPO}/releases/latest/download/OpenDTF.ccx`;
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const t = (k) => (window.I18N && window.I18N.t(k)) || null;
root.classList.add("ui");

/* ============================================================
   Navegación, plancha negra y pasos
   ============================================================ */
const nav = $(".nav");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();

// La historia se imprime sobre la plancha negra (K): el fondo de la página cambia cuando ocupa la pantalla
const story = $(".story");
const themeColor = $('meta[name="theme-color"]');
new IntersectionObserver((entries) => {
  for (const e of entries) {
    document.body.classList.toggle("dark", e.isIntersecting);
    if (themeColor) themeColor.content = e.isIntersecting ? "#0b0b0c" : "#f4f5f3";
  }
}, { rootMargin: "-50% 0px -50% 0px" }).observe(story);

const io = new IntersectionObserver((entries) => {
  for (const e of entries) e.target.classList.toggle("on", e.isIntersecting);
}, { rootMargin: "-35% 0px -35% 0px" });
$$(".step").forEach((s) => io.observe(s));

/* ============================================================
   Descarga: versión publicada desde la API pública de GitHub.
   Solo un 404 significa "no hay versión"; cualquier otro fallo
   (límite de la API, red, tiempo de espera) deja el enlace estático.
   ============================================================ */
const CACHE_KEY = "release:v1", CACHE_TTL = 3600e3;
let release = null;          // objeto: hay versión · false: 404 · null: no se sabe
const safeUrl = (u) => (typeof u === "string" && u.startsWith("https://github.com/") ? u : null);
function pick(json) {
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const stable = assets.find((a) => a && a.name === "OpenDTF.ccx") || assets.find((a) => a && /\.ccx$/i.test(a.name || ""));
  return { tag: String(json.tag_name || ""), date: json.published_at || null, url: stable ? safeUrl(stable.browser_download_url) : null };
}
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(ms);
  if (typeof AbortController === "undefined") return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
async function loadRelease() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (c && Date.now() - c.t < CACHE_TTL && (c.v === false || (c.v && typeof c.v === "object"))) { release = c.v; return renderRelease(); }
  } catch (e) { /* sin sessionStorage: se consulta la API */ }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, signal: timeoutSignal(6000) });
    if (r.status === 404) release = false;
    else if (r.ok) release = pick(await r.json());
    else release = null;
  } catch (e) {
    release = null;
  }
  if (release !== null) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: release })); } catch (e) { /* sin caché */ } }
  renderRelease();
}
function renderRelease() {
  const btn = $("#dlButton"), label = $("#dlButton [data-i18n]");
  if (release) {
    btn.href = release.url || STATIC_CCX;
    if (release.tag) $("#dlVersion").textContent = release.tag;
    const d = release.date ? new Date(release.date) : null;
    $("#dlDate").textContent = d && !isNaN(d) ? d.toLocaleDateString(root.lang, { year: "numeric", month: "long", day: "numeric" }) : "";
    $("#dlNone").classList.add("hidden");
  } else if (release === false) {
    // De verdad no hay versión: el botón lleva a las instrucciones para cargarlo desde el código, y lo dice
    btn.href = `https://github.com/${REPO}#desarrollo`;
    label.setAttribute("data-i18n", "dl.source");
    label.textContent = t("dl.source") || label.textContent;
    $("#dlNone").classList.remove("hidden");
  }
}
addEventListener("langchange", renderRelease);
loadRelease();

/* ============================================================
   Demo: frecuencia, ángulo, forma del punto y niveles.
   Funciona siempre; la escena, si carga, solo lee `demo`.
   ============================================================ */
const demo = { lpi: 28, angle: 33, shape: "ROUND", black: 5 / 255, white: 184 / 255 };
const scene = { demo, reduceMotion, active: false, invalidate() {} };
const lpiIn = $("#demoLpi"), angIn = $("#demoAngle"), blackIn = $("#demoBlack"), whiteIn = $("#demoWhite");
const outs = { lpi: $("#demoLpiOut"), ang: $("#demoAngleOut"), black: $("#demoBlackOut"), white: $("#demoWhiteOut") };
const fill = (el) => el.style.setProperty("--fill", `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
function syncDemo(e) {
  demo.lpi = +lpiIn.value; demo.angle = +angIn.value;
  let bk = +blackIn.value, wt = +whiteIn.value;
  if (wt - bk < 20) { if (e && e.target === blackIn) bk = wt - 20; else wt = bk + 20; blackIn.value = bk; whiteIn.value = wt; }
  demo.black = bk / 255; demo.white = wt / 255;
  outs.lpi.textContent = `${demo.lpi} LPI`;
  outs.ang.textContent = `${demo.angle}°`;
  outs.black.textContent = bk;
  outs.white.textContent = wt;
  lpiIn.setAttribute("aria-valuetext", `${demo.lpi} LPI`);
  angIn.setAttribute("aria-valuetext", `${demo.angle}°`);
  [lpiIn, angIn, blackIn, whiteIn].forEach(fill);
  scene.invalidate();
}
[lpiIn, angIn, blackIn, whiteIn].forEach((el) => el.addEventListener("input", syncDemo));
const shapeBtns = $$("#demoShape button");
shapeBtns.forEach((btn) => btn.addEventListener("click", () => {
  demo.shape = btn.dataset.shape;
  shapeBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
  scene.invalidate();
}));
syncDemo();

// En pantallas estrechas la trama va atenuada tras el texto; solo mientras se usan los controles se ve completa
const demoEl = $(".demo");
let holding = false, idleT = 0;
function interact() {
  clearTimeout(idleT);
  if (!scene.active) { scene.active = true; scene.invalidate(); }
  if (!holding) idleT = setTimeout(() => { scene.active = false; scene.invalidate(); }, 1500);
}
demoEl.addEventListener("pointerdown", () => { holding = true; interact(); });
const endHold = () => { if (holding) { holding = false; interact(); } };
addEventListener("pointerup", endHold);
addEventListener("pointercancel", endHold);
demoEl.addEventListener("input", interact);
demoEl.addEventListener("click", interact);

/* ============================================================
   Escena 3D: solo si hay WebGL; Three.js se carga bajo demanda
   ============================================================ */
function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}
async function startScene() {
  if (!hasWebGL()) { root.classList.add("no-webgl"); return; }
  try {
    const mod = await import("./scene.js");
    mod.start(scene);
    root.classList.add("scene-on");
  } catch (e) {
    root.classList.add("no-webgl");
  }
}
startScene();
