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
