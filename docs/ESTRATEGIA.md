# Estrategia de optimización y de aplicación de semitonos (Open-DTF)

> Continúa `docs/AUDITORIA.md` (versión 1.3.0) y parte del estado de la 1.4.0: máscara diferida, panel de rendimiento y pruebas.
> Nada de esto se ha medido todavía en Photoshop. Las cifras son estimaciones que el panel de rendimiento (Fase 0) tiene que confirmar o descartar, y cada propuesta indica cómo validarla.

## 1. Principios

1. **Semitonar solo el alfa, nunca el color.** En DTF, la impresora reproduce el color CMYK con su propio tramado, pero la tinta blanca y el polvo adhesivo son binarios: un píxel semitransparente se imprime como blanco sólido y deja bordes "en caja" y un tacto rígido. El trabajo del plugin es convertir la opacidad (y la cantidad de prenda que debe verse) en puntos de alfa **0 o 255**, y dejar el color continuo. Open-DTF ya lo hace así: es el acierto central del diseño y hay que conservarlo.
2. **Separar la vista previa del resultado final.** La vista previa tiene que ser rápida y suficientemente fiel. El resultado final tiene que ser exacto y repetible. No tienen por qué calcularse igual ni a la misma resolución.
3. **Todo en Photoshop, nada de píxeles en JS.** Se mantiene la regla nativa (`tools/check_native.js`). Las mejoras salen de *qué* operaciones nativas se piden y *a qué resolución*, no de procesar píxeles en el plugin.
4. **Parámetros reproducibles.** Cada ajuste tiene que poder reaplicarse desde cero a cualquier resolución con el mismo resultado: es lo que permite la estrategia de proxy (§3) y los lotes (§5).

## 2. Cómo debería funcionar la aplicación de semitonos

### 2.1 Pipeline objetivo

```
 Original ──► 1. Normalizar ──► 2. Mapa de tinta ──► 3. Curva DTF ──► 4. Tramado ──► 5. Limpieza ──► 6. Salida
             8 bits, RGB,      alfa × distancia     gamma, punto     AM motivo /    huérfanos,     color continuo
             1 capa, 300 ppi   a la prenda          mín./máx.        AM nativo /    choke 1 px     + alfa binario
                                                                     FM punto mín.
```

| Etapa | Hoy (1.4.0) | Propuesta |
|-------|-------------|-----------|
| 1. Normalizar | RGB, 8 bits, capas visibles fusionadas, redimensionar a 300 ppi | Igual. Añadir "resolución de trama" opcional para la salida (§2.5). |
| 2. Mapa de tinta | `MAP BG` (color de KO) + `MAP ART` + `KO COLOR` en Diferencia + Tono/Saturación −100 | Sustituir Tono/Saturación por **Blanco y negro** con pesos altos (§2.2). Opción de knockout por **Gama de colores** al recalcular la máscara. |
| 3. Curva DTF | Niveles (entrada, gamma, salida) + Sombras/Iluminaciones | Añadir **punto mínimo** y **punto máximo** explícitos con una capa Curvas (§2.3). Los Niveles quedan para el tono. |
| 4. Tramado | Motivo de 128 px escalado + Fusión definida (en vivo); Mapa de bits nativo (opcional, al aplicar) | Tiles al tamaño exacto de celda, sin remuestreo (§2.4). Tercer método: **FM con punto mínimo** (§2.4). |
| 5. Limpieza | Mediana / desenfoque + umbral; Mínimo 1 px (de-fringe) | Igual, con el radio expresado en fracción de celda y no en px fijos. |
| 6. Salida | Documento nuevo, una capa, alfa binario a 300 ppi | Igual, con opción de tramar el alfa a 600 ppi (§2.5). |

### 2.2 Mapa de tinta: la distancia a la prenda debe respetar los colores saturados

Hoy el mapa es la **luminosidad** de `|arte − color de prenda|`. Con prenda negra, un rojo puro (255,0,0) da una diferencia de (255,0,0), y al desaturar queda un gris oscuro (≈ 30-50 % según el método). El rojo recibe entonces **menos tinta blanca de la que necesita** y sale apagado sobre la prenda oscura. Lo mismo pasa con azules y violetas saturados. Es el defecto de calidad más importante del mapa actual.

**Propuesta:** cambiar `MAP DESAT` (Tono/Saturación) por una capa de ajuste **Blanco y negro** con los seis pesos de color altos (p. ej. 150-200 %), expuestos como un control de "sensibilidad de color". Es nativa, se actualiza en vivo y hace que un color saturado cuente como "lejos de la prenda" aunque sea oscuro.

**Alternativa para colores de prenda difíciles:** al recalcular la máscara (no en vivo), generar la selección con **Selección › Gama de colores** sobre el color de knockout con una tolerancia configurable. Trabaja en un espacio más perceptual que la diferencia RGB y separa mejor prendas de colores medios (gris jaspeado, azul marino). Como solo se usa en el recálculo, no penaliza el arrastre.

**Validación:** carta de colores saturados sobre prenda negra; comparar la máscara de 1.4.0 con la nueva. Un rojo puro debería llegar a ≥ 90 % de tinta.

### 2.3 Curva DTF: punto mínimo y punto máximo

En DTF hay dos límites físicos:

- **Punto mínimo.** Por debajo de cierto tamaño el punto no retiene polvo o no se transfiere, y desaparece al lavar.
- **Punto máximo.** Por encima de cierta cobertura los huecos entre puntos se cierran con la ganancia de tinta y la zona queda sólida, dura al tacto.

Hoy esto se aproxima con los niveles de salida, que **comprimen** el rango (un 3 % pasa a ser, por ejemplo, un 10 %). Lo correcto es un **corte**: por debajo del mínimo no hay punto (0), y por encima del máximo es sólido (100 %). Se implementa con una capa **Curvas** con escalones en `MAP GROUP`, con dos controles: "Punto mínimo %" y "Punto máximo %".

Los valores dependen de la impresora, la tinta, el polvo y la prenda. En lugar de fijarlos, el plugin debería generar una **hoja de calibración** (§2.6).

### 2.4 Tramado: tres métodos

| Método | Cuándo | Coste | Calidad |
|--------|--------|-------|---------|
| **A. AM por motivo** (Fusión definida) | Vista en vivo y salida por defecto | Bajo, se compone en pantalla | Depende del tile: ver abajo |
| **B. AM nativo** (Mapa de bits › Trama de semitonos) | Salida de máxima calidad | Medio: duplicado fusionado + 3 cambios de modo, una vez al aplicar | El motor de Photoshop: ángulo y frecuencia arbitrarios, puntos limpios |
| **C. FM con punto mínimo** (Mapa de bits › Difusión a menor resolución + ampliar por vecino más próximo) | Degradados suaves, fotos, prendas con trama marcada | Bajo-medio, una vez al aplicar | Sin moiré ni patrón visible; el punto mínimo lo fija la resolución de difusión |

**Mejora del método A (tiles exactos).** Hoy cada tile es **una sola celda de 128 px** que se reduce al tamaño real de celda (a 300 ppi y 30 LPI, 10 px: un 7,8 %). Esa reducción promedia los umbrales que `make_tiles.py` había ecualizado, deforma la respuesta tonal y, si la celda no es entera, crea puntos irregulares. Propuesta:

- Generar en `tools/make_tiles.py` tiles **al tamaño exacto de celda** (de 4 a 40 px, 4 formas; son PNG de unos cientos de bytes) y usarlos con **escala 100 %**.
- El LPI pasa a elegirse entre los valores de celda entera (el botón «Celda entera» de la 1.4.0 ya va en esa dirección).
- Con ángulo ≠ 0 Photoshop sigue remuestreando el motivo, pero interpolar un mapa de umbral bien ecualizado afecta poco al tono. Medirlo con la hoja de calibración.
- Limitación inherente del AM: una celda de *n* px solo tiene *n²* niveles de tono. A 300 ppi y 40 LPI son 56 niveles, lo que crea escalones en degradados largos. Si molesta, se resuelve con el método C o con la salida a 600 ppi (§2.5).

**Método C (FM con punto mínimo).** Todo nativo: duplicar fusionado el mapa → reducir a `300 / k` ppi (p. ej. k = 3, 100 ppi) → Mapa de bits por **difusión** → volver a 300 ppi por **vecino más próximo**. Cada "píxel" de difusión es un punto cuadrado de *k × k* px, así que *k* es el tamaño de punto mínimo. No produce moiré con la trama de la prenda ni con el tramado CMYK de la impresora.

### 2.5 Resolución de la trama

A 300 ppi un punto de 40 LPI se dibuja en una celda de 7,5 px: forma basta y pocos niveles. Las impresoras DTF imprimen a 720-1440 dpi, así que la RIP amplía el alfa.

**Propuesta:** opción "Tramar a 600 ppi" solo en *Aplicar*. Se recalcula la máscara a 600 ppi (4× píxeles, solo una vez), el color se queda a 300 ppi o se amplía según prefiera el usuario, y se entrega a 600 ppi. La vista en vivo no cambia. Hay que comprobar con la RIP habitual que respeta un alfa a 600 ppi sin suavizarlo.

### 2.6 Hoja de calibración

Un comando "Generar hoja de calibración" que cree un documento (todo nativo: degradados y rellenos) con:

- Rampas 0-100 % en pasos de 5 % para 3-4 LPI y los 3 métodos.
- Muestras de colores saturados sobre el color de prenda elegido.
- Texto fino y líneas finas para ver el choke y el de-fringe.

El usuario la imprime una vez, mira qué porcentaje es el primer punto que sobrevive y cuál el último hueco abierto, y guarda esos valores en un **preset de impresora/prenda**. Es la forma de convertir "ajustar a ojo" en un proceso repetible.

### 2.7 Puntos de partida (a calibrar)

| Caso | Método | LPI | Ángulo | Notas |
|------|--------|-----|--------|-------|
| Ilustración con degradados, prenda oscura | A o B | 30-45 | 22,5° o 45° | Punto mínimo según calibración; sensibilidad de color alta |
| Foto o degradado muy suave | C (k = 2-3) o B | — / 45-55 | — / 45° | FM evita los escalones del AM |
| Texto y vectores con bordes suaves | A | 40-55 | 45° | Limpieza estándar + de-fringe |
| Prenda clara, knockout de blanco | A | 25-35 | 22,5° | Menos crítico: la tinta blanca casi no se ve |

## 3. Estrategia de rendimiento

### 3.1 Dónde se va el tiempo (modelo)

Coste aproximado por operación, proporcional al número de píxeles del documento (P):

| Operación | Cuándo | Coste |
|-----------|--------|-------|
| Componer en pantalla (cambio de capa de ajuste, visibilidad, modo) | En vivo | ∝ píxeles **visibles** al zoom actual, con caché de teselas |
| Recalcular máscara (composición completa → selección → máscara) | Tras 300 ms (1.4.0) | ∝ P, varias pasadas |
| Sombras/Iluminaciones (radio 30 px) | Al soltar (1.4.0) | ∝ P × radio, en 2 objetos inteligentes |
| Preparar | Una vez | ∝ P (duplicar, redimensionar, objeto inteligente) |
| Aplicar | Una vez | ∝ P (máscara, limpieza, rasterizar, copiar) |

La 1.4.0 ya saca del arrastre lo más caro. Lo que queda proporcional al tamaño del documento es el **recálculo de la máscara** cada vez que el usuario se para, y *Preparar*/*Aplicar*.

### 3.2 Siguiente salto: documento de trabajo proxy

**Idea.** El documento de trabajo ("- Prep") se crea a **resolución reducida**, con un tope de, por ejemplo, 12 MP. Todos los ajustes en vivo, incluidos los recálculos de máscara, se hacen sobre él. *Aplicar* **no** usa ese documento: duplica el **original**, construye la misma pila de capas a resolución completa con los ajustes guardados y calcula la máscara una sola vez.

```
Original (47 MP) ──Preparar──► Proxy (≤ 12 MP, ajustes en vivo)
        │                                  │ ajustes (JSON)
        └───────────────Aplicar───────────►└─► Pila completa a 300/600 ppi ─► máscara 1 vez ─► "- Prepped"
```

- **Ganancia esperada:** el recálculo de máscara en un pliego de 47 MP pasa a hacerse sobre ≤ 12 MP (≈ 4× menos). En un documento de 119 MP, unas 10× menos. La memoria del documento de trabajo baja en la misma proporción.
- **Coste:** *Aplicar* tarda más que hoy (reconstruye la pila). Pero se hace una sola vez y con barra de progreso.
- **Fidelidad del semitono en el proxy.** A resolución reducida la celda queda en pocos píxeles y los puntos no se ven bien. Solución en dos niveles:
  1. **Proxy** para tono, knockout y colores (vista general).
  2. **Lupa 1:1**: un documento pequeño con un recorte del original a resolución final (p. ej. 1500 × 1500 px) con la misma pila, para inspeccionar los puntos. Se actualiza con los mismos ajustes.
- **Escalado de parámetros:** LPI y ángulo se expresan en unidades físicas, así que se convierten con la resolución del proxy (la fórmula `patternScale(lpi, resolución)` ya lo hace). El radio de Sombras/Iluminaciones y el de la limpieza se escalan con el factor del proxy.
- **Reutilización de código:** la construcción de la pila (`runPrep`) se separa en `buildStack(doc, ajustes)` y la usan Preparar (proxy), la lupa y Aplicar (completo). Las pruebas de descriptores de la Fase 4 protegen que las tres construyan lo mismo.

**Validación:** comparar, en los documentos de referencia, la máscara final de *Aplicar* desde proxy con la de la 1.4.0 (deben ser idénticas, porque la final se calcula a resolución completa) y medir p95 de `Vivo: … (máscara)` en el panel.

### 3.3 Otras líneas de optimización

| Línea | Qué | Ganancia | Riesgo |
|-------|-----|----------|--------|
| Sombras sin doble objeto inteligente | Aplicar Sombras/Iluminaciones una vez sobre `ART` y que `MAP ART` sea un objeto inteligente **del** `ART` filtrado, o mover el realce a una capa de ajuste Curvas aproximada | Mitad del coste de sombras | Medio: cambia el aspecto del realce |
| Retardo adaptativo de la máscara | El retardo de 300 ms se ajusta con el p50 medido: si recalcular tarda 2 s, esperar más para no encadenar recálculos | Menos recálculos inútiles | Bajo |
| Cancelar recálculos obsoletos | Si llega un cambio mientras se recalcula la máscara, descartar el resultado en vez de terminar la vista | Menor latencia percibida | Medio: depende de `isCancelled` en `executeAsModal` |
| Historial | Un solo estado por gesto (1.4.0) y purgar el historial del documento de trabajo antes de *Aplicar* | Menos disco de memoria virtual | Bajo (el documento se cierra después) |
| Motivos exactos | Tiles a escala 100 % (§2.4) | Composición del motivo más barata (sin remuestreo) y mejor tono | Bajo |
| Lotes | Aplicar un preset a varios archivos sin vista en vivo (solo la pila completa y la máscara una vez) | Producción de pliegos | Bajo, reutiliza `buildStack` |

### 3.4 Objetivos medibles (con el panel de rendimiento)

| Métrica | Documento M (47 MP) | Documento L (119 MP, 16 bits) |
|---------|---------------------|-------------------------------|
| Arrastre (`Vivo: levels`, `Vivo: ht`) p95 | < 150 ms | < 250 ms |
| Recálculo de máscara (`… (máscara)`) p95 | < 1 s (proxy) | < 1,5 s (proxy) |
| Preparar | < 10 s | < 25 s |
| Aplicar | < 20 s | < 60 s |
| `batchPlay` por ajuste en vivo | ≤ 3 | ≤ 3 |
| Estados de historial por gesto | ≤ 2 | ≤ 2 |

Los valores son objetivos de partida. Se fijan definitivamente tras la primera ronda de mediciones de la Fase 0.

## 4. Hoja de ruta

| Versión | Contenido | Depende de |
|---------|-----------|------------|
| **1.4.x** | Fase 0: validar `docs/VERIFICACION.md` y medir con el panel la línea base de la 1.4.0 en S/M/L | — |
| **1.5.0** — calidad del semitono | Mapa con Blanco y negro y sensibilidad de color (§2.2) ✅; punto mínimo y máximo con Curvas (§2.3) ✅; tiles exactos a escala 100 % (§2.4) ✅; hoja de calibración (§2.6) ⏳ pendiente | 1.4.x |
| **1.6.0** — rendimiento | Documento proxy + lupa 1:1 + `buildStack` compartido (§3.2); retardo adaptativo; purgar historial antes de Aplicar | Mediciones de 1.4.x |
| **1.7.0** — salida | Método C (FM con punto mínimo); tramar a 600 ppi (§2.5); lotes (§3.3) | 1.6.0 (`buildStack`) |

Primero va la calidad (1.5.0) porque cambia **qué** se calcula. El proxy (1.6.0) cambia **dónde** se calcula, y conviene montarlo sobre el pipeline definitivo para no hacerlo dos veces.

## 5. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| La vista del proxy no coincide con el resultado final | La máscara final siempre se calcula a resolución completa; la lupa 1:1 enseña los puntos reales; aviso en la UI de que la vista general es aproximada |
| Cambiar el mapa (Blanco y negro) altera presets existentes | Versión de preset: los presets antiguos siguen con Tono/Saturación hasta que el usuario los actualice |
| Descriptores nuevos sin validar (Curvas con escalones, Gama de colores, difusión) | Cada uno detrás de una opción, con vuelta al método actual si falla, como la trama nativa hoy |
| Los puntos de partida de §2.7 no encajan con una impresora concreta | La hoja de calibración y los presets por impresora/prenda son el mecanismo previsto para ajustarlos |
