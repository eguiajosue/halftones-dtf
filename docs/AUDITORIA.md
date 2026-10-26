# Auditoría de Open-DTF 1.3.0 y plan de mejora de rendimiento

> Alcance: el plugin UXP (`manifest.json`, `index.html`, `src/**`, `tools/`, CI). No incluye la web (`site/`) ni el vídeo (`videos/`).
> Método: análisis estático del código. No se ejecutó en Photoshop, así que los costes son estimaciones razonadas y **la Fase 0 del plan existe para medirlos**. Las referencias `archivo:línea` apuntan a `src/`.

## 1. Resumen ejecutivo

La arquitectura es sólida en lo esencial: todo el procesado de píxeles lo hace Photoshop (regla nativa vigilada por `tools/check_native.js`), el original nunca se toca, los cambios en vivo se agrupan en una cola con coalescencia y cada ajuste es una sola entrada de historial.

El cuello de botella está en **cómo** se materializa la vista en vivo: **cada** cambio de niveles, LPI, ángulo, sombras, knockout o tipo de trama vuelve a calcular la máscara de `ART` a resolución completa (componer `MAP GROUP` → cargarlo como selección → borrar máscara → crear máscara). En un pliego DTF típico (22×24 in a 300 ppi ≈ 47,5 MP) eso son varias pasadas de 47 MP por cada movimiento del ratón, más una instantánea de historial de la máscara (~47 MB) por ajuste. A eso se suman tres problemas que multiplican el coste: el realce de sombras se borra y se reaplica en **dos** objetos inteligentes en cada `mousemove`, el escuchador de eventos se dispara con las propias acciones del plugin, y cada sesión añade motivos duplicados a la biblioteca del usuario.

Lo que más rinde, de mayor a menor impacto:

1. **Separar la vista previa barata (en vivo) de la máscara cara (al soltar / al aplicar).** Durante el arrastre, mostrar la composición de `MAP GROUP` sin crear máscara; regenerar la máscara solo al soltar o tras ~300 ms de inactividad. Reducción estimada del trabajo por arrastre: **un orden de magnitud**.
2. **Realce de sombras solo al soltar** y modificando el filtro existente en vez de borrarlo y reaplicarlo.
3. **Filtrar los eventos de Photoshop** mientras el plugin trabaja y aplicar *debounce* en reposo.
4. **Aplanar antes de crear el objeto inteligente y forzar 8 bits**, que reduce la memoria del documento de trabajo y el coste de cada render del objeto inteligente.
5. **No duplicar motivos en la biblioteca** y precargarlos en *Preparar*.

## 2. Arquitectura actual (resumen)

```
Documento "<doc> - Prep" (300 ppi)
├─ MAP GROUP (pass-through, oculto salvo al calcular)
│  ├─ HT PATTERN     relleno de motivo, Hard Mix, relleno 100 %
│  ├─ MAP THRESHOLD  umbral 128 (visible solo sin semitono)
│  ├─ MAP LEVELS     niveles
│  ├─ MAP DESAT      tono/saturación −100
│  ├─ KO COLOR       sólido, Diferencia
│  ├─ MAP ART        objeto inteligente (+ Sombras/Iluminaciones como filtro)
│  └─ MAP BG         sólido del color de knockout
├─ ART               objeto inteligente (+ filtro) + máscara de capa
└─ SHIRT COLOR       sólido
```

Flujo de un ajuste en vivo (`main.js › touch → pump → live.sync`):

1. `executeAsModal` + `suspendHistory` (1 entrada de historial).
2. `validateState()` recorre el DOM de capas 10 veces (`live.js:9-15`).
3. Ajuste concreto (1 `batchPlay`), o en sombras: borrar filtro + reaplicar Sombras/Iluminaciones en `ART` **y** `MAP ART` (`layers.js:125-131`).
4. `refreshMask()` (`mask.js:19-42`): 3 `batchPlay` → composición completa de `MAP GROUP` a selección, borrar máscara, crear máscara, restaurar vista.

## 3. Hallazgos

Severidad: **A** alta (impacto directo y notable en velocidad/memoria o en el resultado), **M** media, **B** baja.

### 3.1 Rendimiento

| ID | Sev. | Dónde | Hallazgo | Recomendación |
|----|------|-------|----------|---------------|
| P1 | A | `live.js:43`, `mask.js:19-42` | Todo cambio que afecte a la máscara (6 de 8 tipos) recalcula la máscara a resolución completa. Cargar `RGB` como selección obliga a Photoshop a componer **todo** el documento al 100 %, mientras que la vista normal solo compone las teselas visibles al zoom actual. Es el coste dominante del modo en vivo. | Vista en vivo sin máscara durante el arrastre; máscara solo al soltar / en reposo / al aplicar (ver Fase 2). |
| P2 | A | `main.js:337-339`, `layers.js:125-131` | El slider de sombras llama a `touch("shadow")` en cada `mousemove`. Cada llamada borra y reaplica Sombras/Iluminaciones (radio 30 px) en **dos** objetos inteligentes, cada uno con re-render completo del contenido. | Aplicar solo en `onCommit` (el slider ya lo soporta, `levelsSlider.js:72-76`, pero `createValueSlider` nunca lo pasa). Modificar el filtro con `set` sobre `filterFX` en vez de `delete` + `adaptCorrect`. |
| P3 | A | `events.js:4-24` | Se escuchan `select` y `historyStateChanged`. El propio plugin genera decenas de `select` (capas, canales) y un `historyStateChanged` por ajuste, así que el manejador (que consulta `app.documents` y `app.activeDocument`) corre muchas veces por cada ajuste. En reposo, cada pincelada del usuario en cualquier documento dispara `updateCurrentPrintSize()`. | Ignorar eventos mientras `pumping`/`RUNNING`; quitar `historyStateChanged` en reposo; *debounce* de ~150 ms; comparar la firma `docId:w×h` antes de tocar la UI. |
| P4 | M | `main.js:131-151` | La cola coalesce, pero si el bucle está libre cada `mousemove` lanza un `sync` inmediato: el primer evento de cada arrastre paga el ciclo completo y el último valor espera a que termine uno ya obsoleto. | *Throttle* ligero (1 sync por fotograma ~16-33 ms) para los ajustes baratos y *debounce* para los caros (máscara, sombras). |
| P5 | M | `layers.js:56-81`, `live.js:17-26` | Cambiar el tipo de trama en vivo abre un PNG como documento, define un motivo y cambia el documento activo (lo que además dispara eventos `open`/`select`/`close`). | Precargar los 4 motivos en *Preparar* (1 sola vez) y en vivo hacer `set` del motivo en la capa existente en lugar de crear capa nueva + mover + borrar. |
| P6 | M | `layers.js:9-46`, `pipeline.js:56-98` | Cada `make` va seguido de `lastLayerId()` (otro viaje al host) y de `moveBelow/moveAbove` vía DOM. *Preparar* hace ~30 viajes al host. | Leer el `layerID` del resultado del `make` cuando venga; agrupar descriptores en un solo `batchPlay`; crear el grupo con `make layerSection from targetEnum`. Impacto moderado (latencia fija, no proporcional al tamaño). |
| P7 | M | `pipeline.js:157` | *Aplicar* siempre recalcula la máscara aunque el último ajuste en vivo ya la dejó al día; con trama nativa la calcula y la sobrescribe. | Bandera `maskFresh` (se invalida con cada cambio) y, con trama nativa, crear máscara `revealAll` sin componer. |
| P8 | B | `live.js:9-15` | `validateState` recorre el árbol de capas una vez por cada uno de los 10 IDs, creando proxies DOM en cada acceso. | Un solo recorrido que construya un `Set` de IDs, o un `get` por lotes. |
| P9 | B | `presets.js:16-24` | Cada `list`/`load` relee y parsea el JSON del disco. | Caché en memoria invalidada al guardar/borrar. |

### 3.2 Memoria y consumo de recursos

| ID | Sev. | Dónde | Hallazgo | Recomendación |
|----|------|-------|----------|---------------|
| R1 | A | `pipeline.js:56` | `newPlacedLayer` sobre **todas** las capas convierte el documento entero en un PSB incrustado (capas, efectos, texto…). `ART` y `MAP ART` son instancias de ese PSB y cada una renderiza su propio filtro inteligente. | Fusionar las capas visibles en una (conservando transparencia) **antes** de convertir a objeto inteligente. La salida es de una sola capa, así que no se pierde nada útil. |
| R2 | A | `pipeline.js:41` | Solo se normaliza el modo de color, no la profundidad. Un documento de 16 bits duplica la memoria y el tiempo de todo el proceso (32 bits lo cuadruplica y además Niveles/Hard Mix se comportan distinto). | Convertir el documento de trabajo a 8 bits/canal tras duplicarlo. |
| R3 | A | `live.js:33-45` | Cada ajuste crea un estado de historial que guarda el delta de la máscara completa (≈ W×H bytes). Con 50 estados (valor por defecto de Photoshop) en un pliego de 47 MP son ~2,3 GB de disco de memoria virtual solo en máscaras, más los cambios de sombras. | La Fase 2 reduce el número de estados de decenas por arrastre a uno por soltar. Documentarlo y, opcionalmente, ofrecer "Ajustes sin historial". |
| R4 | A | `layers.js:56-81` | *Definir motivo* añade el motivo a la biblioteca **persistente** del usuario. La caché `definedPatterns` vive en memoria, así que cada sesión de Photoshop añade otro "HT ROUND", "HT LINE"… La biblioteca crece sin límite. | Buscar el motivo por nombre antes de definirlo (y reutilizarlo); si no es posible, borrarlo de la biblioteca al terminar (el relleno de motivo guarda una copia en el documento). |
| R5 | M | `onRun`, `main.js:258-261` | El límite es 20 000 px por lado, sin mirar el área ni la memoria. 20 000 × 20 000 en RGB 8 bits = 1,2 GB por capa; el documento de trabajo tiene ≥ 2 objetos inteligentes, máscara, composición y el historial. | Estimar la memoria (`W×H×canales×capas pesadas`) y avisar con un umbral por área (p. ej. > 150 MP), no solo por lado. |
| R6 | M | `pipeline.js:194-199` | *Aplicar* crea un documento nuevo vacío y copia la capa: durante unos segundos conviven el documento de trabajo completo y la copia. | `make document using layer` (Duplicar capa → Nuevo documento) en un solo descriptor; cerrar antes el documento de trabajo es imposible, pero sí se puede ocultar/borrar `MAP GROUP` y `SHIRT` antes de rasterizar para liberar teselas. |

### 3.3 Robustez que afecta a la velocidad o al resultado

| ID | Sev. | Dónde | Hallazgo | Recomendación |
|----|------|-------|----------|---------------|
| C1 | A | `main.js:142-143` | Si `executeAsModal` falla (otro modal activo, documento equivocado), se vacía `dirty`: la UI muestra el valor nuevo pero el documento se queda con el anterior. Tras `unlock()` no se resincroniza. | Conservar los cambios pendientes y reintentar al desbloquear; en error de modal, reintento con espera breve. |
| C2 | M | `layers.js:84-86` | El tamaño de celda es `300 / LPI` px y casi nunca es entero (p. ej. 45 LPI → 6,67 px). El motivo de 128 px se remuestrea a ese tamaño, lo que produce puntos irregulares y *moiré* en tramas finas. | Mostrar el LPI efectivo y ofrecer "ajustar a celda entera" (LPI = 300/n). Regenerar los tiles a un tamaño múltiplo de las celdas habituales. |
| C3 | M | `docs/VERIFICACION.md` | Ningún descriptor marcado `🔍` está validado. Hasta que lo estén, cualquier optimización es especulativa. | Validarlos en la Fase 0 junto con las mediciones. |
| C4 | B | `pipeline.js:158-161` | Si la trama nativa falla a mitad de camino, puede quedar el documento temporal `__ht_tmp` abierto. | `try/finally` que cierre `tmp`. |

### 3.4 Mantenibilidad

| ID | Sev. | Hallazgo | Recomendación |
|----|------|----------|---------------|
| Q1 | M | Sin pruebas automáticas; el CI solo comprueba la regla nativa, la sintaxis y que `main.js` esté al día. | Pruebas en Node de la lógica pura (unidades, restricciones de sliders, presets, construcción de descriptores) con `node:test`, sin dependencias. |
| Q2 | B | Código muerto: `createQueue`, `restorePreviewVisibility`, `HT_TYPES`, `CLEANUPS`, export de `applyShadowBoost`, parámetro `onCommit` sin usar. | Eliminar o usar (`onCommit` es la base de P2). |
| Q3 | B | Sin instrumentación: no hay forma de saber cuánto tarda un ajuste en la máquina de un usuario. | Ver Fase 0. |

## 4. Plan estratégico

### Fase 0 — Medir antes de optimizar (1 semana)

Objetivo: tener una línea base reproducible y validar los descriptores `🔍`.

- **Instrumentar `bp()` y `modal()`** (`bp.js`): contar llamadas y medir con `performance.now()`; guardar las últimas N muestras por tipo de ajuste. Un interruptor de desarrollo (p. ej. `localStorage.debugPerf`) muestra en el panel *p50 / p95 / nº de batchPlay* del último ajuste.
- **Documentos de referencia** (guardar en un repositorio aparte o generarlos con una acción):
  - **S**: 12×16 in → 3600×4800 px (17 MP), 1 capa.
  - **M**: 22×24 in → 6600×7200 px (47,5 MP), 20 capas con texto y efectos.
  - **L**: 22×60 in → 6600×18 000 px (119 MP), 16 bits.
- **Métricas (KPI)** por documento: tiempo de *Preparar*; latencia de un ajuste en vivo (niveles, LPI, sombras, tipo de trama) p50/p95; tiempo de *Aplicar*; RAM de Photoshop y crecimiento del disco de memoria virtual tras 50 ajustes; nº de motivos en la biblioteca tras 3 sesiones.
- Completar la lista de `docs/VERIFICACION.md`.

### Fase 1 — Victorias rápidas (1-2 semanas, bajo riesgo)

| Tarea | Hallazgos | Ganancia esperada |
|-------|-----------|-------------------|
| Sombras solo al soltar + `set` del filtro existente | P2 | Elimina el ajuste más caro durante el arrastre. |
| Filtrar eventos propios, quitar `historyStateChanged` en reposo, *debounce* | P3 | Menos trabajo de UI y del host por ajuste; panel más fluido mientras se pinta en otros documentos. |
| Aplanar visible antes del objeto inteligente + 8 bits | R1, R2 | Menos memoria y renders de objeto inteligente más baratos en todo el flujo. |
| Motivos: reutilizar por nombre y precargar en *Preparar* | R4, P5 | Biblioteca del usuario limpia; cambio de tipo de trama sin abrir archivos. |
| No perder cambios en errores de modal y resincronizar al desbloquear | C1 | Documento y UI siempre coherentes. |
| Bandera `maskFresh` en *Aplicar*, `try/finally` en trama nativa | P7, C4 | Una composición completa menos al aplicar. |
| Quitar código muerto | Q2 | — |

### Fase 2 — Vista en vivo desacoplada de la máscara (2-3 semanas, riesgo medio)

Es el cambio con más impacto (P1, R3). Se hace por pasos, cada uno publicable:

1. **Máscara diferida.** Los ajustes que hoy llaman a `refreshMask` solo actualizan las capas de `MAP GROUP` y marcan `maskDirty`. La máscara se regenera al soltar el control (`onCommit`), tras ~300 ms sin cambios o al pulsar *Aplicar*.
2. **Vista previa durante el arrastre.** Mientras `maskDirty` es cierto, se muestra una vista que Photoshop compone solo a la resolución de pantalla:
   - Vista *Máscara*: `MAP GROUP` visible (ya existe, coste casi nulo).
   - Vista *Prenda*: `MAP GROUP` en modo **Multiplicar** sobre `ART`. El resultado es `ART × M`: exacto con prenda negra (el caso por defecto y el más común en DTF) y aproximado con otros colores. Para que el grupo se componga aislado debe pasar de *pass-through* a *Normal* (comprobar que Hard Mix se comporta igual).
3. **(Investigación) Vista exacta para cualquier color de prenda.** `salida = ART·M + PRENDA·(1−M)` se puede construir sin máscara: grupo A (Normal) = `ART` + mapa en Multiplicar; grupo B (Sobreexponer lineal/Añadir) = mapa invertido + sólido de prenda en Multiplicar. Requiere una segunda instancia del mapa (el filtro de sombras se calcularía tres veces), así que solo merece la pena si las mediciones de la Fase 0 confirman que componer en pantalla compensa. Decidir con datos.

Criterio de éxito: arrastrar niveles/LPI/ángulo en el documento **M** sin bloqueos perceptibles (objetivo p95 < 150 ms por fotograma de vista previa) y ≤ 1 estado de historial por gesto.

### Fase 3 — Preparar y Aplicar más ligeros (1-2 semanas)

- Agrupar los descriptores de *Preparar* en 3-4 `batchPlay` y leer IDs del resultado (P6).
- *Aplicar*: ocultar/borrar `MAP GROUP` y `SHIRT` antes de rasterizar; crear el documento final con `make document using layer` (R6).
- Aviso de memoria por área estimada (R5).
- Calidad de trama: LPI efectivo y opción de celda entera; regenerar tiles (C2).
- Barra de progreso real en *Aplicar* (ya existe `reportProgress`; añadir más pasos) y cancelación entre pasos.

### Fase 4 — Calidad y prevención de regresiones (continuo)

- `npm test` con `node:test` para la lógica pura y para comprobar que los descriptores generados no cambian sin querer (instantáneas JSON) (Q1).
- Añadir `npm test` al workflow `check.yml`.
- Plantilla de *issue* para rendimiento que pida tamaño del documento, profundidad, versión de Photoshop y la lectura del panel de depuración de la Fase 0.
- Repetir las mediciones de la Fase 0 antes de cada versión y anotar los resultados en las notas del release.

## 5. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Cambiar `MAP GROUP` a modo *Normal* altera el resultado de Hard Mix. | Comparar la máscara final antes/después en los documentos de referencia (diferencia de píxeles = 0). |
| Aplanar antes del objeto inteligente cambia el resultado con modos de fusión que dependen del fondo. | Fusionar visible con la misma apariencia; comparar contra el comportamiento actual en S/M/L. |
| La vista previa diferida confunde al usuario ("¿por qué no coincide?"). | Indicador "Actualizando máscara…" (reutilizar `#busy`) y regenerar en ≤ 300 ms tras soltar. |
| Descriptores sin validar (`🔍`). | Fase 0 primero; cada fase se publica por separado y se puede revertir. |

## 6. Orden recomendado

Fase 0 → Fase 1 (publicar como 1.4.0) → Fase 2 pasos 1-2 (1.5.0) → Fase 3 → Fase 2 paso 3 solo si los datos lo justifican. La Fase 4 se arranca en paralelo desde el principio porque es barata y protege el resto.
