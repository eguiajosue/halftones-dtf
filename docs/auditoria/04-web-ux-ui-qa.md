# 04 · Auditoría UX/UI + QA de la web de Open-DTF (`site/`)

Fecha: 2026-10-19 · Metodología: GStack `/design-review` (auditoría visual en vivo con ojo de diseñador) + `/qa` (recorrido funcional, teclado, responsive, movimiento reducido, estados rotos) + revisión WCAG 2.1/2.2 AA.
Alcance: `site/index.html`, `site/assets/styles.css`, `site/assets/app.js`, `site/assets/i18n.js`, contrastado con `DESIGN.md` y `PRODUCT.md`. Solo lectura: no se ha modificado ningún archivo del repo.

## Cómo se probó

- Servidor local: `python3 -m http.server --directory site 8765`.
- Playwright 1.5x + Chromium 1194 (`/opt/pw-browsers`, SwiftShader para WebGL). Scripts en `scratchpad/pw/audit.mjs`, `probe.mjs`, `probe2.mjs`; resultados crudos en `scratchpad/audit/web-audit-results.json`.
- **Red:** el CDN de Three.js (`cdn.jsdelivr.net`) está **bloqueado** en este entorno (proxy 403). Para auditar la experiencia real se sirvió `three@0.160.0` desde npm local interceptando las URLs del CDN; además se probó el **estado con CDN bloqueado** tal cual. La API de GitHub responde (release `v1.3.0`, 2026-10-16, assets `OpenDTF.ccx` y `OpenDTF_v1.3.0.ccx`); se probaron tres escenarios: API OK, API 404 y API caída.
- Viewports: 1440×900, 768×1024, 375×812. Emulación `prefers-reduced-motion: reduce`. Locale `es-ES` y `en-US`.
- 77 capturas en `scratchpad/audit/shots/web-*.png` (las citadas abajo son las más relevantes).

## Puntuación por dimensión (0-10)

| Dimensión | Nota | Comentario corto |
|---|---|---|
| Jerarquía visual | 8 | Titular de portada potente (800/300), CTA principal claro, secciones bien jerarquizadas. |
| Tipografía | 8 | Sistema coherente (Bricolage 800/300 + Archivo). Corte feo «Open-/DTF» en el lead de "Por qué". |
| Espaciado y ritmo | 7 | Escala base 4 respetada; la historia 3D es muy larga (~6 pantallas para 5 párrafos) y hay vacíos grandes (portada tablet, descarga). |
| Color y contraste | 8 | Pares de texto principales AA holgados; magenta 4,63:1 (no 5,4 como dice DESIGN.md); pista de los sliders 1,15:1. |
| Composición | 7 | Portada desktop muy lograda; en tablet/móvil la trama 3D se monta sobre el texto y el botón fantasma. |
| Movimiento | 7 | Momento firmado (desregistro) elegante y bien desactivado en reduced-motion; render 3D costoso por frame. |
| Consistencia con DESIGN.md / PRODUCT.md | 7 | Mundo "Check Print" muy fiel; fallos en "descarga a un clic" en móvil, fallback sin WebGL inoperante, deriva de tokens/docs. |
| Patrones "AI slop" | 8 | Poca plantilla genérica; única concesión: rejilla 3×2 de "facts" iguales. |
| QA funcional | 5 | Todo funciona con CDN; **sin CDN se rompe toda la UI** (historia invisible, demo muerta). |
| Responsive | 6 | Sin scroll horizontal en ningún ancho; pero sin navegación ni botón de descarga en móvil y legibilidad comprometida en tablet. |
| Accesibilidad (WCAG AA) | 6 | Buen foco visible, landmarks y headings correctos; label-in-name del toggle, aria sin traducir, sliders sin unidades, objetivos táctiles justos. |
| i18n ES/EN | 6 | Toggle y persistencia OK; réplicas del panel, slug y aria-labels quedan en español; copy EN "move the screen" ambiguo. |
| Resiliencia / estados de fallo | 3 | Dependencia dura del CDN; fallback de descarga engañoso. |
| Rendimiento | 6 | ~14 000 instancias recalculadas en CPU cada frame aunque nada cambie. |

**Nota global: 6,6 / 10.** Diseño muy por encima de la media; la ejecución técnica de los fallbacks y el móvil lo frenan.

---

## Hallazgos por severidad

### CRÍTICO

#### C1. Si el CDN de Three.js falla, la historia queda invisible y toda la UI deja de funcionar
- **Dónde:** `site/assets/app.js:1-2` (imports estáticos de `three` en la cabecera del módulo), `site/assets/app.js:12-57` (UI de nav, modo oscuro, pasos y descarga dentro del mismo módulo), `site/assets/styles.css:155` (`.story { color: var(--paper) }`), `site/assets/styles.css:158-160` (`.step { opacity: 0.25 }` hasta que JS añade `.on`), `site/assets/app.js:140-144` (el fallback `.no-webgl` solo se activa si falla `new WebGLRenderer`).
- **Qué pasa (verificado):** con `cdn.jsdelivr.net` bloqueado (como en este entorno, y como en redes corporativas, bloqueadores o caídas del CDN) el import falla y **no se ejecuta ni una línea** de `app.js`. Resultado medido: `body.dark=false`, fondo papel `#f4f5f3`, texto de los pasos `rgba(244,245,243,.82)` a `opacity .25` → **texto papel sobre papel, ilegible** (captura `web-nocdn-step2.png`, `web-nocdn-story.png`). Tampoco se aplica `.no-webgl` (la trama CSS de respaldo nunca aparece), la nav nunca recibe `.scrolled`, y la release no se consulta. Con JS desactivado ocurre exactamente lo mismo. Incumple PRODUCT.md («`prefers-reduced-motion` and a no-WebGL fallback must keep working»).
- **Arreglo:**
  1. Separar `app.js` en `ui.js` (nav, modo oscuro, pasos, descarga, demo-outputs; sin dependencias) y `scene.js`. En `scene.js`, cargar Three con `const THREE = await import("three")` dentro de `try/catch`; en el `catch` añadir `document.documentElement.classList.add("no-webgl")`.
  2. CSS a prueba de fallo: aplicar la plancha negra y la opacidad atenuada solo cuando JS está vivo, p. ej. `<html class="no-js">` + `document.documentElement.classList.replace("no-js","js")` en un script inline, y en CSS: `.no-js .story, .no-webgl .story { background: var(--k); }` y `.js .step { opacity:.25; … }` (por defecto `opacity:1`).
  3. Opcional: autoalojar `three.module.js` + `GLTFLoader.js` en `assets/vendor/` (≈ 700 KB sin minificar / ~150 KB gzip del subconjunto) para eliminar el punto único de fallo.

#### C2. La demo de la portada parece interactiva pero no hace nada sin WebGL/CDN
- **Dónde:** `site/assets/app.js:207-226` (el binding de sliders y botones de forma está dentro de `if (renderer) { … }`).
- **Qué pasa (verificado):** sin CDN, mover "Frecuencia" a 50 deja la salida en "28 LPI"; los botones de forma no cambian `aria-pressed`. Es un control roto visible en el primer pantallazo (`web-nocdn-hero.png`), en la zona de mayor atención.
- **Arreglo:** mover `syncDemo` y los listeners al módulo de UI (siempre activos) y que la escena solo lea `demo`. Si no hay escena, ocultar la anotación (`.no-webgl .demo { display:none }`) o sustituir el título por «La vista previa necesita WebGL» y mantener los outputs vivos.

### ALTO

#### A1. El fallback de descarga lleva al README con un botón que dice «Descargar .ccx»
- **Dónde:** `site/assets/app.js:51-54`, `site/index.html:186-191`.
- **Qué pasa (verificado con API 404 / caída):** el `href` pasa de `…/releases/latest/download/OpenDTF.ccx` (que **sí funciona**, porque la release v1.3.0 existe) a `https://github.com/eguiajosue/halftones-dtf#desarrollo`, el botón sigue diciendo «Descargar .ccx» y aparece «Todavía no hay una versión publicada…», **lo cual es falso**. La API pública sin autenticar tiene límite de 60 peticiones/hora por IP: en una oficina, un taller con IP compartida o tras varios refrescos, el usuario recibe un mensaje falso y pierde la descarga. Contradice el principio 4 de PRODUCT.md («The download is always one clear action away»).
- **Arreglo:** distinguir "no hay release" (`404` explícito) de "no se pudo consultar" (red, 403, 5xx). Solo en 404 cambiar el CTA, y entonces cambiar también su texto (`dl.button` → «Instalar desde el código») para que el texto coincida con el destino. En cualquier otro error, dejar el enlace estático `releases/latest/download/OpenDTF.ccx` y ocultar fecha/versión. Cachear la respuesta en `sessionStorage` 1 h para no gastar cuota.

#### A2. En móvil (<520 px) no hay navegación ni botón de descarga en la cabecera
- **Dónde:** `site/assets/styles.css:268` (`.nav-links { display:none }` bajo 900 px), `site/assets/styles.css:285` (`.nav .btn-small { display:none }` bajo 520 px).
- **Qué pasa:** en 375 px la cabecera fija solo contiene logo + «EN» (`web-mobile-hero.png`). Una vez pasada la portada, el usuario tiene que recorrer ~6 pantallas de historia para llegar a la descarga; no hay forma de saltar a FAQ o a "Por qué". El documento de diseño decide ocultarlo, pero choca con el principio 4 de PRODUCT.md.
- **Arreglo:** mantener un botón de descarga compacto en móvil (`.btn-small` con solo el icono + `aria-label`, o texto «Descargar» a 13 px; hay sitio: logo 122 px + EN 42 px + botón ~90 px < 335 px útiles). Alternativa: barra CTA inferior fija que aparece tras salir de la portada. Para las anclas, un menú `<details>` simple bajo 900 px.

#### A3. En tablet la trama 3D se pinta a opacidad completa detrás del texto de portada y del botón fantasma
- **Dónde:** `site/assets/app.js:228-229` y `:318` (`mat.opacity = wide ? 1 : (demoInView ? 1 : …)`), `site/assets/styles.css:83` (`.btn-ghost { background: transparent }`), `site/assets/app.js:313` (posición `ty` en estrecho).
- **Qué pasa (verificado, `web-tablet-hero.png`):** a 768×1024 la demo ocupa >50 % del viewport al cargar, así que `demoInView=true` y la atenuación al 30 % pensada para la legibilidad se anula: el párrafo, el CTA «Ver el código» (fondo transparente) y la meta quedan sobre puntos saturados. El contraste del texto pasa a depender de los puntos que tenga detrás (sobre los puntos amarillos/rosados aguanta; sobre los morados y azules oscuros baja mucho), y el ruido visual de los puntos dificulta leer. En móvil, al llegar a la demo pasa lo mismo con la meta (`web-mobile-00-demo.png`).
- **Arreglo:** (a) aplicar la opacidad completa solo mientras el usuario **interactúa** (`pointerdown`/`focus` en `.demo` → `true`, `blur`/timeout 2 s → `false`), no cuando la demo es visible; (b) en estrecho, colocar el póster por encima del titular o en la zona de la demo, no bajo el párrafo; (c) dar a `.btn-ghost` `background: var(--paper)` (sigue siendo "fantasma" visualmente sobre papel y protege el texto).

### MEDIO

#### M1. El toggle de idioma: nombre accesible no contiene el texto visible y no se traduce
- **Dónde:** `site/index.html:38`, `site/assets/i18n.js:79-80`.
- **Qué pasa:** nombre accesible fijo «Cambiar idioma / Change language» mientras el texto visible es «EN»/«ES» → fallo WCAG 2.5.3 *Label in Name* (un usuario de control por voz que dice "pulsa EN" no lo activa). Tampoco indica a qué idioma cambia.
- **Arreglo:** en `apply()`: `t.setAttribute("aria-label", lang === "es" ? "Switch to English (EN)" : "Cambiar a español (ES)")` y `t.lang = lang === "es" ? "en" : "es"`. Alternativa: texto visible «EN» con `<span class="sr-only">` complementario, sin `aria-label`.

#### M2. Atributos ARIA y textos visibles que no cambian con el idioma
- **Dónde:** `site/index.html:31` (`aria-label="Principal"`), `:101` (`aria-label="Ver cómo funciona"`), `:50` (slug «Open-DTF · check print» en inglés dentro de la página ES), `:113-160` (réplicas del panel: «Tamaño de impresión», «Proporción bloqueada», «Punto/Línea/Diamante/Elipse», «Frecuencia», «Preparar», «Mismo color», «Tonos», «En vivo», «Blanco», «diseño - Prepped», «Aplicar»).
- **Qué pasa (verificado):** tras cambiar a EN quedan 15 cadenas españolas visibles en la historia y la nav sigue anunciándose como «Principal». PRODUCT.md exige «Spanish and English are equally supported».
- **Arreglo:** añadir `data-i18n-attr="aria-label:nav.label"` (o similar) y extender `apply()` para atributos; poner `data-i18n` a los textos de las réplicas (`mini.size`, `mini.lock`, …) — si el plugin real es bilingüe, la réplica debe seguir el idioma; si solo existe en español, añadir una nota visible «Panel del plugin (en español)».

#### M3. Sliders: valor sin unidades para lectores de pantalla y anuncios duplicados
- **Dónde:** `site/index.html:71-99`, `site/assets/app.js:210-219`.
- **Qué pasa:** el árbol de accesibilidad expone `slider "Frecuencia": "28"` (sin «LPI»/«°») y cada `<output>` tiene rol implícito `status` (live region), así que cada pulsación de flecha se anuncia dos veces.
- **Arreglo:** en `syncDemo`, `lpiIn.setAttribute("aria-valuetext", \`${demo.lpi} LPI\`)`, idem `°` para el ángulo; y `aria-hidden="true"` en los `<output>` (o `aria-live="off"`).

#### M4. Objetivos táctiles por debajo de 44 px en los controles principales de móvil
- **Dónde:** `site/assets/styles.css:134` (range `height: 28px`), `:138` (`.seg button { min-height: 34px }`), `:72` (`.lang { min-height: 36px }`, 42×36), `:85` (`.btn-small` 36 px; medido 97×40), `:68` (enlaces de nav 33 px).
- **Qué pasa:** todos superan el mínimo AA de WCAG 2.2 (2.5.8, 24 px), pero quedan por debajo de los 44 px recomendados (WCAG 2.5.5 AAA / Apple HIG) justo en la demo, que es el control más "tocable" de la página. Los botones de forma miden 48-62×34 en 375 px.
- **Arreglo:** dentro de `@media (pointer: coarse)`: `.demo input[type=range]{height:44px}`, `.seg button{min-height:44px}`, `.lang{min-height:44px;min-width:44px}`.

#### M5. Pista de los sliders casi invisible (contraste no textual 1,15:1)
- **Dónde:** `site/assets/styles.css:134` (`accent-color: var(--k)` deja la pista no rellena en el gris por defecto de Chromium ≈ `#efefef` sobre `#fff`).
- **Qué pasa:** WCAG 1.4.11 pide 3:1 para los componentes de UI; la parte rellena (K) cumple, la pista restante no; con valores bajos («Negro 5») el control casi no se ve como slider.
- **Arreglo:** estilizar `::-webkit-slider-runnable-track` / `::-moz-range-track` con `height:2px; background: var(--k)` (coherente con las reglas de 1,5 px) y thumb cuadrado K de 16 px (más "plancha" que la bola por defecto).

#### M6. Coste de render: ~14 000 instancias y `art()` recalculados en CPU cada frame
- **Dónde:** `site/assets/app.js:289-375`, en especial `:324-371`.
- **Qué pasa:** el bucle recalcula color y matriz de cada punto (hasta `side²` ≈ 13 900 con 60 LPI) en cada `requestAnimationFrame`, aunque el scroll, la demo y el tiempo estén quietos. En móviles medios esto supone batería y jank de scroll; y sigue renderizando a 60 fps en la portada indefinidamente.
- **Arreglo:** cachear `art()` por celda cuando cambien `lpi/angle` (el póster es estático), y saltarse el frame si `|scrollP()-pS| < 1e-3`, la demo no cambió y `s.float === 0`/`reduceMotion`. Pausar con `IntersectionObserver` cuando ni `.hero` ni `.story` están en viewport (hoy solo se oculta tras la historia, `:294`).

#### M7. La historia es muy larga y con mucho vacío
- **Dónde:** `site/assets/styles.css:157` (`.story-head` con `padding: 44vh 0 4vh`), `:158` (`.step { min-height: 92vh; padding: 8vh 0 }`), `:276` (80vh en móvil).
- **Qué pasa:** ~6 pantallas de scroll para 5 párrafos de ~35 palabras; en `web-desktop-00-storyhead.png` el titular aparece con medio viewport negro vacío encima. Funciona como narrativa cinematográfica, pero para un diseñador que busca "¿es gratis? ¿dónde descargo?" es fricción, más aún sin navegación en móvil (A2).
- **Arreglo:** `.story-head{padding:28vh 0 4vh}`, `.step{min-height:72vh}` en desktop y `64vh` en móvil; o añadir un indicador de progreso 01-05 fijo junto al póster que permita saltar pasos.

#### M8. Mobiliario de la portada se cruza con la escena al entrar en la plancha negra
- **Dónde:** `site/assets/styles.css:105` (`.hero .colorbar` absoluta), `:90-98` (marcas de corte y slug en K), `site/assets/app.js:19-21` (cambio a `.dark`).
- **Qué pasa:** al empezar la historia, la barra de color de la portada queda visible sobre fondo negro **con el parche K invisible** (hueco) y cruzando el póster 3D (`web-desktop-00-storyhead.png`, `web-mobile-01-storyhead.png`); las marcas de corte K desaparecen sobre K. Se lee como un glitch, no como un pliego.
- **Arreglo:** `body.dark .hero .colorbar .k { box-shadow: inset 0 0 0 1.5px var(--paper); }` y `body.dark .crop, body.dark .slug, body.dark .reg { color: var(--paper); border-color: var(--paper); }`; o terminar la portada con un borde sólido papel de ~40 px antes de que empiece la plancha negra.

### BAJO

- **B1. Corte de palabra «Open-/DTF»** en el lead de "Por qué" a 1440 px (`web-desktop-06-why.png`). `site/index.html:168` (y en general cualquier aparición de la marca en texto corrido). Arreglo: usar guion no separable `Open‑DTF` (U+2011) en los textos, o `<span class="nowrap">Open-DTF</span>` con `.nowrap{white-space:nowrap}`; en `i18n.js` aplicar lo mismo a las cadenas EN.
- **B2. Copy EN ambiguo:** «Try it here: move the screen» (`site/assets/i18n.js:11`) suena a "mueve la pantalla". «Screen» como "trama" es jerga de serigrafía; en `s2.t` «Pick the screen» tiene el mismo problema. Arreglo: «Try it: drag to change the halftone» y «Pick the halftone pattern and press Prepare».
- **B3. «0 € para siempre»** (`site/index.html:170`): el euro sitúa la oferta en España; para LATAM (público hispanohablante amplio) resulta ajeno, y en EN dice «Free, forever». Arreglo: «Gratis para siempre».
- **B4. Discrepancia DESIGN.md ↔ realidad de contraste:** K sobre magenta es **4,63:1**, no 5,4:1 (`DESIGN.md:211`, `:298`); K sobre cian 7,78:1, no 8:1 (`DESIGN.md:208`). Sigue cumpliendo AA para texto normal, pero el doc da un margen que no existe. Arreglo: corregir cifras en DESIGN.md; no bajar del tamaño actual (22 px/600) en magenta.
- **B5. CSS muerto:** `.demo-switch`, `.switch` (`site/assets/styles.css:144-150`) y `.scroll-cue` (`:152`, `site/index.html:101`) no se usan; DESIGN.md (línea "interruptor activo del demo") describe un switch amarillo que no existe. Arreglo: eliminar o volver a introducir el switch (p. ej. "Knockout on/off").
- **B6. Movimiento residual en reduced-motion:** la rotación del icono del FAQ (`styles.css:242`), el desplazamiento de `.ct-links a:hover` (`:253-254`), el `scale(.98)` de `.btn:active` (`:79-82`) y el fundido de `.nav` siguen activos con `prefers-reduced-motion`. Son microinteracciones aceptables, pero el bloque `@media (prefers-reduced-motion)` (`:289-294`) podría cubrirlas con `transition-duration: .01ms`.
- **B7. Elementos de 3D sin alternativa textual:** el canvas es `aria-hidden` (`site/index.html:23`), bien, pero la demo no describe su efecto. Añadir a `.demo` un `aria-describedby` a un texto `sr-only`: «La vista previa 3D a la derecha muestra la trama con estos ajustes».
- **B8. SEO/compartir:** no hay `og:image`, `twitter:card`, `link rel="canonical"` ni versión EN indexable (`hreflang`); el EN solo existe tras JS. `theme-color` fijo papel aunque media página sea negra. Arreglo: `og:image` 1200×630 con la trama, `canonical`, y (si se quiere SEO en inglés) una `/en/` estática.
- **B9. Artefacto visual a confirmar:** en la portada desktop el póster muestra una muesca rectangular sin puntos en su esquina superior derecha (`web-desktop-hero.png`, `web-desktop-en-hero.png`, ~x 1047, y 215-330). No hay ningún elemento DOM encima (`elementsFromPoint` solo devuelve `.hero`), así que es del propio render; puede ser un artefacto de SwiftShader. Verificar en GPU real.
- **B10. Rejilla 3×2 de "facts" de igual peso** (`site/assets/styles.css:215-218`): es el único patrón "plantilla SaaS" de la página y DESIGN.md rechaza la "fila de tarjetas iguales". Arreglo de diseño: dar más peso al primero ("0 €/Gratis" y "MIT" son la oferta; PRODUCT.md principio 1) — p. ej. los dos primeros a ancho doble con `dt` en tamaño Headline, y los cuatro restantes como lista compacta.
- **B11. Enlaces del pie a 14 px de alto** (`site/index.html:242`): exentos de 2.5.8 por ser en línea, pero en móvil «Mohammad Rajabloo» y «CC BY 4.0» quedan muy juntos. `line-height: 1.8` en `.foot-credit` (`styles.css:263`) mejora el toque.

---

## Lo que funciona bien (no tocar)

- Concepto "Check Print" ejecutado con rigor: marcas de corte, diana, slug con datos reales, barra de color; campos de tinta a página completa (amarillo/cian/magenta) que dan ritmo y wayfinding sin iconografía genérica.
- Tipografía: contraste de peso 800/300 en la misma familia; `text-wrap: balance/pretty`; medida de línea correcta (30-44 em).
- La escena 3D (póster → trama → knockout → camiseta) explica el producto mejor que cualquier texto; réplicas del panel creíbles.
- Foco visible en **todos** los elementos (3 px K, papel sobre plancha negra, magenta en el segmentado). Verificado tras asentarse el scroll: K sobre papel 18:1, sobre cian 7,8:1, sobre magenta 4,6:1 (≥3:1 exigido).
- Skip link funcional, landmarks (`header`, `nav`, `main`, `footer`, secciones con `aria-labelledby`), headings en orden h1→h2→h3 sin saltos, SVG decorativos `aria-hidden`, botones de forma con `aria-pressed`, FAQ con `<details>` nativo operable con Enter/Espacio.
- Sin scroll horizontal en 375/768/1440 (`scrollWidth === innerWidth`).
- Reduced-motion: sin animación de registro, pasos a opacidad 1, `scroll-behavior:auto`, sin parallax de puntero ni niveles automáticos en el paso 4.
- i18n: detección por `navigator.language`, persistencia en `localStorage` (verificado tras recarga), `<html lang>`, `<title>`, meta description y fecha de release se actualizan.
- Descarga con API OK: muestra `v1.3.0 · 16 de octubre de 2026` y apunta al asset exacto.

## Contraste: pares de tokens (WCAG 2.1)

| Par | Ratio | AA texto normal (4,5) | AA texto grande / UI (3) |
|---|---|---|---|
| `--k` #0b0b0c / `--paper` #f4f5f3 | 17,99 | ✔ | ✔ |
| `--paper` / `--k` (historia) | 17,99 | ✔ | ✔ |
| `.step p` papel 82 % (#cacbc9) / K | 12,08 | ✔ | ✔ |
| K / `--y` #ffe600 | 15,52 | ✔ | ✔ |
| K / `--c` #00aeef | 7,78 | ✔ | ✔ |
| K / `--m` #ec008c | 4,63 | ✔ (justo) | ✔ |
| K / #fff (demo) | 19,67 | ✔ | ✔ |
| papel / #26262a (hover btn) | 13,78 | ✔ | ✔ |
| Réplica: #ebe9e4 / #2b2b2b | 11,67 | ✔ | ✔ |
| Réplica: muted #a09e99 / #2b2b2b | 5,29 | ✔ | ✔ |
| Réplica: #06233a / #3a9cf0 (botón) | 5,49 | ✔ | ✔ |
| Réplica: #8fd2a9 / #1f3a2d («En vivo», 10 px) | 7,03 | ✔ | ✔ |
| Foco magenta / #fff (segmentado) | 4,25 | — | ✔ |
| Pista del range ≈#efefef / #fff | 1,15 | — | ✘ (M5) |
| `tint-50` #858587 / papel (solo barra de color) | 3,37 | n/a (decorativo) | — |
| Texto de pasos con `opacity .25` (fuera de foco) | ~2,3 | ✘ (intencional, transitorio) | — |

Nota: el texto de la portada sobre la escena 3D (A3) no tiene un ratio fijo; depende del punto que quede detrás.

## Matriz QA

| Prueba | 1440 | 768 | 375 | Resultado |
|---|---|---|---|---|
| Carga sin errores JS (CDN OK) | ✔ | ✔ | ✔ | Solo avisos de rendimiento de SwiftShader. |
| Carga con CDN bloqueado | ✘ | ✘ | ✘ | C1/C2: historia invisible, demo muerta, sin fallback CSS. |
| Toggle ES↔EN (clic y Enter) | ✔ | ✔ | ✔ | Persistencia OK; restos sin traducir (M2). |
| Demo: sliders ratón y flechas | ✔ | ✔ | ✔ | 60 LPI / 110 / Línea aplicados; flecha → 34°. |
| Demo: restricción negro<blanco−20 | ✔ | — | — | Se corrige sola sin feedback (aceptable). |
| FAQ abrir/cerrar con teclado | ✔ | ✔ | ✔ | Icono + → ×. |
| Orden de tabulación | ✔ | ✔ | ✔ | Skip → logo → nav → EN → Descargar → CTAs → demo → descarga → FAQ → contribuir → créditos. |
| Foco visible | ✔ | ✔ | ✔ | En todos los fondos. |
| Descarga (API OK) | ✔ | ✔ | ✔ | v1.3.0 + fecha localizada. |
| Descarga (API 404/caída) | ✘ | ✘ | ✘ | A1: mensaje falso, enlace al README. |
| Scroll horizontal | ✔ | ✔ | ✔ | Ninguno. |
| Reduced motion | ✔ | — | — | Ver B6 (microtransiciones). |
| CTA de descarga accesible desde la cabecera | ✔ | ✔ | ✘ | A2. |

---

## Quick wins (≤ 30 min cada uno)

1. **`.btn-ghost { background: var(--paper); }`** — `styles.css:83`. Protege «Ver el código» sobre la trama (A3c).
2. **Opacidad completa solo al interactuar con la demo** — `app.js:229`: sustituir el `IntersectionObserver` por `focusin/pointerdown` → `true` y `focusout/pointerleave` → `false` (A3a).
3. **Mostrar el botón de descarga en móvil** — `styles.css:285`: borrar la regla o reducir a icono con `aria-label` (A2).
4. **No sobrescribir el enlace de descarga si la API falla por red/límite** — `app.js:36-38, 51-54`: guardar `r.status` y solo entrar en el modo "sin release" con `404` (A1).
5. **Mover `syncDemo` y los listeners fuera de `if (renderer)`** — `app.js:207-226` (C2, mitad).
6. **Red de seguridad CSS para la historia sin JS/WebGL:** `<html class="no-js">` + script inline que lo cambia a `js`, y `.no-js .story, .no-webgl .story{background:var(--k)} .no-js .step{opacity:1;transform:none}` (C1, mitad).
7. **`aria-label` dinámico y `lang` del toggle** — `i18n.js:79-80` (M1).
8. **`aria-valuetext` en los sliders + `aria-hidden` en `<output>`** — `app.js:215-218`, `index.html:74,79,93,98` (M3).
9. **Guion no separable en «Open‑DTF»** dentro de textos corridos — `index.html:168` y `i18n.js:25` (B1).
10. **Copy EN:** «Try it: drag to change the halftone» — `i18n.js:11` (B2).
11. **Pista de range visible** con `::-webkit-slider-runnable-track{background:var(--k);height:2px}` — `styles.css:134` (M5).
12. **Corregir cifras de contraste en `DESIGN.md:208,211,298`** (B4).

## Capturas de referencia

- Portada: `web-desktop-hero.png`, `web-desktop-en-hero.png`, `web-tablet-hero.png`, `web-mobile-hero.png`
- Historia: `web-desktop-00-storyhead.png` … `web-desktop-05-stepplateall.png`, `web-mobile-03-stepplatey.png`
- Secciones: `web-desktop-06-why.png`, `web-desktop-07-download.png`, `web-desktop-faq-open.png`, `web-desktop-09-contrib.png`, `web-desktop-10-foot.png`
- Fallos: `web-nocdn-hero.png`, `web-nocdn-step2.png`, `web-nocdn-story.png`, `web-api404-download.png`, `web-mobile-00-demo.png`
- Foco: `web-desktop-tab1-skip.png`, `web-desktop-tab-focus-lang.png`, `web-focus-*.png`
- Página completa: `web-desktop-full.png`, `web-tablet-full.png`, `web-mobile-full.png`
- Reduced motion: `web-reduced-hero-early.png`, `web-reduced-step4.png`

Todas en `(scratchpad de la sesión)/audit/shots/`.
