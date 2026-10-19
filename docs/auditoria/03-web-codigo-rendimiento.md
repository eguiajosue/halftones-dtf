# 03 · Web Open-DTF: código, rendimiento, robustez, seguridad, SEO e i18n

Alcance: `site/index.html`, `site/assets/app.js`, `site/assets/i18n.js`, `site/assets/styles.css`, `site/assets/fonts/`, `site/assets/shirt.glb`, más `PRODUCT.md` y `DESIGN.md` para saber qué se pretendía. Métodos: /review (calidad), /benchmark (rendimiento) y /cso (seguridad). No se modificó ningún archivo del repo.

## 0. Cómo se midió y qué no se pudo medir

- **Servidor local**: un servidor Node estático sobre `site/`, con latencia opcional (0 ms y 100 ms por petición).
- **Navegador**: Playwright 1.5x con Chromium 1194 (`/opt/pw-browsers/chromium-1194`) en modo headless. WebGL corre sobre **SwiftShader**, es decir, renderizado por software.
- **Red**: el proxy bloquea `cdn.jsdelivr.net` (CONNECT 403) y `eguiajosue.github.io`. Por eso Three.js r160 se sirvió con `page.route` desde el paquete npm `three@0.160.0`, que jsDelivr sirve byte a byte. La respuesta de la API de GitHub se sirvió mockeada con el JSON real obtenido por curl (`v1.3.0`, 2026-10-16).
- **Métricas**: FCP, LCP, CLS y long tasks con `PerformanceObserver`. El coste JS de cada frame se midió envolviendo `requestAnimationFrame`. `ScriptDuration`, `TaskDuration`, `LayoutCount` y `RecalcStyleCount` salen de CDP `Performance.getMetrics`. El bucle de la trama se aisló en Node (V8, sin GPU) para tener un coste por frame independiente de SwiftShader.
- **Escenarios**: escritorio 1440×900; móvil 390×844 con CPU ×4; CPU ×4 en escritorio; `prefers-reduced-motion`; CDN bloqueado; sin WebGL (`--disable-webgl`); API de GitHub con 403, 404 y sin respuesta; `lang=en` guardado; `lang=fr` (valor inválido); `navigator.language=en-US`.
- **No medible aquí**:
  - Las cabeceras reales de GitHub Pages (gzip/brotli, `Cache-Control`).
  - La latencia real de jsDelivr.
  - Los FPS con GPU real: SwiftShader convierte cada frame en una long task de unos 100 ms, así que FPS e INP absolutos **no son representativos**. Lo que sí vale es el coste JS por frame y el hecho de que el bucle nunca se detiene.
  - Los Core Web Vitals de campo (CrUX).
- Scripts y resultados en `/tmp/claude-0/-home-user-halftones-dtf/ab514123-9b8b-47f6-8625-3f468da08add/scratchpad/audit/03-bench/` (`bench.mjs`, `lcp.mjs`, `fcp.mjs`, `loopbench.mjs`, `results.json`).

### Números clave medidos

| Métrica | Valor |
|---|---|
| FCP = LCP (escritorio, local, 0 ms RTT) | 176–208 ms (elemento LCP: `<em>` del titular) |
| FCP = LCP (móvil 390 px, 0 ms RTT) | 120–132 ms (LCP: `p.hero-sub`) |
| FCP = LCP con 100 ms RTT por petición | 376–392 ms escritorio · 308–324 ms móvil |
| CLS | 0,0001 (escritorio) · 0 (móvil); único desplazamiento: `nav-links` con el swap de fuente |
| `three.module.js` termina de llegar (100 ms RTT) | ~495 ms (cadena html → app.js → three) |
| `shirt.glb` termina de llegar (100 ms RTT) | ~900 ms, aunque solo se usa en el paso 3 |
| Peso transferido (sin compresión, local) | 1 974 139 B con WebGL · 313 761 B con CDN bloqueado · 1 733 865 B sin WebGL |
| Peso estimado gzip en Pages | ~790 KB (three 256 KB gz + glb 240 KB + fuentes 244 KB + resto ~50 KB) |
| Bucle de trama, CPU JS/frame (V8 escritorio, Node) | LPI 15: 0,23 ms · **LPI 28 (por defecto): 0,82 ms** · LPI 45: 2,6 ms · **LPI 60: 4,0 ms** |
| …de eso, solo `art()` | 59–65 % (0,49 ms con LPI 28; 2,36 ms con LPI 60) |
| Callback rAF en navegador (incluye `renderer.render`) | p50 1,9 ms (LPI 28) · p50 10,2 / p95 28,9 ms (LPI 60) · móvil CPU ×4: p50 8 ms · CPU ×4 con LPI 60: p50 17,3 / p95 28 ms |
| Subida a GPU por frame | **1,19 MB/frame siempre** (16 000 × 64 B de matrices + 16 000 × 12 B de color), aunque solo se pinten 834 puntos (5 %) → ~71 MB/s a 60 fps |
| Long tasks con WebGL (SwiftShader) | 1 de 250–330 ms al iniciar, y luego **cada frame** entre 85 y 160 ms (escritorio) o entre 50 y 130 ms (móvil). Sin WebGL: 1 de 52 ms |
| Heap JS | Estable entre 3,8 y 5 MB en todos los escenarios: no se observan fugas |
| Bucle con el canvas oculto (FAQ) | sigue a ~37–60 callbacks/s, 0,1 ms cada uno, con 5 recálculos de estilo cada 3 s |
| 30 eventos `resize` seguidos | 1 ms en total |

---

## 1. Hallazgos por severidad

### CRÍTICO

#### C1. Si el CDN de Three.js falla (o no hay JS), la sección "Cómo funciona" se vuelve invisible y toda la UI deja de funcionar
- **Dónde**: `site/index.html:16-18` (import map a jsDelivr), `site/index.html:247`, `site/assets/app.js:1-2` (import estático de `three` y `GLTFLoader`), `site/assets/app.js:12-57` (la lógica de UI vive en el mismo módulo), `site/assets/styles.css:155` (`.story { color: var(--paper) }`) y `styles.css:158-160` (`.step { opacity: .25 }` hasta que llega `.on`).
- **Escenario de fallo**: jsDelivr caído, bloqueado por la red corporativa o el país, filtrado por un bloqueador, o JS desactivado. Un fallo en el grafo de imports estáticos impide que **se ejecute ni una línea** de `app.js`. **Medido** con el CDN bloqueado:
  - `body` tiene fondo `rgb(244,245,243)` y el `h3` de cada paso es `rgb(244,245,243)`: texto blanco sobre papel blanco, contraste 1:1.
  - `.step` queda con `opacity: 0.25` y `body.dark` es `false`.
  - Además: la barra de navegación nunca recibe `.scrolled` (transparente sobre el contenido), los sliders de la demo no actualizan nada, no se consulta la release y no se añade `.no-webgl`.
  - Es justo el escenario que `PRODUCT.md:27` exige que funcione ("no-WebGL fallback must keep working").
- **Arreglo**: separar la UI de la escena, cargar la escena con `import()` dinámico y hacer que el CSS por defecto sea legible.

```html
<!-- index.html -->
<html lang="es" class="no-js">
...
<script type="module" src="assets/ui.js"></script>   <!-- sin imports externos -->
<script type="module">
  import("./assets/scene.js").catch(() => document.documentElement.classList.add("no-webgl"));
</script>
```
```js
// assets/ui.js: lo que hoy está en app.js:12-57, más la demo (que no depende de three)
document.documentElement.classList.replace("no-js", "js");
```
```css
/* styles.css: mejora progresiva */
.step { opacity: 1; transform: none; }
.js .step:not(.on) { opacity: .25; transform: translateY(16px); }
.no-js .story { color: var(--k); }            /* sin JS no hay fondo K */
.no-js .demo, .no-webgl .demo { display: none; }
```
La alternativa más robusta es **autoalojar Three.js** (ver A3): elimina este punto único de fallo de terceros.

---

### ALTO

#### A1. Un fallo de la API de GitHub (403 por rate limit, 5xx, red) se trata como "no hay versión" y estropea el botón de descarga
- **Dónde**: `site/assets/app.js:31-40` (cualquier error pasa a `release = false`) y `app.js:51-53`.
- **Escenario**: la API sin autenticar permite **60 peticiones por hora por IP**. Una imprenta o una oficina tras NAT, o un operador móvil con CGNAT, la agota enseguida, porque cada visita y cada recarga hace una petición y no hay caché. **Medido** con 403: `#dlNone` visible ("Todavía no hay una versión publicada…") y `#dlButton.href` = `https://github.com/eguiajosue/halftones-dtf#desarrollo`. Es decir, el CTA principal deja de descargar el `.ccx` aunque la versión v1.3.0 existe y el enlace estático `releases/latest/download/OpenDTF.ccx` del HTML (`index.html:186`) funcionaba sin la API. Con la API colgada no hay timeout: `fetch` queda pendiente para siempre (inocuo, pero sin control).
- **Arreglo**: solo un 404 significa "sin release". Añadir timeout y caché de 1 h.

```js
async function loadRelease() {
  const KEY = "release:v1", TTL = 3600e3;
  try { const c = JSON.parse(sessionStorage.getItem(KEY)); if (c && Date.now() - c.t < TTL) { release = c.v; return renderRelease(); } } catch {}
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(6000) });
    if (r.status === 404) release = false;                  // de verdad no hay release
    else if (!r.ok) release = null;                         // 403/5xx: deja el enlace estático
    else release = await r.json();
    if (release !== null) try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), v: release })); } catch {}
  } catch { release = null; }
  renderRelease();
}
```
Mejor todavía: escribir `site/release.json` en `pages.yml` y en `release.yml` (`gh release view --json tagName,publishedAt,assets > site/release.json`) y leerlo del mismo origen. Así desaparecen el rate limit, la dependencia y un `connect-src` externo.

#### A2. El bucle WebGL recalcula y sube a la GPU 1,19 MB en cada frame, sin parar nunca, también con `prefers-reduced-motion` o sin cambios
- **Dónde**: `site/assets/app.js:289-376`, en concreto:
  - `:290`: `requestAnimationFrame` incondicional.
  - `:294`: oculta el canvas pero sigue el bucle.
  - `:324-370`: recalcula `art()` para hasta 13 924 celdas por frame.
  - `:372-373`: `needsUpdate` sin rango sube los búferes completos de `MAX=16000`.
- **Escenario de fallo**:
  - **CPU**: con LPI 28, 0,82 ms de JS por frame; con LPI 60, 4 ms en V8 de escritorio. En un móvil medio (×4–6) son 16–24 ms solo de JS, por encima del presupuesto de 16,7 ms. **Medido**: con CPU ×4 y LPI 60, rAF p50 de 17,3 ms y p95 de 28 ms, lo que da tirones y peor INP al arrastrar los sliders.
  - **GPU y batería**: 1,19 MB subidos a la GPU por frame (~71 MB/s) aunque, con los valores por defecto, solo se pintan 834 instancias (62 KB útiles). El bucle no se detiene en ningún caso:
    - con `reduceMotion` (`time` congelado, pero el recálculo y el render siguen a 60 fps);
    - en los pasos 1–5, donde `float = 0` y la escena es estática una vez que `pS` converge;
    - cuando la escena queda tapada por las secciones sólidas: el callback sigue y lee 7 `getBoundingClientRect()` por frame (medido: 37–60 callbacks/s en la FAQ).
  - En SwiftShader (equipos con la GPU en lista negra), cada frame fue una long task de unos 100 ms.
- **Arreglo** (de mayor a menor impacto):

```js
// 1) Subir solo lo usado (three r160 ya tiene addUpdateRange)
dots.count = shown;
dots.instanceMatrix.clearUpdateRanges(); dots.instanceMatrix.addUpdateRange(0, shown * 16);
dots.instanceColor.clearUpdateRanges();  dots.instanceColor.addUpdateRange(0, shown * 3);
dots.instanceMatrix.needsUpdate = dots.instanceColor.needsUpdate = true;

// 2) Cachear la muestra de art() por (lpi, ang): solo cambia al mover los sliders o al rotar el ángulo
let cacheKey = "", cache = null;           // Float32Array [x, y, r, g, b] por celda dentro del póster
const key = `${demo.lpi}|${s.ang.toFixed(2)}`;
if (key !== cacheKey) { cache = sampleGrid(demo.lpi, s.ang); cacheKey = key; }

// 3) Renderizar bajo demanda: bucle activo solo si algo cambia
let running = false, sceneVisible = true;
const kick = () => { if (!running && sceneVisible && !document.hidden) { running = true; requestAnimationFrame(frame); } };
function frame() {
  /* ...cálculo... */
  const animating = !reduceMotion && (s.float > 0.001 || w4 > 0.05) || Math.abs(scrollP() - pS) > 1e-3
                    || Math.abs(pointer.x - smX) + Math.abs(pointer.y - smY) > 1e-3;
  renderer.render(scene, camera);
  if (animating) requestAnimationFrame(frame); else running = false;
}
addEventListener("scroll", kick, { passive: true }); addEventListener("pointermove", kick, { passive: true });
[lpiIn, angIn, blackIn, whiteIn].forEach((el) => el.addEventListener("input", kick));
document.addEventListener("visibilitychange", kick);
// 4) Pausar al quedar tapado, en lugar de medir storyEnd() en cada frame
new IntersectionObserver(([e]) => { sceneVisible = e.isIntersecting; canvas.style.visibility = sceneVisible ? "visible" : "hidden"; kick(); },
  { rootMargin: "0px 0px 20% 0px" }).observe(document.querySelector(".story"));
```
Opcional: limitar a 30 fps cuando `!wide` o cuando `navigator.hardwareConcurrency <= 4`, y bajar `MAX` y el límite de LPI de la demo en móvil.

#### A3. Cadena de suministro: Three.js desde un CDN sin integridad (SRI) y sin CSP
- **Dónde**: `site/index.html:16-18`; en `index.html:3-15` no hay ningún `<meta http-equiv="Content-Security-Policy">`.
- **Escenario**: si jsDelivr o el paquete npm se ven comprometidos, o la respuesta se manipula, se ejecuta JS arbitrario en el origen `eguiajosue.github.io`. La versión está fijada (`@0.160.0`, bien), pero no hay `integrity`. GitHub Pages no permite cabeceras, pero la CSP por `<meta>` funciona (salvo `frame-ancestors`).
- **Arreglo A, recomendado**: autoalojar `three.module.min.js`, `GLTFLoader.js` y `BufferGeometryUtils.js` en `site/assets/vendor/three@0.160.0/`. Sin paso de build: basta con copiar los archivos. Ocupan 811 KB en bruto y **unos 196 KB gz**, frente a los 286 KB gz actuales. Esto resuelve C1, A3 y parte de M3, y permite `script-src 'self'`.
- **Arreglo B**: si se mantiene el CDN, usar la integridad del import map (Chrome 127+, Safari 18+, Firefox 138+). Hashes calculados sobre los archivos npm de r160:

```html
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" },
  "integrity": {
    "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js": "sha384-8/hf5tabFfIo0BPku31TKUvGIKpWGYaMwNtlSNqNyZzXgZCMd4lnOGWbJElML9dv",
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js": "sha384-oxY9vSeh7Mrt5WmhN8xfWoDRnmoW9krEiRBY7vJKaK90jMUidM0fhbUwcblpBgTu",
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js": "sha384-jHGXS4+FuVOBnZkNme2ury3Ccg5DWDLYK22xX/WGdZCZsjRM4J+3n6Qc4CXx1Hjf" } }
</script>
```
(Si se queda la versión no minificada: `three.module.js` → `sha384-61S/Nu32S3E5+n+KpCOTb2eRYps6fVKm+9Gz1QBvSePFthb46f063Aa/qe/lykFZ`.)

- **CSP por meta** (el import map inline necesita su hash; el actual es `sha256-s32dCLGJiNDN2L3oxNI9ArzxV8+jSckDfCGdxmnECh8=` y hay que recalcularlo si cambia):

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-<hash del importmap>' https://cdn.jsdelivr.net; connect-src 'self' https://api.github.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
```
`'unsafe-inline'` en `style-src` es necesario por los `style="left:34%"` de `index.html:126,148`. Si se pasan a clases, se puede quitar. Las escrituras CSSOM de `app.js:306` no las bloquea la CSP. Añadir también `<meta name="referrer" content="strict-origin-when-cross-origin">`.

---

### MEDIO

#### M1. SEO: faltan canonical, hreflang, og:image, og:url, og:locale y Twitter card. El inglés solo existe por JS y Googlebot puede indexar la versión inglesa
- **Dónde**: `site/index.html:6-11` y `site/assets/i18n.js:85-89`.
- **Escenario**:
  - Sin `og:image`, la vista previa al compartir en WhatsApp, Slack o X sale sin imagen; es el canal principal para una herramienta de imprentas.
  - Sin `canonical`, `?utm=…` y `index.html` se consideran duplicados.
  - El inglés no tiene URL propia, así que no puede posicionar.
  - Lo más grave: Googlebot renderiza con `navigator.language = "en-US"` y sin `localStorage`, de modo que `i18n.js:87-89` le cambia la página a **inglés**. La versión hispana, que es la principal, puede indexarse con el título y el texto en inglés. **Medido**: con `locale en-US` el título pasa a "Open-DTF — Free, open-source DTF halftones for Photoshop" y `lang="en"`.
  - Además, `og:title` y `og:description` no se traducen (medido: siguen en español con `lang=en`).
  - No hay `robots.txt`, `sitemap.xml` ni `404.html`.
- **Arreglo**: generar `site/en/index.html` estático (o `?lang=en` como mínimo) y declarar:

```html
<link rel="canonical" href="https://eguiajosue.github.io/halftones-dtf/" />
<link rel="alternate" hreflang="es" href="https://eguiajosue.github.io/halftones-dtf/" />
<link rel="alternate" hreflang="en" href="https://eguiajosue.github.io/halftones-dtf/en/" />
<link rel="alternate" hreflang="x-default" href="https://eguiajosue.github.io/halftones-dtf/" />
<meta property="og:url" content="https://eguiajosue.github.io/halftones-dtf/" />
<meta property="og:image" content="https://eguiajosue.github.io/halftones-dtf/assets/og.png" /> <!-- 1200×630 -->
<meta property="og:locale" content="es_ES" /><meta property="og:locale:alternate" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Open-DTF","applicationCategory":"DesignApplication","operatingSystem":"Windows, macOS","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"},"license":"https://opensource.org/licenses/MIT"}</script>
```
Mientras no exista la URL `/en/`, no cambiar el idioma solo por `navigator.language`; en su lugar, mostrar una sugerencia ("View in English?"), o al menos no hacerlo para bots (`/bot|crawl|spider/i.test(navigator.userAgent)`).

#### M2. El fallback sin WebGL está incompleto: demo muerta, Three.js descargado igualmente y sin manejo de pérdida de contexto
- **Dónde**: `site/assets/app.js:139-146` (todo el código de la demo, `:207-226`, vive dentro de `if (renderer)`) y `styles.css:296-299`.
- **Escenario** (medido con `--disable-webgl`):
  - Se aplica `no-webgl` correctamente y la historia es legible.
  - Pero el panel "Pruébalo aquí" se sigue mostrando, y sus sliders se mueven sin actualizar los `<output>` (`#demoWhiteOut` se queda en "184"). Parece roto.
  - Se descargan 1,73 MB, Three.js incluido, para nada, y la consola muestra 7 errores de `THREE.WebGLRenderer`.
  - No hay manejador de `webglcontextlost`: si la GPU se reinicia (en iOS, al volver de segundo plano), el canvas queda en blanco y el fondo K sin trama.
- **Arreglo**:

```js
// Antes de importar three: comprobar soporte sin coste
const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
if (!gl) { document.documentElement.classList.add("no-webgl"); } else { import("./scene.js"); }
// scene.js
canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); document.documentElement.classList.add("no-webgl"); });
```
```css
.no-webgl .demo { display: none; }   /* o bien mantener la demo con un preview CSS estático */
```
`failIfMajorPerformanceCaveat` evita el render por software, donde cada frame cuesta unos 100 ms (medido).

#### M3. Cascada de carga: Three.js se descubre tarde, va sin minificar, y el GLB se descarga al inicio sin necesidad
- **Dónde**: `site/index.html:16-18` y `:247`; `site/assets/app.js:191` (`GLTFLoader().load` inmediato).
- **Escenario**:
  - La cadena es html → `app.js` → (`three.module.js` + `GLTFLoader.js`) → `BufferGeometryUtils.js`: tres saltos sin `modulepreload` ni `preconnect`, en un origen de terceros (DNS + TLS adicionales).
  - **Medido** con 100 ms de RTT: three llega a unos 495 ms y el GLB a unos 900 ms.
  - Se usa `three.module.js` sin minificar (1,27 MB, 256 KB gz) en lugar de `three.module.min.js` (671 KB, 166 KB gz): 90 KB gz y unos 600 KB de parseo de más.
  - El GLB (240 KB, ya con `KHR_mesh_quantization`, 9168 vértices) compite por el ancho de banda con three en móvil, aunque solo aparece en el paso 3. El LCP no se ve afectado (es texto: 120–392 ms), pero sí el tiempo hasta la interactividad de la demo.
- **Arreglo**:

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js" />
<link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js" />
<link rel="modulepreload" href="assets/app.js" />
```
```js
// Cargar la camiseta cuando la historia se acerque
const loadShirt = () => new GLTFLoader().load("assets/shirt.glb", onShirt, undefined, () => {});
new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); loadShirt(); } },
  { rootMargin: "100% 0px" }).observe(document.querySelector('[data-story="2"]'));
```
Opcional: comprimir el GLB con `gltfpack -cc` (EXT_meshopt_compression; suele quedar en 40–60 % del tamaño) y añadir `MeshoptDecoder`, unos 20 KB.

#### M4. Sin caché ni timeout en la consulta de release
Ya cubierto en A1: sin `sessionStorage` ni ETag, cada carga consume cuota, y sin `AbortSignal.timeout` el `fetch` puede quedar colgado. Medido con "API sin respuesta": el botón conserva el enlace estático (correcto), pero no hay control.

---

### BAJO

#### B1. Huecos de i18n
- **Etiquetas ARIA sin traducir** (`index.html:31` `aria-label="Principal"`, `:101` `aria-label="Ver cómo funciona"`). Medido con `lang=en`: siguen en español. Los lectores de pantalla en inglés anuncian español con `lang="en"`, una pronunciación errónea que contradice `PRODUCT.md:47` ("Spanish and English are equally supported"). Arreglo: soportar `data-i18n-attr="aria-label:nav.label"` en `i18n.js:71-75`:

```js
document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
  el.getAttribute("data-i18n-attr").split(";").forEach((p) => { const [attr, k] = p.split(":"); if (d[k]) el.setAttribute(attr, d[k]); });
});
```
(Hay que capturar también los valores ES de los atributos al inicio, como se hace en `i18n.js:57-61`.)
- **Las mini réplicas del panel** (`index.html:113-160`) siguen en español con `lang=en`. Es intencionado según `DESIGN.md:291` (el panel real del plugin solo está en español), así que es informativo. Si se quiere coherencia, añadir `lang="es"` a cada `.mini`.
- **`og:*` sin actualizar** en `apply()` (`i18n.js:76-78`). Es irrelevante para los crawlers sin JS, pero incoherente.
- **Detección de idioma** (`i18n.js:87`): mira solo `navigator.language` e ignora `navigator.languages`. Lo medido con `lang=fr` guardado: cae a inglés sin errores (correcto).
- **El botón de idioma** (`index.html:38`) muestra "EN" sin `lang="en"` ni `aria-pressed`. Arreglo: `t.setAttribute("lang", lang === "es" ? "en" : "es")`.
- **Riesgo de destello en español** para los usuarios EN: `i18n.js` es un script síncrono al final del `<body>`. Normalmente se ejecuta antes del primer pintado, pero Chrome puede pintar contenido parcial en documentos grandes. No se observó en la medición (CLS 0,0001). Mitigación: un script inline mínimo en `<head>` que fije `lang` antes de pintar.

#### B2. `resize` no contempla cambios de `devicePixelRatio`
- **Dónde**: `app.js:147` y `:268-278`.
- **Escenario**: al mover la ventana entre monitores de 1x y 2x, o con zoom, el `pixelRatio` queda congelado y la imagen sale borrosa o con sobrecoste. El coste de resize es despreciable (30 eventos en 1 ms).
- **Arreglo**:

```js
const watchDpr = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); resize(); watchDpr(); }, { once: true });
watchDpr();
```

#### B3. Datos externos y enlaces
- **`btn.href = stable.browser_download_url`** (`app.js:46`) sin validar. El riesgo es mínimo (viene de la API de GitHub), pero como defensa en profundidad: `if (/^https:\/\/github\.com\//.test(url)) btn.href = url;`. Lo positivo: `tag_name` y la fecha se insertan con `textContent` (`app.js:47-49`), y `innerHTML` (`i18n.js:60,74`) solo usa diccionarios estáticos del propio sitio. No hay XSS con datos externos.
- **`published_at` nulo o inválido** produciría "Invalid Date" (`app.js:48-49`). Arreglo: `if (!isNaN(d)) …`.
- **`rel="noopener"`** en todos los enlaces externos, pero ninguno usa `target="_blank"`, así que no hay riesgo de `window.opener`. Es correcto e inocuo.
- **`http://creativecommons.org/licenses/by/4.0/`** (`index.html:242`, `i18n.js:53`): pasar a `https://`.

#### B4. Calidad de código menor (`app.js`)
- **`:160-161`**: `GEO.ELLIPSE` es una copia idéntica de `GEO.ROUND`, una geometría duplicada. Se puede reutilizar `GEO.ROUND` (la elipse ya se hace con `scl`).
- **`:293`**: `if (document.hidden) return;` es redundante, porque los navegadores ya no llaman a rAF en pestañas ocultas. El bucle sigue programándose, pero no cuesta nada. Con el render bajo demanda de A2 se sustituye por `visibilitychange`.
- **`:294-295`**: escribe `canvas.style.visibility` en cada frame. Medido: 5 recálculos de estilo cada 3 s con el canvas oculto. Basta con escribirlo solo al cambiar, o usar el IO de A2.
- **`:215-218`**: `$("#demoLpiOut")` se consulta en cada `input`. Conviene cachear los 4 `output`.
- **`:195`**: los materiales originales del GLB se sustituyen sin `dispose()`. La fuga es mínima (un solo material sin texturas) y el heap medido es estable.
- **`:213`**: la regla `wt - bk < 20` depende de `document.activeElement`. Con teclado funciona, pero con un clic de ratón sobre el track del slider de blanco el foco puede no haberse movido todavía. Arreglo: `syncDemo(e)` y `e.target === blackIn`.

#### B5. Fuentes
- **Instrument Serif** se usa en el wordmark de la barra (`styles.css:57`), visible en el primer viewport, pero no tiene `preload` (`index.html:13-14` solo precarga Bricolage y Archivo). Produce un pequeño swap en "Open". Arreglo: precargarla también (22 KB).
- **Bricolage** pesa 131 KB (ejes `wdth` y `opsz`). Se podría reducir con `pyftsubset` limitando el rango de ejes a los valores usados (`wdth` 88–100, `opsz` 30–96).
- `font-display: swap` y `unicode-range` están bien. CLS medido: 0,0001.

#### B6. Varios
- **`theme-color`** es fijo (`#f4f5f3`) mientras la historia está en K. Se puede actualizar en el IO de `app.js:19-21`.
- **`<label class="demo-row">`** envuelve el `<output>` (`index.html:71-99`), así que el nombre accesible del slider incluye el valor ("Frecuencia 28 LPI"). Es aceptable, pero lo correcto es `<label for>` solo sobre el `<span>`.

---

## 2. Lo que está bien
- **LCP basado en texto**: 120–208 ms en local y 308–392 ms con 100 ms de RTT. No depende de Three.js ni de las fuentes, gracias a `swap`.
- **CLS prácticamente nulo** (0,0001).
- **Fuentes autoalojadas** con subconjunto latino, `unicode-range`, `preload` de las dos principales y `crossorigin` correcto.
- **Versión de Three.js fijada exactamente** (`@0.160.0`).
- **Datos de la API insertados con `textContent`**; `innerHTML` solo con cadenas propias.
- **`prefers-reduced-motion`** respetado en CSS (`styles.css:289-294`) y en JS (`app.js:5`, `:281`, `:296`, `:303`), aunque el bucle sigue activo (A2).
- **Heap estable** (3,8–5 MB) y listeners `passive` en scroll y pointermove.
- **El fallback `no-webgl` funciona** cuando el CDN sí carga y WebGL falla (medido).
- **Valores inválidos de `localStorage.lang`** no rompen nada (medido con `fr`).

## 3. Orden de trabajo recomendado
1. **C1 + A3**: autoalojar Three.js minificado y separar `ui.js` de `scene.js` con `import()`, más CSS de mejora progresiva. Es la mayor ganancia en robustez y seguridad, y además ahorra 90 KB gz.
2. **A1**: tratar solo el 404 como "sin release"; idealmente, `release.json` generado en el workflow.
3. **A2**: `addUpdateRange`, caché de `art()` y render bajo demanda. Ahorra el 95 % de la subida a GPU y la mayor parte de la CPU en reposo.
4. **M1**: canonical, OG e imagen OG; después, `/en/` estático con `hreflang`.
5. **M2/M3**: ocultar la demo con `no-webgl`, `modulepreload` y GLB diferido.
6. El resto de B.
