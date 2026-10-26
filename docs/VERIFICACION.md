# Verificación pendiente en Photoshop

El plugin se escribió sin poder ejecutarlo en Photoshop. Antes de distribuirlo, valida en UDT cada punto marcado `🔍` en `src/` (graba la operación a mano y usa **Copiar como JavaScript**) y corre el plan de pruebas T1–T15 de la especificación.

## Desviaciones respecto a la especificación (decisiones de implementación)
- **Motivos sin PSD manual:** en vez de `HalftoneLibrary.psd` (que exige crearlo a mano en Photoshop), el plugin abre `assets/tiles/ht_*.png` y ejecuta *Definir motivo* una vez por sesión (`layers.js › ensurePattern`). Riesgo: la clave exacta del descriptor `make pattern` y si el relleno admite el motivo solo por nombre (sin `ID`). Si falla, crea `assets/HalftoneLibrary.psd` como indica §6.3 y adapta `makeHalftoneLayer`.
- **DOM en vez de batchPlay** para agrupar (`createLayerGroup`), duplicar capa y mover (`moveBelow/moveAbove`) y para crear el documento final (`documents.add` + `layer.duplicate(doc)`).
- **MAP BG:** capa sólida del color de knockout bajo `MAP ART`, para que el arte transparente cuente como fondo (§8.2).
- **MAP THRESHOLD:** umbral 128 dentro del grupo, visible solo con el semitono desactivado.
- Knockout desactivado → máscara rellena de blanco (§8.2). El realce de sombras se aplica a `ART` y a `MAP ART`.
- Los 4 tipos de motivo (Redondo, Línea, Diamante, Elipse) están en la UI; el motor nativo (opción "Trama final") es el método 2 de §6.4.

## Descriptores a validar (§18)
- [ ] `selectAllLayers` + `newPlacedLayer` · [ ] `make pattern` (Definir motivo) y `make contentLayer/patternLayer` con `scale`/`angle`
- [ ] `createLayerGroup`, `moveBelow/moveAbove`, `layer.duplicate(doc)`, `documents.add`
- [ ] `adaptCorrect` y borrado del filtro inteligente (`filterFX` índice 1)
- [ ] Máscara desde selección (`set selection` ← canal RGB, `make` máscara `revealSelection`; sustituye a `applyImageEvent`, que fallaba con "error de programa"). El método 2 (trama nativa) sigue usando `applyImageEvent` y cae al método 1 si falla
- [ ] `minimum` + `preserveShape`, `defringe`, `median`, `thresholdClassEvent`, `thresholdClassEvent` como capa de ajuste
- [ ] Respuesta de `showColorPicker` · [ ] `duplicate merged` · [ ] `convertMode bitmapMode/halftoneScreen`
- [ ] Polaridad (T2): si los puntos salen invertidos, invertir los tiles (`255 - v`) y regenerar con `npm run tiles`.

## Añadidos de la Fase 1 (pendientes de validar)
- [ ] `convertMode` con `depth: 8` (pipeline.js › runPrep); si falla se continúa sin convertir
- [ ] `mergeVisible` y borrado de capas ocultas antes de crear `ART` (pipeline.js › mergeVisibleLayers); comparar el resultado con la versión anterior
- [ ] `get presetManager` para detectar motivos `HT *` ya definidos (layers.js › libraryPatternNames); si no devuelve nombres se define el motivo como antes
- [ ] Sombras: el realce se aplica al soltar el slider (no en cada movimiento)

## Fase 2: máscara diferida (pendiente de validar)
- [ ] Cambiar el modo de fusión de `MAP GROUP` a `multiply` / `passThrough` (`set layer mode`, preview.js › blend)
- [ ] Vista Prenda durante el arrastre = `ART × mapa` (sin máscara): comparar con la vista tras recalcular la máscara; exacta con prenda negra, aproximada con otros colores
- [ ] Tras ~300 ms sin cambios (o al soltar/pulsar un control discreto) la máscara se recalcula y la vista pasa a la máscara real
- [ ] Medir: estados de historial por gesto (objetivo ≤ 2) y latencia por fotograma en los documentos M y L

## Fase 3 (pendiente de validar)
- [ ] `make` + `get layerID` en un solo `batchPlay` (bp.js › bpThenId) en todas las capas de *Preparar*
- [ ] *Aplicar*: borrar `MAP GROUP` y `SHIRT` antes de rasterizar (el resultado final debe ser idéntico)
- [ ] Botón «Celda entera» y etiqueta de celda (LPI efectivo a 300 ppi); comprobar que desaparece el moiré en tramas finas
- [ ] Aviso de memoria por encima de 150 MP (requiere pulsar Preparar dos veces)

## Panel de rendimiento (pendiente de validar)
- [ ] 5 pulsaciones sobre «Open-DTF» muestran/ocultan el panel; el estado se conserva al reiniciar Photoshop
- [ ] `app.version`, `require("uxp").versions` y `doc.bitsPerChannel` devuelven valores (si no, el informe muestra «?»)
- [ ] El informe se actualiza tras cada operación y el texto se puede seleccionar y copiar desde el `textarea`

## 1.5.0: calidad del semitono (pendiente de validar)
- [ ] Capa **Blanco y negro** como mapa (`make adjustmentLayer` con `blackAndWhite`, clave `grain` = verde) y su `set` en vivo. Si falla, el plugin usa Tono/Saturación y el control de sensibilidad queda sin efecto. Prueba: un rojo puro sobre prenda negra debe llegar a ≥ 90 % de tinta con sensibilidad 100
- [ ] Capa **Curvas** (`MAP DOTS`) con puntos `paint`; comprobar que los escalones se respetan (Photoshop puede suavizarlos como spline). Si falla al crearla, el control de punto mín./máx. no hace nada
- [ ] Tiles exactos `ht_<tipo>_<n>.png` (3-48 px) a escala ~100 %: comparar la curva tonal contra el tile de 128 px de la 1.4 con una rampa 0-100 %
- [ ] Cambiar el LPI cruzando una celda entera cambia de motivo (`needsNewTile` → `replaceHalftone`); medir el coste en el panel de rendimiento
- [ ] Borrado de motivos de la biblioteca al aplicar/cancelar (`delete` con `_ref: "pattern"`, `_name`)
- [ ] Los presets antiguos no traen `colorSens`/`dotMin`/`dotMax`: se completan con 50/0/100. **El valor por defecto de sensibilidad (50) cambia el aspecto de los colores saturados respecto a la 1.4**
