# Auditoría Open-DTF — Arquitectura y código del plugin UXP

Metodología: `/plan-eng-review` (arquitectura, flujo de datos, estado, errores, casos límite, carreras, tests) + `/review` (revisión paranoica previa a merge). Alcance: `src/**`, `tools/{build,check_native,package}.js`, `manifest.json`, `package.json`, `.github/workflows/*.yml`, `docs/VERIFICACION.md`, `CONTRIBUTING.md`. Solo lectura; todos los hallazgos se verificaron leyendo el código (commit `7cd078a`). Se comprobó además (en una copia en el scratchpad) que el `main.js` raíz coincide byte a byte con la salida de `tools/build.js` y que todos los módulos de `src/` pasan `node --check`.

> Advertencia de contexto: `docs/VERIFICACION.md` reconoce que el plugin **no se ha ejecutado en Photoshop** y que muchos descriptores (`🔍`) están sin validar. Eso eleva la severidad de todo lo relacionado con recuperación de errores: los caminos de fallo se van a recorrer en la práctica.

---

## Resumen

El diseño general es sensato: un único documento de trabajo duplicado (el original nunca se toca), todo el procesado de píxeles en Photoshop (la regla nativa se cumple: `check_native` da 0 coincidencias y no hay `imaging`/`getPixels`), una cola de cambios "sucios" que coalesce los eventos del slider (último estado gana) y un `executeAsModal` + `suspendHistory` por ajuste en vivo.

Los problemas importantes están en **recuperación de errores y concurrencia**, no en el camino feliz:

1. **Aplicar no tiene rollback**: si falla a mitad (y varios descriptores están sin validar), el documento de trabajo queda rasterizado/destruido, puede quedar un documento «- Prepped» huérfano y el plugin sigue en `ACTIVE` sobre capas que ya no son las que cree.
2. **La trama nativa (método 2) filtra el documento `__ht_tmp`** y su "fallback" al método 1 se ejecuta, según dónde falle, sobre el documento equivocado.
3. **Cancelar no espera al ajuste en vivo en curso y se traga los errores**: puede dejar el «- Prep» abierto y el estado ya reseteado (el plugin pierde la referencia).
4. **Cambios perdidos / Aplicar no es WYSIWYG**: los cambios hechos mientras la UI está bloqueada o tras un error del bucle se descartan y nunca se reaplican; Aplicar solo recalcula la máscara, no reaplica niveles/colores/trama.
5. **Sin guardas de fase durante Aplicar/Cancelar**: los sliders siguen disparando `executeAsModal` que compiten con Aplicar/Cancelar; el panel puede quedar "bloqueado" en reposo.
6. **Rendimiento del realce de sombras**: 6 batchPlay + 2 re-render de filtro inteligente a resolución completa por cada `mousemove`; si el borrado del filtro (sin validar, error silenciado) falla, los filtros se apilan sin límite.

No hay ningún test automatizado de comportamiento (solo la regla nativa y `node --check` de un único archivo). La lógica pura (cola, restricciones de niveles, presets, unidades) es testeable con Node sin Photoshop.

---

## Arquitectura

### Módulos

| Módulo | Rol | Observaciones |
|---|---|---|
| `src/main.js` (470 l.) | Todo lo de UI: cableado, sincronización ajustes→UI, cola en vivo (`touch`/`pump`), flujo Preparar/Aplicar/Cancelar, presets, tamaño, mensajes | "God module". Mezcla controlador de flujo, cola de concurrencia y vista. |
| `src/state.js` | Singleton mutable `state` (fase, IDs de docs/capas, ajustes, vista) | Lo leen/escriben UI **y** capa `ps/` (acoplamiento oculto). |
| `src/ps/bp.js` | `bp()` (batchPlay con chequeo de error), `modal()` (executeAsModal + suspendHistory) | Punto central correcto; le falta rollback. |
| `src/ps/pipeline.js` | runPrep / applyPrep / cancelPrep | runPrep tiene limpieza; applyPrep no. |
| `src/ps/live.js` | `sync(s, kinds)` → aplica solo lo cambiado en un modal | Buena idea de "kinds"; N llamadas batchPlay en serie. |
| `src/ps/mask.js`, `preview.js`, `layers.js`, `screen.js` | Constructores de descriptores / operaciones | Leen `state.layers`/`state.previewMode` globalmente. |
| `src/ps/events.js` | Listener de notificaciones PS → bloqueo/desbloqueo/cierre | No conoce las fases "aplicando"/"cancelando". |
| `src/ui/*` | Slider compuesto, unidades, selector de color | `onCommit` implementado pero nunca usado. |
| `tools/build.js` | Bundler CommonJS casero → `main.js` | Funciona; el error de arranque apunta a un elemento inexistente. |

### Flujo de datos (ajuste en vivo)

```
 mousemove / input / click
        │
        ▼
 ui/levelsSlider.apply()  ──onChange (SIEMPRE, aunque el valor no cambie)──┐
        │                                                                  │
        ▼                                                                  ▼
 main.js callback: muta S (= state.settings)  ───────────────►  touch(kind)
                                                                  │  if (phase!=ACTIVE || uiLocked) return   ← cambio PERDIDO
                                                                  ▼
                                                        dirty:Set  ──►  pump()  (1 bucle, re-entrada bloqueada)
                                                                          │ while dirty: kinds = copia; clear
                                                                          ▼
                                     live.sync(S, kinds) = bp.modal(executeAsModal + suspendHistory(activeDocument))
                                          │ validateState(): ~10 IDs × recorrido DOM de capas
                                          │ setSolid / setLevels / setShadowBoost / replaceHalftone / setHalftoneParams
                                          │ refreshMask(): 3 batchPlay (composite→selección, borrar máscara, crear máscara + vista)
                                          ▼
                                    resumeHistory(hid)  → SIEMPRE commit (también si hubo error)
                                          │
                     PS notifica historyStateChanged/select/open/close
                                          ▼
                    events.js → onLock / onUnlock / onWorkClosed / onIdleChange  (sin conocer Aplicar/Cancelar)

 Preparar: onRun → pipeline.runPrep (phase=RUNNING, eventos ignorados) → ACTIVE
 Aplicar : onApply → espera pumping → pipeline.applyPrep (phase sigue ACTIVE, touch() sigue vivo)
 Cancelar: onCancel → dirty.clear() → pipeline.cancelPrep (NO espera al sync en curso)
```

### Valoración de arquitectura

- **Bien**: separación descriptores/ejecución en `preview.js`/`mask.js` (`previewDescs`, `vis` devuelven descriptores y se envían en lote); coalescencia de cambios por "kind"; documento de trabajo aislado; `bp()` convierte respuestas `_obj:"error"` en excepciones con el nombre del comando.
- **Mejorable**:
  - Estado global compartido: `layers.setShadowBoost` (`src/ps/layers.js:125-132`) lee y escribe `state.layers` y `state.shadowOn`; `mask.js:9,20,33` y `preview.js:9` leen `state.layers`/`state.previewMode`. La capa `ps/` debería recibir un contexto `{ docId, layers, previewMode }` explícito; hoy no se puede probar ni reutilizar sin el singleton.
  - La máquina de estados (`IDLE | RUNNING | ACTIVE`) está repartida entre `state.js`, `main.js` (`uiLocked`, `pumping`, `dirty`) y `events.js`. Faltan fases `APPLYING`/`CANCELLING` y una única función de transición.
  - Código muerto: `createQueue` (`src/util.js:12-29`), `restorePreviewVisibility` (`src/ps/preview.js:23`), `HT_TYPES`/`CLEANUPS` (`src/state.js:10-11`), exportaciones `getWorkDoc` y `applyShadowBoost` sin consumidores externos, `onCommit` del slider (`src/ui/levelsSlider.js:6,75`) nunca se pasa.

---

## Hallazgos

### CRÍTICO

#### C1. Aplicar no tiene rollback: un fallo a mitad destruye el documento de trabajo y puede dejar un documento huérfano
**Dónde**: `src/ps/pipeline.js:149-205`, `src/main.js:297-310`.

**Escenario**: `applyPrep` hace, sin `suspendHistory` ni `try/catch` internos: recalcula máscara → (median/blur/threshold sobre la máscara) → `rasterizeLayer` ART → `delete mask apply:true` → `defringe` 🔍 → `documents.add` → `layer.duplicate(out)` 🔍 → borrar capas → cerrar work. Si cualquier paso posterior a la línea 184 falla (p. ej. `defringe` o `layer.duplicate(doc)`, ambos marcados sin validar en `VERIFICACION.md`):
- ART ya está **rasterizado y con la máscara aplicada**: el trabajo en vivo queda destruido.
- Si falló tras `documents.add` (l.194), queda un documento «- Prepped» vacío/incompleto abierto.
- `state.phase` sigue en `ACTIVE`; el usuario puede seguir moviendo sliders: `setShadowBoost` llama a `removeSmartFilters` (falla en silencio porque ya no es objeto inteligente) y luego `adaptCorrect` **sobre una capa raster → Sombras/Iluminaciones destructivo y acumulativo**.
- `onApply` solo muestra el mensaje.

**Fix**: suspender historial en el documento de trabajo durante la parte destructiva y revertir con `resumeHistory(hid, false)` si falla; cerrar el documento de salida si se creó.

```js
async function applyPrep(s) {
  await modal("Open-DTF: Aplicar", async (ctx) => {
    const work = getWorkDoc();
    app.activeDocument = work;
    const L = state.layers;
    let out = null;
    const hid = await ctx.hostControl.suspendHistory({ documentID: work.id, name: "Open-DTF: Aplicar" });
    let committed = false;
    try {
      await refreshMask(s);
      // ... pasos 1–4 (limpieza, defringe, rasterizar) ...
      out = await app.documents.add({ /* ... */ });
      const copy = await findLayer(work, L.art).duplicate(out);
      for (const l of [...out.layers]) if (l.id !== copy.id) await l.delete();
      await ctx.hostControl.resumeHistory(hid, true); committed = true;
      await work.closeWithoutSaving();
      app.activeDocument = out;
    } catch (e) {
      if (out) { try { await out.closeWithoutSaving(); } catch (_) {} }
      if (!committed) await ctx.hostControl.resumeHistory(hid, false);   // deja ART como estaba
      app.activeDocument = work;
      throw e;
    }
  });
  resetState();
}
```

#### C2. Trama nativa (método 2): `__ht_tmp` se filtra y el fallback corre sobre el documento equivocado
**Dónde**: `src/ps/screen.js:9-47`, `src/ps/pipeline.js:158-161`.

**Escenario**: `nativeScreenMask` duplica el documento (`__ht_tmp`), convierte modos y hace `applyImageEvent` — que según `docs/VERIFICACION.md:17` **ya falló antes con "error de programa"**. No hay `try/finally`:
- Si falla `convertMode` (l.22-31): el documento activo es `__ht_tmp`; el `catch` de `applyPrep` (l.160) llama a `refreshMask(s)` **en `__ht_tmp`**, con IDs de capas del documento de trabajo → error → Aplicar aborta y quedan dos documentos extra abiertos (y, por C1, nada se revierte).
- Si falla `applyImageEvent` (l.36-41): el activo ya es el work, pero `__ht_tmp` nunca se cierra (se filtra un documento por intento), el canal `mask` queda como objetivo y `mapGroup` visible/`halftone` oculto hasta que `refreshMask` lo corrige.

**Fix**:

```js
async function nativeScreenMask({ lpi, angle, htType }) {
  const work = app.activeDocument, L = state.layers;
  let tmp = null;
  try {
    await bp([{ _obj: "hide", null: [layerById(L.halftone), layerById(L.art), layerById(L.shirt)] },
              { _obj: "show", null: [layerById(L.mapGroup)] },
              { _obj: "duplicate", _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                name: "__ht_tmp", merged: true }]);
    tmp = app.activeDocument;
    await bp([/* convertMode ×3 */]);
    app.activeDocument = work;
    await bp([selectArtDesc, { _obj: "select", _target: [channel("mask")], makeVisible: false }, applyImageDesc(tmp.id)]);
  } finally {
    if (tmp && app.documents.some(d => d.id === tmp.id)) await tmp.closeWithoutSaving();
    app.activeDocument = work;
    await bp([{ _obj: "select", _target: [channel("RGB")], makeVisible: false },
              { _obj: "hide", null: [layerById(L.mapGroup)] }, { _obj: "show", null: [layerById(L.halftone)] }]);
  }
}
```

---

### ALTO

#### A1. Cancelar no espera al `sync` en curso y se traga los errores → «- Prep» filtrado y estado perdido
**Dónde**: `src/main.js:312-316`, `src/ps/pipeline.js:138-146`.

**Escenario**: el usuario arrastra un slider (hay un `live.sync` en `executeAsModal`) y pulsa Cancelar. `onCancel` solo vacía `dirty`; no espera a `pumping` (a diferencia de `onApply`, l.301). `cancelPrep` abre otro `executeAsModal` mientras el primero sigue: según la versión de PS, se rechaza ("host is in a modal state") o espera en cola.
- Si se rechaza: el `catch` hace `console.log` y `resetToIdle()` borra `workDocId`/`layers` → **el «- Prep» queda abierto y el plugin ya no sabe que existe**.
- Si espera: tras cerrar el work, el `sync` en vuelo o un `touch` tardío lanza `WRONG_DOC` → `fail` → `lock()` **en fase IDLE** (ver A3).

**Fix**:

```js
async function drainPump() { while (pumping) await new Promise(r => setTimeout(r, 30)); }

async function onCancel() {
  state.phase = "CANCELLING";          // touch() y events.js lo ignoran
  dirty.clear();
  await drainPump();
  try { await pipeline.cancelPrep(); }
  catch (e) { state.phase = "ACTIVE"; return fail(e); }   // no resetear si el doc sigue abierto
  resetToIdle();
}
```
Y en `cancelPrep` resetear solo si `work` ya no está en `app.documents`.

#### A2. Cambios perdidos: con la UI bloqueada o tras un error, el cambio se descarta y nunca se reaplica; Aplicar no es WYSIWYG
**Dónde**: `src/main.js:136-140` (`touch`), `src/main.js:150-151` (`catch { dirty.clear() }`), `styles.css:145` (`.locked` solo es `opacity`), `src/ps/pipeline.js:157`.

**Escenario**:
1. El usuario cambia a otro documento → `lock()`. El panel sigue interactivo (`.locked { opacity: .4 }` no bloquea eventos). Mueve "Negro" de 7 a 30: el callback **muta `S.black`**, la UI muestra 30, pero `touch` retorna sin marcar `dirty`.
2. Vuelve al documento → `onUnlock()` no dispara `pump()`.
3. Pulsa Aplicar: `applyPrep` solo llama a `refreshMask(s)`; no reaplica `setLevels`, colores, sombras ni parámetros de trama → **el resultado usa negro=7 mientras la UI dice 30**.

Lo mismo ocurre cuando una sincronización falla (`WRONG_DOC`, error de descriptor): `dirty.clear()` descarta el lote fallido y los cambios acumulados.

**Fix**: marcar siempre los cambios y reintentarlos al desbloquear; y antes de Aplicar, forzar un `sync` completo si hubo pérdidas.

```js
function touch(...kinds) {
  if (state.phase !== "ACTIVE") return;
  kinds.forEach(k => dirty.add(k));
  if (!uiLocked) pump();
}
// en pump(): catch (e) { if (e.message === "WRONG_DOC") kinds.forEach(k => dirty.add(k)); await fail(e); break; }
function unlock() { if (!uiLocked) return; /* ... */ pump(); }
// en onApply, antes de applyPrep: if (dirty.size) await pump();
```
Opcional (más robusto): guardar `lastApplied = clone(S)` tras cada sync con éxito y, en Aplicar, comparar con `S` y sincronizar los kinds que difieran.

#### A3. Sin guardas de fase durante Aplicar/Cancelar: `executeAsModal` concurrentes y bloqueo "pegado" en reposo
**Dónde**: `src/main.js:136-140, 297-316`, `src/ps/events.js:8-23`, `src/main.js:72-85`.

**Escenario**: durante `applyPrep` la fase sigue en `ACTIVE`, `uiLocked=false` y el paso 2 visible. Un `mousemove` lanza `touch → pump → live.sync` → segundo `executeAsModal` compitiendo con Aplicar. Si llega cuando el work ya está cerrado, `validateState` lanza `WRONG_DOC` → `lock()` tras `resetToIdle()`: `uiLocked=true` en IDLE. En el siguiente Preparar, `touch` ignora todo hasta que alguna notificación de PS llame a `onUnlock` (y `btnApply` sigue deshabilitado).

Además, `events.js` no ignora la fase de Aplicar/Cancelar: al cerrar el work, `onWorkClosed` muestra "El documento de trabajo se cerró." y ejecuta `resetToIdle()` a mitad de `applyPrep`/`cancelPrep` (mensaje de aviso espurio tras pulsar Cancelar).

**Fix**: fases explícitas y un único guardián.

```js
// state.js: phase: IDLE | RUNNING | ACTIVE | APPLYING | CANCELLING
// events.js
if (state.phase !== "ACTIVE" && state.phase !== "IDLE") return;
// main.js onApply
state.phase = "APPLYING"; setClass($("step2"), "locked", true);
try { await drainPump(); await pipeline.applyPrep(S); resetToIdle(); }
catch (e) { state.phase = "ACTIVE"; await fail(e); }
// resetToIdle(): forzar uiLocked=false aunque ya lo esté (quitar el early-return de unlock)
```

#### A4. Realce de sombras: 6 batchPlay + 2 re-render de filtro inteligente por `mousemove`, y apilado ilimitado si el borrado falla
**Dónde**: `src/ps/layers.js:110-132`, `src/main.js:379-381`.

**Escenario**: cada cambio de "Sombras" ejecuta, para ART **y** MAP ART: `delete filterFX _index:1` (🔍, error **silenciado**), `select`, `adaptCorrect` → 6 round-trips y dos recálculos de Sombras/Iluminaciones a resolución completa (con radio 30 px), más el `refreshMask` posterior. En un documento de 6000×8000 px esto son segundos por paso.
Si el descriptor de borrado no es válido (está sin validar), el `catch {}` lo oculta y **cada paso del slider apila otro filtro inteligente**: el efecto se acumula y el rendimiento se degrada sin límite. Además, si el usuario deshace, `state.shadowOn` queda desincronizado.

**Fix**:
1. Aplicar sombras solo al soltar (el slider ya tiene `onCommit`, solo hay que exponerlo):
```js
const createValueSlider = (root, key, { min, max, stepBy = 1 }, onChange, onCommit) =>
  createSlider(root, { /* ... */, onChange, onCommit, /* ... */ });
// main.js
sShadow = sliders.createValueSlider($("sldShadow"), "shadow", { min: 0, max: 100 },
  v => { S.shadow = v.shadow; $("inShadow").value = v.shadow; },   // solo UI
  v => touch("shadow"));                                           // PS al soltar
```
2. No silenciar el borrado: tras `removeSmartFilters`, leer el número de filtros (`get` de `smartObject` → `filterFX`) y lanzar error si no bajó; o, mejor, editar el filtro existente (`set` sobre `filterFX` índice 1 con el nuevo `adaptCorrect`) en lugar de borrar+crear.
3. Agrupar ambas capas en un único `bp([...])`.

#### A5. `modal()` siempre confirma el historial: un error en vivo deja el documento a medias
**Dónde**: `src/ps/bp.js:31-43`, `src/ps/live.js:17-26`.

**Escenario**: `replaceHalftone` crea la nueva capa de motivo y luego `moveAbove`/`old.delete()`. Si falla tras crearla, el `finally` hace `resumeHistory(hid)` (commit): queda una capa "HT PATTERN" huérfana dentro de MAP GROUP, `L.halftone` apunta a la vieja y el semitono sale doble en la máscara. Igual con `setShadowBoost` a medias (ART con filtro, MAP ART sin él → máscara distinta de la vista).

**Fix**: revertir en error y suspender sobre el documento de trabajo, no sobre el activo:

```js
async function modal(name, fn, { history = false, docId = null } = {}) {
  return core.executeAsModal(async (ctx) => {
    const id = docId ?? (app.activeDocument && app.activeDocument.id);
    const hid = history && id ? await ctx.hostControl.suspendHistory({ documentID: id, name }) : null;
    try {
      const r = await fn(ctx);
      if (hid !== null) await ctx.hostControl.resumeHistory(hid, true);
      return r;
    } catch (e) {
      if (hid !== null) { try { await ctx.hostControl.resumeHistory(hid, false); } catch (_) {} }
      throw e;
    }
  }, { commandName: name, interactive: false });
}
// live.js: modal("Open-DTF: Ajuste en vivo", ..., { history: true, docId: state.workDocId })
```

---

### MEDIO

#### M1. Deshacer desincroniza UI y documento (y los IDs)
**Dónde**: `src/ps/events.js:4,8-23`, `src/ps/live.js:9-15`.
Cada ajuste en vivo es una entrada de historial "Open-DTF: Ajuste en vivo". Con Ctrl+Z el documento vuelve atrás pero `S` y los controles no; además, deshacer un cambio de tipo de trama elimina la capa cuyo ID está en `L.halftone` → `MISSING_LAYERS` y la única salida es Cancelar (se pierde todo el trabajo). `historyStateChanged` se escucha pero solo para bloqueo.
**Fix**: en `historyStateChanged` con fase ACTIVE, si el estado de historial activo no es el último que creó el plugin, marcar `dirty = ALL_KINDS + "ht"` y re-sincronizar desde `S` (o avisar "Deshacer no está soportado en modo vivo"). Registrar el `historyState` tras cada sync:
```js
lastHistoryId = app.activeDocument.activeHistoryState.id;   // tras resumeHistory
```

#### M2. Sincronizaciones redundantes: el slider llama a `onChange` aunque el valor no cambie
**Dónde**: `src/ui/levelsSlider.js:47-55, 71`.
Cada `mousemove` dentro del mismo entero (los valores se redondean) dispara `onChange` → `touch` → un `executeAsModal` completo con recálculo de máscara. Con el ratón moviéndose despacio, la mayoría de syncs no cambian nada.
**Fix**:
```js
function apply(h, val) {
  const before = JSON.stringify(values);
  /* ...calcular... */
  if (JSON.stringify(values) === before) return;
  render(); onChange({ ...values });
}
```

#### M3. `validateState` recorre el árbol DOM de capas una vez por ID en cada sync
**Dónde**: `src/ps/live.js:9-15`, `src/ps/bp.js:53-62`.
10 IDs × recorrido recursivo de `doc.layers` = decenas/cientos de lecturas DOM síncronas (cada getter es una consulta al host) por tick del slider, antes de hacer nada útil.
**Fix**: un solo recorrido:
```js
function collectIds(c, out = new Set()) { for (const l of c.layers) { out.add(l.id); if (l.layers) collectIds(l, out); } return out; }
const ids = collectIds(doc);
if (Object.values(state.layers).some(id => !ids.has(id))) throw new Error("MISSING_LAYERS");
```

#### M4. Arrastre "pegado" si el `mouseup` ocurre fuera del panel
**Dónde**: `src/ui/levelsSlider.js:71-76`.
`drag` solo se limpia en `mouseup` del `document`. Si se suelta el botón fuera del panel, el siguiente `mousemove` sin botón sigue moviendo el valor y lanzando syncs.
**Fix**: `document.addEventListener("mousemove", e => { if (!drag) return; if (e.buttons === 0) { drag = null; onCommit && onCommit({ ...values }); return; } apply(drag, valueAt(e.clientX)); });` (y `mouseleave` en la raíz del panel como respaldo).

#### M5. Nombres de preset con `<` o `&` no se pueden cargar ni borrar
**Dónde**: `src/main.js:237-238, 244-248`.
El menú se construye con `n.replace(/[<&]/g, "")` y luego el nombre se recupera de `textContent`. "A&B" se muestra como "AB"; `presets.load("AB")` no existe → carga Default en silencio; `remove("AB")` no borra nada → el preset queda para siempre.
**Fix**: guardar `names` en una variable del módulo y usar el índice; crear los items con DOM y `textContent`:
```js
let presetNames = [];
function currentPresetName() { return presetNames[pickerIndex($("presetPicker"))] || "Default"; }
// al construir: const it = document.createElement("sp-menu-item"); it.textContent = n; menu.appendChild(it);
```

#### M6. Un `presets.json` corrupto se sobrescribe y se pierden todos los presets
**Dónde**: `src/presets.js:16-24, 43-50`.
`readAll` devuelve `{}` tanto si no existe como si el JSON es inválido; el siguiente `save` escribe solo el nuevo preset. Tampoco se validan tipos (`normalize` acepta `htType: "FOO"` → `ensurePattern` busca `ht_foo.png` y falla; `lpi: "30"` → `patternScale` con string).
**Fix**: distinguir "no existe" de "no parsea" (renombrar a `presets.bak.json` y avisar) y validar: `if (!HT_TYPES.includes(out.htType)) out.htType = DEFAULTS.htType; out.lpi = clamp(Number(out.lpi) || DEFAULTS.lpi, 5, 234);` etc. (usa por fin `HT_TYPES`/`CLEANUPS`).

#### M7. Parpadeo de bloqueo y cambios perdidos al cambiar el tipo de trama
**Dónde**: `src/ps/layers.js:56-82`, `src/ps/events.js:14-16`.
`ensurePattern` abre el PNG del motivo (`app.open`) dentro del sync; la notificación `open`/`select` llega con el tile como documento activo → `onLock` (y, por A2, cualquier cambio del usuario en esa ventana se pierde) hasta que otra notificación desbloquea.
**Fix**: con la guarda de fase de A3, marcar `state.phase = "RUNNING"` (o un flag `internalOp`) mientras dura `ensurePattern`; o precargar los 4 motivos en `runPrep`, que ya ignora eventos.

#### M8. Motivos redefinidos en cada sesión y resueltos por nombre
**Dónde**: `src/ps/layers.js:53-82, 92`.
`definedPatterns` es memoria de sesión: cada vez que se recarga el plugin se ejecuta *Definir motivo* de nuevo → el panel Motivos del usuario acumula "HT ROUND", "HT ROUND", ... Si `make pattern` no devuelve `ID` (🔍), el relleno usa solo el nombre y puede coger un motivo antiguo o del usuario con el mismo nombre.
**Fix**: antes de definir, consultar los motivos existentes (`get` de `presetManager` en la aplicación) y reutilizar el ID; o usar un nombre con sufijo de versión (`HT ROUND · Open-DTF v1.3`) y exigir `ID` (lanzar error si falta).

#### M9. Historial y memoria crecen sin control en sesiones largas
**Dónde**: `src/ps/live.js:33`, `src/ps/bp.js:34-35`.
Cada sync crea un estado de historial que guarda la máscara completa (y el filtro de sombras) a resolución final; a 20 000 px por lado (límite permitido en `main.js:276`) son cientos de MB por estado. Tras ~50 ajustes el estado "Preparar" sale del historial.
**Fix**: dado que el documento de trabajo se descarta al Aplicar y deshacer no está soportado (M1), purgar historial al soltar el slider (`app.purge(constants.PurgeTarget.HISTORYCACHES)`) o documentar que deshacer está deshabilitado en el paso 2.

#### M10. Dimensiones no validadas
**Dónde**: `src/main.js:124-129, 272-278`.
Solo se trata `0`/vacío; un valor negativo (`-5`) produce `widthPx < 0` y `resizeImage` falla con un mensaje críptico "[paso: redimensionar]". Tampoco hay mínimo.
**Fix**: `if (!(widthPx > 0 && heightPx > 0)) return message("Indica un tamaño mayor que 0.", "warn");`.

---

### BAJO

- **B1. Error de arranque invisible** — `tools/build.js:47` escribe en `#statusLine`, que no existe en `index.html` (los IDs de mensaje son `msg`/`lockBanner`). Un fallo al cargar un módulo solo va a la consola. Fix: `document.getElementById("msg")` y quitar la clase `hidden`.
- **B2. `npm run check` es débil** — `package.json:7` solo hace `node --check src/main.js` (no los otros 14 módulos ni el bundle) y `check_native` no aplica las reglas de compatibilidad UXP de `CONTRIBUTING.md`. Fix: `node --check main.js` (cubre todo el bundle) y añadir a `check_native.js` patrones `/\.toggleAttribute\(|classList\.toggle\([^)]*,/` sobre `src/` y `/\b(gap|grid)\s*:/` sobre `styles.css`.
- **B3. Versiones** — `release.yml:47-52` solo valida `manifest.json`; `package.json` puede quedarse atrás (CONTRIBUTING pide subir ambos). Y en `workflow_dispatch` con un tag **ya existente**, se construye la rama (`github.ref`, l.37) y se sube con `--clobber` al release del tag antiguo → binario que no corresponde al tag. Fix: comparar también `require('./package.json').version`; si `git ls-remote --tags origin $TAG` existe, hacer checkout del tag.
- **B4. Doble ejecución del release** — se dispara con `release: published` y `push: tags` (l.9-12); crear el release desde la web genera ambos eventos. La `concurrency` los serializa y `--clobber` lo hace idempotente, pero se construye dos veces. Fix: quitar uno de los disparadores o filtrar `if: github.event_name != 'push' || ...`.
- **B5. `package.js` depende de `zip` del sistema** (`tools/package.js:11`) — falla en Windows sin herramientas; no hay comprobación de que `main.js` esté al día si se ejecuta directamente (sí vía `npm run package`).
- **B6. Acciones sin fijar a SHA** (`actions/checkout@v4`, etc.) y `permissions: contents: write` a nivel de workflow. Riesgo de cadena de suministro bajo para un repo pequeño.
- **B7. `onSwatch` actualiza la prenda de más** — `src/main.js:229`: con `linked=false` y cambio del color de knockout envía `touch("ko","shirt")`, un `setSolid` innecesario por cambio.
- **B8. `pickColor` usa su propio `executeAsModal`** (`src/ui/colorPicker.js:5`) sin esperar a `pumping`; si coincide con un sync, el error crudo de PS aparece en el banner. Fix: `await drainPump()` antes.
- **B9. `askPresetName`** (`src/main.js:259-269`): si se cierra con Esc, la promesa `done` queda pendiente para siempre (fuga menor) y no se valida longitud/caracteres del nombre.
- **B10. `bindNumber` con `liveTyping`** (`src/main.js:207-210`) + `change` ⇒ doble `commit` al confirmar; inocuo gracias a la coalescencia, pero el debounce no se cancela en `change` (`debounced.cancel()` existe y no se usa).
- **B11. Código muerto** — ver lista en "Arquitectura". `createQueue` (util.js:12) además duplica la idea de `pump` con otra semántica; elegir una.

---

## Rendimiento

### Coste por evento del slider (en vivo, documento de trabajo)

| Control | `executeAsModal` | Round-trips batchPlay | Otros |
|---|---|---|---|
| Niveles (entrada/salida) | 1 | 1 (`setLevels`) + 3 (`refreshMask`) = **4** | `suspend/resumeHistory`, `validateState` (~10 recorridos DOM), 2 renders de composición (selección desde RGB con solo MAP GROUP + vista final) |
| LPI / ángulo | 1 | 1 + 3 = **4** | ídem |
| Tipo de trama | 1 | ~6 + 3 + DOM `moveAbove`/`delete` | 1.ª vez: `app.open` PNG + Definir motivo + cerrar |
| Sombras | 1 | 6 (`setShadowBoost`) + 3 = **9** | 2 recálculos de Sombras/Iluminaciones a resolución completa |
| Color KO | 1 | 2 + 3 = **5** | — |
| Color prenda / vista | 1 | 1 | — |

**Lo bueno**: la cola `dirty`/`pump` (`src/main.js:133-157`) ya hace "último valor gana": mientras un sync está en vuelo, los eventos solo añaden "kinds" al `Set`, así que no hay acumulación de llamadas. No hace falta debounce adicional en los sliders; añadirlo empeoraría la latencia.

### Mejoras propuestas

1. **Un solo batchPlay por sync**. Convertir `setLevels`, `setSolid`, `setHalftoneParams` y `refreshMask` en *constructores de descriptores* y enviar un único array. Tras `runPrep` la máscara siempre existe, así que `deleteMask` puede ir en el mismo lote (dejar el `try` tolerante solo para la primera construcción):
   ```js
   // live.js
   const descs = [];
   if (kinds.has("shirt"))  descs.push(D.solid(L.shirt, s.shirt));
   if (kinds.has("ko"))     descs.push(D.solid(L.ko, s.knockoutColor), D.solid(L.mapBg, s.knockoutColor));
   if (kinds.has("levels")) descs.push(D.levels(L.levels, s));
   if (kinds.has("ht"))     descs.push(D.htParams(L.halftone, s.lpi, s.angle, res));
   if (needsMask)           descs.push(...maskDescs(s, state.previewMode));   // incluye delete+make mask
   await bp(descs);   // 4 → 1 round-trip
   ```
2. **Sombras solo al soltar** (A4) y editar el filtro existente en vez de borrar+crear.
3. **Saltar syncs sin cambios** (M2) y guardar `lastApplied` para filtrar kinds cuyo valor no cambió.
4. **`validateState` O(n)** (M3); o validar solo cuando una llamada falle (estrategia optimista: si `bp` lanza "no existe la capa", entonces comprobar y lanzar `MISSING_LAYERS`).
5. **Agrupar show/hide**: `hide`/`show` aceptan varias referencias en `null: [...]` (ya se usa en `screen.js:15`); `refreshMask` envía 6-8 descriptores de visibilidad que pueden reducirse a 2.
6. **Vista previa a resolución reducida (opcional, mayor impacto)**: para documentos grandes, el cálculo de máscara (composite → selección → máscara) es O(píxeles). Un modo "borrador" que trabaje sobre un duplicado a 1/4 de resolución y regenere a tamaño final solo en Aplicar recortaría el coste ~16×.
7. **Historial**: ver M9.

---

## Quick wins

1. `bp.js` `modal()`: `resumeHistory(hid, false)` en error y `documentID: state.workDocId` (A5) — 10 líneas, protege todos los syncs.
2. `screen.js`: `try/finally` que cierre `__ht_tmp` y restaure el documento/visibilidad (C2).
3. `main.js` `onCancel`: esperar a `pumping`, no resetear si `cancelPrep` falla (A1).
4. `main.js` `touch`/`unlock`/`pump`: no descartar cambios; `pump()` al desbloquear (A2).
5. Fases `APPLYING`/`CANCELLING` respetadas por `touch` y `events.js` (A3).
6. Slider de Sombras: aplicar en `onCommit` (A4) — el soporte ya existe en `levelsSlider.js:75`.
7. `levelsSlider.apply`: no llamar a `onChange` si los valores no cambian (M2); comprobar `e.buttons === 0` en `mousemove` (M4).
8. `validateState` con un único recorrido y `Set` (M3).
9. Presets: usar el array de nombres por índice en vez de `textContent` (M5); no sobrescribir un JSON corrupto (M6).
10. `tools/build.js:47`: `statusLine` → `msg` (B1). `package.json`: `node --check main.js` + reglas UXP en `check_native` (B2).
11. Validar tamaño > 0 en `onRun` (M10).
12. Borrar código muerto (`createQueue`, `restorePreviewVisibility`, exportaciones sin uso) (B11).

### Cobertura de pruebas (recomendación)
No existe ninguna prueba de comportamiento. Sin Photoshop se puede cubrir con `node --test` y un *stub* de `photoshop`/`uxp` inyectado por `tools/build.js` (ya separa `nativeRequire`):
- `levelsSlider` (`constrainIn/Out`, mapeo gamma ↔ posición, ida y vuelta `tToGamma(gammaT(g)) ≈ g`).
- `presets.normalize` / `list` / `save` con JSON corrupto.
- `units` (`toPx`/`fromPx` ida y vuelta en in/cm/mm).
- Cola `touch`/`pump` con un `live.sync` falso que tarda y falla: verificar que no se pierden kinds (A2) y que Cancelar espera (A1).
- `live.sync`: con un `bp` falso que registra descriptores, comprobar el número de round-trips por kind (regresión de rendimiento).
