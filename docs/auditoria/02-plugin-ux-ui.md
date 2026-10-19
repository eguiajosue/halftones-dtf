# 02 · Auditoría UX/UI del panel UXP «Open-DTF»

Fecha: 2026-10-19 · Revisión de solo lectura (no se editó nada del repo) · Metodología: GStack `/plan-design-review` + `/design-review` (ojo de diseñador: jerarquía, arquitectura de información, estados, feedback, copy, consistencia, accesibilidad, densidad, detección de «AI slop») + WCAG 2.1 AA básico.

**Alcance:** `index.html`, `styles.css`, `src/main.js`, `src/ui/*.js`, `manifest.json`, `assets/icons/`. También `src/state.js`, `src/presets.js`, `src/ps/events.js` y `src/ps/pipeline.js`, porque ahí están los textos de error y las transiciones de fase. `main.js` en la raíz es el bundle generado y coincide con `src/` en los textos revisados.

**Nota sobre la intención:** `DESIGN.md` y `PRODUCT.md` describen **la web** (`site/`): papel frío, tintas de proceso y radio de 2 px. No describen el panel. Lo único que dicen del panel son los tokens `panel-replica-*`, que «son producto, no estilo de la web». **El plugin no tiene un documento de diseño propio.** El único sistema escrito es el comentario de cabecera de `styles.css:1-3`: escala de 4 px, un acento, secciones planas con reglas finas y nada de gap/grid.

---

## Capturas (aproximadas)

Las capturas se hicieron en Chromium (Playwright 1.56.1 + `/opt/pw-browsers`) con `index.html` y `styles.css` reales. **Tienen dos limitaciones importantes:**

- Chromium no renderiza los `sp-*`: `sp-button`, `sp-picker`, `sp-checkbox`, `sp-action-button` y `sp-divider` se dibujaron con un *shim* CSS aproximado. Sus colores y alturas no son los de Spectrum UXP.
- `main.js` no se ejecuta, porque necesita `require("photoshop")`. El cambio de paso y el movimiento de los bloques compartidos se simularon a mano.

En las capturas, los sliders de Frecuencia y Ángulo aparecen con dos asas. Es un error de la simulación: en el plugin real tienen una sola. Las fuentes `Geist`/`Instrument Serif` tampoco existen en UXP, así que en Photoshop el panel usará la fuente del sistema (Segoe UI o SF).

Carpeta: `/tmp/claude-0/-home-user-halftones-dtf/ab514123-9b8b-47f6-8625-3f468da08add/scratchpad/audit/shots/`

| Captura | Qué muestra |
|---|---|
| `panel-230-step1-dark(-full).png` | Ancho mínimo (230): la insignia de fase pasa a otra línea, el selector de unidad baja a su propia línea y «Diamante» se recorta. |
| `panel-280-step1/2-dark(-full).png` | Ancho típico acoplado. Hay una doble regla bajo la barra de presets. |
| `panel-300-step2-dark-banners.png` | Bloqueo + error + «Actualizando» a la vez: la cabecera crece a dos líneas, los avisos ocupan 173 px y el área útil baja de 501 a 328 px. El error es técnico y está en inglés. |
| `panel-300-step2-light.png` | Tema claro simulado: campos oscuros sobre fondo claro, asas de slider invisibles y «Restablecer» con contraste de 2,56:1. |
| `panel-360-*`, `panel-620-*` | Flotante y ancho: a 620 se reparte en dos columnas y la de Semitono queda con mucho hueco. |

Mediciones automáticas (`render.js` y `busy.js` están en la carpeta `audit/`):

- **Salto de cabecera:** cuando aparece «Actualizando», `.hdr` pasa de 45 a 62 px en anchos de **280–340 px**. El ancho acoplado por defecto es **300**, así que el panel salta 17 px en cada arrastre de slider.
- **Cromo fijo:** cabecera + presets + pie suman unos 139–148 px de 640.
- **Paso 2:** el contenido mide unos 1060 px sobre 500 visibles, es decir, más de dos pantallas de scroll a 280–360 px.

---

## Puntuaciones (0–10)

| Dimensión | Nota | Resumen |
|---|---|---|
| Jerarquía visual | **7** | CTA único y claro en el pie, secciones con títulos reales y un solo acento. Penalizan la doble regla superior, el wordmark grande para un panel y los tamaños de 10 px. |
| Arquitectura de información | **6** | El flujo en 2 pasos es correcto. Pero «Acabado» está bajo «edición en vivo» aunque no es en vivo, «Vista» abre el paso 2 por encima de los controles y los presets están sobre ambos pasos sin etiqueta. |
| Estados (carga/vacío/error/éxito/deshabilitado) | **4** | Falta estado durante Preparar/Aplicar. El bloqueo no bloquea y pierde cambios. Knockout desactivado no atenúa los colores. «Borrar» está activo sobre «Default». El vacío «sin documento» es débil. |
| Feedback | **5** | Hay banners con tipos y autocierre. Pero los errores son técnicos, el aviso de carga hace saltar el layout, los mensajes empujan el contenido y faltan cierre manual y confirmaciones. |
| Copy / microcopy | **6** | El español es claro en general. Mezcla Spanglish (Knockout, Default, preset, de-fringe), tiene textos crípticos («fuerza el semitono») y un mensaje de éxito roto (««- Prepped»»). |
| Consistencia | **6** | La escala de 4 px se respeta. Pero hay tres patrones de botón (sp-action-button, div `.link`, div `.seg-btn`), dos indicadores «en vivo», textos duplicados con puntuación distinta y un icono distinto de la marca. |
| Accesibilidad (WCAG AA) | **3** | Los segmentados, «Restablecer», las muestras de color y los sliders son `div` sin foco ni rol. Los inputs no tienen etiqueta asociada, falta `lang` y hay texto de 10 px. El tema claro falla. |
| Densidad / panel estrecho | **6** | Funciona a 280–360. A 230 hay recortes y saltos de línea, y el paso 2 obliga a más de dos pantallas de scroll. Gutter horizontal de 28 px por lado. |
| Temas de Photoshop (claro/oscuro) | **3** | Los colores de campo, las etiquetas y las asas están fijos para tema oscuro. El manifest declara iconos para temas claros, pero el CSS no los acompaña. |
| «AI slop» (10 = nada de slop) | **8** | Diseño contenido y sin adornos. Restos menores: fuentes declaradas que no existen en UXP, clase `.eyebrow` que no es un eyebrow, comentarios de diseño grandilocuentes y píldoras de estado decorativas. |
| **Global** | **5,4** | Base visual sólida. Fallan los estados, la accesibilidad y el tema claro. |

---

## Hallazgos por severidad

Formato: **[Severidad] Título** — `archivo:línea` — problema → arreglo. Todos los arreglos son compatibles con UXP: sin gap/grid, sin `toggleAttribute` y sin `classList.toggle(x, bool)`.

### Críticos / Altos

**H1 · [Alta] El bloqueo no bloquea y los cambios hechos durante el bloqueo se pierden** — `src/main.js:136-139`, `src/main.js:72-85`, `styles.css:145`
- **Problema:**
  - Con `uiLocked`, `.locked` solo pone `opacity:.4`. Todos los controles siguen siendo operables: sliders, segmentados, presets y muestras.
  - Cada control modifica `S`, pero `touch()` sale sin registrar nada en `dirty`.
  - Al volver al documento, `unlock()` no resincroniza. La UI muestra unos valores y el documento de trabajo tiene otros hasta el siguiente cambio.
  - Además `htBlock` y `koBlock` viven dentro de `#step2`, pero la barra de presets no, así que cargar un preset durante el bloqueo también se pierde.
- **Arreglo:**
  - En `unlock()`, añadir `touch(...live.ALL_KINDS)` tras quitar el bloqueo.
  - Bloquear la interacción con `.locked { opacity:.4; pointer-events:none; }` (verificar `pointer-events` en la versión UXP objetivo). Si no está disponible, hacer que cada handler salga pronto con `if (uiLocked) return;` antes de mutar `S`.
  - Deshabilitar también `btnPresetSave`/`btnPresetDel` y el picker mientras dure el bloqueo.

**H2 · [Alta] La cabecera salta 17 px cada vez que aparece «Actualizando»** — `index.html:17-18`, `styles.css:43-53`
- **Problema:**
  - A 280–340 px (el acoplado por defecto es 300, `manifest.json:34-37`), mostrar `#busy` junto a «2 · Ajustar en vivo» no cabe en una línea, y `.hdr { flex-wrap: wrap }` lo baja.
  - El panel entero se desplaza durante cada arrastre, justo cuando el usuario mira el lienzo.
- **Arreglo:**
  - No alternar `hidden`. Reservar el espacio: dejar siempre una sola etiqueta de estado y cambiar su texto y clase («2 · En vivo» ↔ «Actualizando…»).
  - O, alternativa CSS, dar a `#busy` `visibility:hidden` en lugar de `display:none`. Para ello, añadir `.invisible { visibility: hidden; }` y usarla en `pump()` (`src/main.js:145,155`).
  - Acortar el texto del paso 2 a «2 · En vivo».
  - Mostrar el aviso de carga solo si la actualización dura más de unos 250 ms (`setTimeout` en `pump`) para evitar el parpadeo.

**H3 · [Alta] No hay estado de carga en Preparar ni en Aplicar, y el panel sigue editable** — `src/main.js:272-310`
- **Problema:**
  - Solo se deshabilita el botón, con la misma etiqueta. Durante `runPrep` (`phase RUNNING`) se pueden cambiar ajustes y presets. Esos cambios no entran en la preparación, que se hace con una copia `{...S}`, ni se aplican después, porque `touch` exige ACTIVE.
  - En Aplicar, el bucle `while (pumping)` espera sin ningún aviso.
- **Arreglo:**
  - Cambiar la etiqueta durante la operación: `$("btnRun").textContent = "Preparando…"` / `"Aplicando…"`, y restaurarla en `finally`.
  - Añadir la clase `.locked` a `.cards` y a `.presetbar` mientras dure la operación.
  - Mostrar `message("Preparando el documento de trabajo…")` (info, sin autocierre) y reemplazarlo al terminar.
  - Al pasar a ACTIVE, ejecutar `touch(...live.ALL_KINDS)` si `S` cambió durante la preparación.

**H4 · [Alta] Los errores muestran texto técnico, en inglés y con el nombre del paso interno** — `src/ps/pipeline.js:124`, `src/ps/bp.js:22,25`, `src/main.js:52`
- **Problema:** el usuario ve, por ejemplo: `selectAllLayers,newPlacedLayer: The command "Convert to Smart Object" is not currently available. [paso: objeto inteligente ART]` (ver la captura `banners`). No explica qué ocurrió ni qué hacer.
- **Arreglo:**
  - En `fail()`, mostrar una frase humana con acción y mandar el detalle a la consola: `message("No se pudo preparar el documento. Comprueba que tiene al menos una capa visible y vuelve a intentarlo.", "error")` + `console.log(m)`.
  - Mapear los errores conocidos a mensajes claros, por ejemplo: documento en modo Bitmap/Indexado, capa de fondo bloqueada o recurso de semitono ausente.
  - Si se quiere conservar el detalle, ponerlo detrás de un enlace «Detalles» que lo muestre bajo el mensaje.

**H5 · [Alta] Segmentados, «Restablecer» y muestras de color no son accesibles por teclado** — `index.html:61-66, 76, 108-112, 138-143, 162, 166`, `styles.css:115-127`
- **Problema:**
  - Son `div` con `click`: sin foco, sin rol, sin `aria-pressed`/`aria-checked` y sin estilo de foco.
  - Los sliders (`src/ui/levelsSlider.js:186-192`) solo responden a `mousedown`. Esto queda mitigado porque cada slider tiene un campo numérico con flechas.
  - Falla WCAG 2.1.1 (Teclado) y 4.1.2 (Nombre, función, valor).
- **Arreglo, opción preferente:** usar widgets Spectrum nativos de UXP, que ya traen foco y estado:
  ```html
  <div class="seg" id="segHtType" role="radiogroup" aria-label="Forma del punto">
    <sp-action-button quiet class="seg-btn" data-value="ROUND">Punto</sp-action-button>…
  ```
  marcando el activo con `setAttribute("selected","")`. Para «Restablecer»: `<sp-action-button quiet size="s" id="btnDefaults">Restablecer tonos</sp-action-button>`.
- **Arreglo mínimo:**
  - En los `div`, añadir `tabindex="0" role="radio"` y `aria-checked` en `setSeg()`, más un `keydown` para Enter, Espacio y flechas.
  - Añadir `.seg-btn:focus, .sw:focus, .link:focus { outline: 2px solid var(--accent); outline-offset: -2px; }`.
  - Verificar la compatibilidad de `tabindex` en `div` con la versión UXP mínima (23.3).

**H6 · [Alta] El tema claro de Photoshop está roto** — `styles.css:17-23, 65-66, 135`
- **Problema:**
  - `--field-bg:#373737` y `--field-fg` son fijos. En los temas «light/lightest» quedan campos negros sobre un panel claro.
  - Las asas `.handle` tienen `background:#f4f4f4` con borde `var(--bg)`, así que sobre fondo claro son invisibles.
  - `.link` en `#3a9cf0` sobre `#f0f0f0` da **2,56:1**, por debajo de 4,5:1.
  - Las etiquetas verde y azul tienen fondos oscuros fijos.
  - El manifest (`manifest.json:57-69`) sí declara iconos para temas claros, así que el soporte claro está previsto pero no está terminado.
- **Arreglo:**
  - Derivar los tokens del host. Por ejemplo, `--field-bg: var(--uxp-host-widget-hover-background-color, #373737)`, o definir los campos con alfa sobre `--bg` (verificar el problema de alfa en `input` que comenta la línea 20).
  - Añadir un bloque `@media (prefers-color-scheme: light)` (UXP lo expone según el tema de Photoshop):
    ```css
    @media (prefers-color-scheme: light) {
      :root { --field-bg:#ffffff; --field-fg:#1d1d1d; --field-line:#8e8e8e; --accent:#0d66d0; }
      .slider .handle { background:#ffffff; border-color:#6e6e6e; }
      .tag-green { color:#12603a; background:#d6f0e0; border-color:#d6f0e0; }
      .tag-blue  { color:#0b4a8a; background:#dbeafb; border-color:#dbeafb; }
    }
    ```
    `#0d66d0` sobre `#f0f0f0` da unos 5,0:1.

### Medios

**M1 · [Media] «Borrar» preset no pide confirmación, está activo sobre «Default» y reinicia los ajustes sin avisar** — `index.html:25`, `src/main.js:427-436`
- **Problema:**
  - Borra al instante y luego llama a `onPresetChange()`, que sobrescribe todos los ajustes actuales con Default y los aplica en vivo.
  - Sobre «Default» el botón sigue activo y solo responde con un aviso.
- **Arreglo:**
  - Ejecutar `setDisabled($("btnPresetDel"), name === "Default")` en `refreshPresets`/`onPresetChange`.
  - Pedir confirmación con un `dialog` como el de guardar: «¿Borrar el preset "X"? Tus ajustes actuales no cambian.».
  - Tras borrar, **no** recargar los ajustes: solo seleccionar Default en el picker.

**M2 · [Media] Guardar preset: sin Intro, sin aviso de nombre vacío y sobrescribe sin preguntar** — `src/main.js:259-269, 417-426`, `index.html:173-183`
- **Problema:**
  - Con el nombre vacío no pasa nada.
  - Si el nombre ya existe, se sobrescribe en silencio.
  - Intro no confirma.
  - El título está duplicado: `title` del modal y `sp-heading`.
- **Arreglo:**
  - Añadir `$("dlgPresetName").addEventListener("keydown", e => { if (e.key === "Enter") $("dlgPresetOk").click(); })`.
  - Deshabilitar «Guardar» mientras el nombre esté vacío.
  - Si el nombre existe, cambiar el botón a «Reemplazar».
  - Rellenar el campo con el nombre del preset actual, salvo «Default».
  - Quitar `sp-heading` o el `title`.

**M3 · [Media] Cargar un preset descarta los cambios sin guardar sin avisar** — `src/main.js:250-257`
- **Problema:** no hay ningún indicador de «modificado».
- **Arreglo:**
  - Guardar una firma `JSON.stringify(S)` al cargar y mostrar «Default •» o «(modificado)» junto al picker cuando difiera.
  - Si al cambiar de preset hay cambios, mostrar el aviso: «Se descartaron los cambios sin guardar.».

**M4 · [Media] Knockout desactivado no desactiva sus controles, y «Mismo color» es confuso** — `index.html:159-170`, `src/main.js:190-194, 359-366`
- **Problema:**
  - Con «Eliminar un color» desmarcado, las muestras y «Mismo color» siguen activas.
  - Con «Mismo color» marcado, las dos muestras son clicables y editar cualquiera cambia ambas.
  - Las muestras no muestran el valor (hex), solo `title`.
- **Arreglo:**
  - En `syncColors()`, ejecutar `setClass($("koBlock").querySelector(".colors"), "locked", !S.knockout)`.
  - Con `linked`, ocultar la muestra «Prenda» o atenuarla con `pointer-events:none`.
  - Reescribir el copy: «La prenda es de este mismo color».
  - Mostrar el hex bajo cada muestra (`.color-lbl`: «Eliminar · #000000»).

**M5 · [Media] Los ajustes de «Acabado» no son en vivo pero están dentro del paso «en vivo»** — `index.html:104-116`, `src/main.js:409-414`
- **Problema:** limpieza, de-fringe y trama nativa solo actúan al pulsar Aplicar. El usuario espera verlos en el lienzo.
- **Arreglo:**
  - Añadir la pista `<sp-body class="hint">Se aplica al pulsar Aplicar.</sp-body>` bajo el título «Acabado».
  - Renombrar el título a «Acabado final».
  - En `chkNativeFinal`, indicar el requisito: «(requiere semitono y knockout)», o deshabilitarlo si no se cumple (`src/ps/pipeline.js:155`).

**M6 · [Media] El mensaje de éxito al aplicar está roto** — `src/main.js:304`
- **Problema:** muestra «Listo: se creó el documento «- Prepped».» sin el nombre real.
- **Arreglo:** que `applyPrep` devuelva `name` (`src/ps/pipeline.js:186`) y usar ``message(`Listo: se creó «${name}». El original no se modificó.`, "ok", 5000)``.

**M7 · [Media] Los avisos empujan el contenido, no se pueden cerrar y los errores no caducan** — `index.html:28-29`, `styles.css:69-73`, `src/main.js:37-45`
- **Problema:** bloqueo + error ocupan 173 px de 501 (captura `banners`), y el error queda fijo hasta el próximo mensaje.
- **Arreglo:**
  - Añadir un botón de cierre «×» al `#msg` (`sp-action-button quiet size="s"`).
  - Limitar los banners con `max-height: 72px; overflow-y:auto`.
  - Ocultar `#msg` cuando se muestre `#lockBanner`, que ya es la acción principal.
  - Unificar los dos textos de bloqueo: `src/main.js:49` («…Cancelar.») y `src/ps/events.js:15` («…Cancelar»).
  - Para lectores de pantalla, poner `role="alert"` en el banner de error y `role="status"` en el resto.

**M8 · [Media] Campos de texto sin etiqueta asociada, sin `lang` y sin etiqueta en el selector de unidad** — `index.html:2, 42-48, 81-91, 147, 153`
- **Problema:**
  - `<span class="field-lbl">` no está ligado al `input`.
  - Los `input.num` (LPI, ángulo, sombras) no tienen nombre accesible.
  - `sp-picker#btnUnit` no tiene `label`.
  - Falla WCAG 1.3.1, 3.1.1 y 4.1.2.
- **Arreglo:**
  - Usar `<html lang="es">`.
  - Cambiar `<span class="field-lbl">` por `<label class="field-lbl" for="inW">`.
  - Añadir `aria-label="Frecuencia (LPI)"`, `"Ángulo (grados)"` y `"Realce de sombras (%)"` a los `input.num`.
  - Añadir `label="Unidad"` al picker.

**M9 · [Media] Texto de 10 px en muchos sitios** — `styles.css:62, 91, 110, 112, 127, 153`
- **Problema:** las etiquetas de campo, las etiquetas de estado, las pistas en línea, las muestras y, a menos de 260 px, los segmentados usan 10 px, por debajo de la UI de Photoshop (unos 11–12 px). El contraste del texto atenuado (`#a09e99` sobre `#2b2b2b`: 5,29:1, y sobre campo: 4,45:1) queda justo en el límite.
- **Arreglo:** usar 11 px como mínimo (`.field-lbl`, `.tag`, `.hint-inline`, `.color-lbl`, `kbd`) y no bajar `.seg-btn` a 10 px en el media query.

**M10 · [Media] A 230 px (ancho mínimo) se recorta «Diamante» y la fila de tamaño se rompe** — `styles.css:116-117, 103`, `manifest.json:26-29`
- **Problema:**
  - `.seg-btn` tiene `overflow:hidden` sin elipsis, así que «Diamante» se corta.
  - El picker de unidad baja solo a otra línea.
  - La insignia de fase también se va a otra línea.
- **Arreglo:**
  - Subir `minimumSize.width` a **260**.
  - O añadir `text-overflow: ellipsis` a `.seg-btn` y `title` a cada opción.
  - Usar etiquetas cortas: «Punto · Línea · Diam. · Elipse».
  - Dentro de `@media (max-width:260px)`, poner `.unit{width:56px}` y reducir el padding horizontal de `.slot` a 0.

**M11 · [Media] El tamaño «Lienzo actual a 300 ppi» confunde y no valida** — `src/main.js:102-129`, `index.html:40`
- **Problema:**
  - El texto calcula el tamaño a 300 ppi, no a la resolución del documento. Un archivo de 10 in a 72 ppi aparece como «2.4 in» y el usuario cree que se va a encoger.
  - Un valor no numérico vuelve en silencio al tamaño actual (`:127`).
  - Un valor negativo llega a `resizeImage`.
- **Arreglo:**
  - Mostrar «Lienzo actual: 3000 × 3750 px (10 × 12,5 in a 300 ppi)».
  - Validar con `if (!(v > 0))`: marcar el borde del campo con `.invalid { border-color:#c4524f }`, poner una pista «Introduce un número mayor que 0» y deshabilitar Preparar.
  - Mostrar el resultado en px junto al botón: «Saldrá a 3072 × 3840 px».

### Bajos

**L1 · [Baja] Doble regla bajo la barra de presets.** `styles.css:57` (`border-bottom`) más la `border-top` de la primera `.card` (`:81`) dibujan dos líneas separadas por 12 px.
→ Arreglo: añadir `.step > .slot:first-child > .card { border-top: none; padding-top: 0; }`.

**L2 · [Baja] Dos indicadores «en vivo».** La etiqueta «En vivo» solo aparece en Semitono (`index.html:134`), aunque Tonos, Vista y Knockout también son en vivo, y ya lo dice la insignia de fase.
→ Arreglo: eliminar `#htLive` y dejar la insignia de fase como única fuente.

**L3 · [Baja] La pista de teclado es inexacta.** `index.html:98` dice «±1 · ⇧ ±10», pero Gamma va en pasos de 0,1 y Ángulo en pasos de 0,5 (`src/main.js:356, 388`). Además solo aparece en Tonos.
→ Arreglo: «↑↓ ajustan el valor · ⇧ ×10», o usar un `title` por campo.

**L4 · [Baja] Spanglish y jerga.** «Knockout» (`:158`), «Default» (`src/presets.js:66`), «preset», «de-fringe», «Salida — fuerza el semitono» (`:86`, críptico).
→ Arreglo: «Eliminar color (knockout)», «Predeterminado» (con migración del nombre guardado), «Salida — limita el punto mínimo y máximo», «Eliminar halo».

**L5 · [Baja] «Guardar» junto al picker se confunde con guardar el documento.** `index.html:24`.
→ Arreglo: usar «Guardar preset…» con elipsis porque abre un diálogo, o un `sp-action-button` con icono y `aria-label`.

**L6 · [Baja] «Restablecer» es ambiguo.** Solo restablece los tonos (`src/main.js:396-401`).
→ Arreglo: «Restablecer tonos».

**L7 · [Baja] Separador decimal.** Los valores se muestran con punto («10.24», «11.8 LPC», `src/main.js:108, 167`), aunque el campo acepta coma.
→ Arreglo: formatear con `String(v).replace(".", ",")` en las etiquetas, o mantener el punto en todas partes para ser consistente con Photoshop en tu locale.

**L8 · [Baja] La escritura en vivo del LPI aplica valores intermedios.** `bindNumber(... liveTyping:true)` (`src/main.js:349-356`): al teclear «12» se aplica primero «5» (el 1 limitado al mínimo) y se lanza un re-render pesado.
→ Arreglo: con `liveTyping`, ignorar valores fuera de rango hasta `change`/Intro, o subir el debounce a 400 ms.

**L9 · [Baja] Doble commit con Intro.** `keydown` Enter hace commit y luego `change` vuelve a hacerlo (`src/main.js:208-212`).
→ Arreglo: en Enter, ejecutar `el.blur()` en lugar de `commit()`.

**L10 · [Baja] Asas de slider pequeñas.** Miden 12×16 px (`styles.css:135`), aunque el área de clic es la pista de 24 px.
→ Arreglo: 14×18 px.

**L11 · [Baja] Icono distinto de la marca.** `assets/icons/panel-*.png` y `plugin*.png` son una rejilla de 4×4 puntos. La marca del panel son tres puntos crecientes (`index.html:13`, `styles.css:45-49`). A 23 px la rejilla parece ruido.
→ Arreglo: regenerar con `tools/make_icons.py` usando los tres puntos crecientes, con el último en acento.

**L12 · [Baja] La vista inicial del paso 2 se reinicia siempre a «Prenda».** `src/main.js:284` y `state.js:28`.
→ Arreglo: recordarla con `prefs.set("previewMode", …)`.

**L13 · [Baja] La cancelación de Preparar no avisa.** `runPrep` devuelve `false` (`src/ps/pipeline.js:123`) y la UI no dice nada.
→ Arreglo: `if (!ok) message("Preparación cancelada.", "warn", 3000)`.

**L14 · [Baja] Vacío «sin documento» poco visible.** «Abre un documento para empezar.» aparece como pista gris de 11 px (`src/main.js:102`) y el CTA queda deshabilitado sin explicación junto a él.
→ Arreglo: mostrarlo como `message(..., "info")` persistente, o poner `title` en `btnRun` mientras esté deshabilitado.

---

## Detección de «AI slop» (nivel bajo)
- Fuentes declaradas que UXP no carga (`styles.css:28-30`: Geist, Instrument Serif, Newsreader, Playfair). Son decoración del CSS sin efecto real.
  → Arreglo: reducir a `system-ui, "Segoe UI", "SF Pro Text", sans-serif` y, para la «Open», `Georgia, serif`.
- Clase `.eyebrow` para lo que en realidad es un título de sección: el propio comentario dice «sin mayúsculas decorativas» (`styles.css:84-86`). Es un nombre heredado de plantilla.
  → Arreglo: renombrar a `.section-title`.
- Comentarios grandilocuentes («Modo Operate: la herramienta se aparta de la tarea», `styles.css:1`). Inofensivos.
- Píldoras de estado redondeadas (radio de 9 px) con fondos de color fijos: es el patrón genérico de «badge». Bien usadas aquí, pero suman ruido cuando hay dos o tres a la vez.
- Lo positivo: un solo acento, nada de degradados decorativos, nada de sombras, nada de emojis en la UI y CTA único.

## Contraste medido (tema oscuro, fondo `#2b2b2b`)
| Par | Ratio | AA |
|---|---|---|
| Texto `#ebe9e4` / fondo | 11,67 | OK |
| Atenuado `#a09e99` / fondo | 5,29 | OK (justo) |
| Atenuado / campo `#373737` | 4,45 | **Falla** en texto pequeño |
| Enlace `#3a9cf0` / fondo | 4,85 | OK |
| Texto activo `#06233a` / acento | 5,49 | OK |
| Etiqueta verde / azul | 7,03 / 7,06 | OK |
| Borde de campo `#8c8c8c` / campo | 3,54 | OK (no texto ≥ 3) |
| `--line` (gris 34 % alfa) / fondo | ~1,7 | Separadores decorativos: OK, pero el borde de `.seg` no basta para identificar el control (1.4.11). Subir a unos 0,5 de alfa. |
| Enlace `#3a9cf0` / tema claro `#f0f0f0` | 2,56 | **Falla** |

---

## Quick wins (compatibles con UXP, menos de 30 min cada uno)

1. **Reservar el espacio del aviso de carga** (H2): añadir `.invisible{visibility:hidden}` y usarla en lugar de `hidden` para `#busy` en `src/main.js:145,155`. Acortar la insignia a «2 · En vivo» (`src/main.js:65`).
2. **Resincronizar al desbloquear** (H1): añadir `touch(...live.ALL_KINDS)` al final de `unlock()` (`src/main.js:85`) y `pointer-events:none` en `.locked` (`styles.css:145`).
3. **Corregir el mensaje de éxito** (M6): devolver el nombre desde `applyPrep` y mostrarlo.
4. **Deshabilitar «Borrar» con «Default»** y no recargar los ajustes tras borrar (M1).
5. **Intro para guardar preset** y botón deshabilitado con el nombre vacío (M2).
6. **Etiquetas en los botones durante operaciones largas:** «Preparando…» / «Aplicando…» (H3).
7. **`<html lang="es">`**, `<label for>` en los campos, `aria-label` en los `input.num` y `label="Unidad"` en el picker (M8).
8. **Estilo de foco** para `.seg-btn`, `.sw` y `.link`, más `tabindex="0"` (H5, versión mínima).
9. **Quitar la doble regla superior** (L1) y **eliminar `#htLive`** (L2).
10. **Atenuar las muestras cuando knockout está desactivado** (M4): `setClass(.colors, "locked", !S.knockout)`.
11. **Pista «Se aplica al pulsar Aplicar»** en Acabado (M5).
12. **Mínimo de 11 px** en `.field-lbl`, `.tag`, `.hint-inline`, `.color-lbl` y `kbd` (M9).
13. **`minimumSize.width: 260`** en `manifest.json:27` (M10), o `text-overflow:ellipsis` en `.seg-btn`.
14. **Mensajes de error humanos** con el detalle en la consola (H4): reescribir `fail()`.
15. **Unificar el texto de bloqueo** entre `src/main.js:49` y `src/ps/events.js:15` (M7).

## Recomendación de proceso
Crear `docs/PANEL-DESIGN.md`, o una sección en `DESIGN.md`, con los tokens reales del panel (los `panel-replica-*` ya los recogen), los estados de cada control y el comportamiento en temas claro y oscuro. Hoy el único sistema escrito del plugin es el comentario de `styles.css`, y `DESIGN.md` solo cubre la web.
