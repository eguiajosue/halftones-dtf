---
name: Open-DTF
description: Hoja de pruebas de imprenta para un plugin libre de semitonos DTF: papel estucado, tinta K y campos de tinta de proceso.
colors:
  ink-k: "#0b0b0c"
  paper: "#f4f5f3"
  paper-shade: "#e8eae6"
  cyan-ink: "#00aeef"
  magenta-ink: "#ec008c"
  yellow-ink: "#ffe600"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Arial Narrow, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(46px, 7.6vw, 96px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 88, 'opsz' 96"
  display-light:
    fontFamily: "Bricolage Grotesque, Arial Narrow, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(46px, 7.6vw, 96px)"
    fontWeight: 300
    lineHeight: 0.95
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 100, 'opsz' 96"
  headline:
    fontFamily: "Bricolage Grotesque, Arial Narrow, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(36px, 5vw, 72px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 88, 'opsz' 96"
  title:
    fontFamily: "Bricolage Grotesque, Arial Narrow, Helvetica Neue, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 92, 'opsz' 30"
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 80"
rounded:
  sm: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "72px"
components:
  button-primary:
    backgroundColor: "{colors.ink-k}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "13px 22px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-k}"
    rounded: "{rounded.sm}"
    padding: "13px 22px"
    height: "48px"
  button-download:
    backgroundColor: "{colors.ink-k}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "18px 30px"
    height: "64px"
  plate-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-k}"
    padding: "24px"
  demo-annotation:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-k}"
    padding: "14px 18px"
---

# Design System: Open-DTF

## Overview

**Creative North Star: "The Check Print"**

La web es el pliego de pruebas que un diseñador revisa antes de imprimir. Lo que hace Open-DTF (convertir tono continuo en puntos, tinta por tinta) es el propio tema de la hoja, así que la página muestra sus separaciones en lugar de describirlas: marcas de corte en las esquinas, diana de registro, barra de color y una línea de pie con datos reales. El lienzo es papel estucado blanco frío; el negro K, el cian, el magenta y el amarillo de proceso se usan como campos de color a escala de página, no como acentos.

Es una superficie de captación (modo Persuade) pensada para diseñadores independientes. Rechaza la página de producto oscura con titular centrado, acento azul y fila de tarjetas iguales. La única plancha oscura es la historia 3D: es la tinta negra impresa sobre la prenda.

**Key Characteristics:**
- Papel blanco frío (nunca crema), tinta K y tres tintas de proceso como campos de página.
- Mobiliario de imprenta dibujado en CSS/SVG: marcas de corte, diana de registro, barra de color, línea de pie de prueba.
- Rectilíneo: bordes de 1,5 px en tinta K, radio de 2 px, sin sombras.
- Un momento firmado: la titular entra desregistrada (cian y magenta desplazadas) y encaja.

## Colors

Paleta de proceso de imprenta: un negro, un papel y tres tintas, cada una dueña de una región.

### Primary
- **Process Cyan** (#00aeef): campo de la sección de descarga. Texto K encima (8:1).

### Secondary
- **Process Magenta** (#ec008c): campo de la sección de contribuir. Texto K encima (5,4:1); solo para texto grande y enlaces de 22 px.

### Tertiary
- **Process Yellow** (#ffe600): campo de la sección "por qué". También el interruptor activo del demo y el tercer punto de la marca.

### Neutral
- **Black Plate Ink** (#0b0b0c): texto, bordes y la plancha negra de la historia 3D; fondo del botón principal.
- **Coated Cool Paper** (#f4f5f3): fondo de página, portada, FAQ y pie.
- **Paper Shade** (#e8eae6): reservado para superficies secundarias.

### Named Rules
**The Ink Field Rule.** Cada tinta de proceso ocupa una sección entera o no aparece. Nunca se reparte como acento suelto sobre fondo neutro; la excepción son los puntos de la marca y las barras de color, que son la propia muestra de tinta.

**The Cool Paper Rule.** El papel es blanco frío (#f4f5f3). Un papel cálido o crema es una deriva, no una variante.

## Typography

**Display Font:** Bricolage Grotesque (variable: peso, ancho, tamaño óptico), con Arial Narrow como respaldo
**Body Font:** Archivo (variable: peso, ancho), con Helvetica Neue como respaldo
**Brand Font:** Instrument Serif Italic, solo en la «Open» del logotipo

**Character:** un grotesco con carácter para los titulares, a peso 800 con ancho 88, y el mismo a peso 300 con ancho 100 para la segunda línea: el contraste está en el peso, no en cambiar de familia. Archivo, neutro y legible, hace el texto y las etiquetas técnicas.

### Hierarchy
- **Display** (800, clamp(46px, 7.6vw, 96px), 0.95): titular de portada. Máximo 6 rem.
- **Display light** (300, mismo tamaño, 0.95): segunda línea del titular y énfasis dentro de títulos de sección (`em`).
- **Headline** (800, clamp(36px, 5vw, 72px), 1): títulos de sección y encabezado de la historia.
- **Title** (600, 22px, 1.2): preguntas del FAQ y enlaces de contribuir.
- **Body** (400, 17px, 1.6): texto corrido, medida máxima 30-36 em.
- **Label** (600, 11px, tracking 0.14em, mayúsculas, ancho 80): línea de pie de prueba en los márgenes de la portada.

### Named Rules
**The Weight Contrast Rule.** El énfasis tipográfico se hace con peso (800 frente a 300) y tamaño dentro de la misma familia de display. La serif cursiva no se usa en titulares.

**The Wordmark Only Rule.** Instrument Serif Italic vive únicamente en «Open» del logotipo, compromiso de marca confirmado por el usuario.

## Layout

Un pliego a ancho completo. Gutter fluido `clamp(20px, 5vw, 72px)` aplicado en cada sección; contenido de tipo "wrap" a 1180 px como máximo. Escala de espacio de base 4 (4, 8, 16, 24, 40, 72) más un relleno vertical de sección fluido de 88 a 152 px. Más espacio sobre un título que debajo. La portada es una sola pantalla: titular abajo a la izquierda sobre la escena 3D, anotación de demo abajo a la derecha, marcas de corte en las cuatro esquinas, línea de pie arriba y barra de color cerrando el pliego.

Responsive: bajo 900 px desaparece la navegación de texto, la anotación de demo pasa a flujo normal bajo el texto y los pasos de la historia ganan un fondo negro al 86 % para leerse sobre la escena. Bajo 520 px se oculta el botón de descarga del menú. Los campos de tinta se apilan sin cambios de contenido.

## Elevation & Depth

Plano. Sin sombras: la profundidad la dan el borde de 1,5 px en tinta K, los cambios de campo de color y, en la historia, la escena 3D con iluminación real sobre la camiseta. El grano de papel (ruido al 5 % con multiplicación) es la única textura.

### Named Rules
**The Flat Sheet Rule.** Ninguna superficie lleva sombra. Si un elemento necesita separarse, lleva borde K o cambia de campo de tinta.

## Shapes

Rectilíneo, como una plancha: radio de 2 px en botones, 0 en paneles, bordes de 1,5 px en K. Las marcas de corte son ángulos de 26 px con borde de 1,5 px; la diana de registro es un círculo doble con cruz de 44 px, en SVG propio. Los únicos círculos son los puntos de la marca y los puntos de trama de la escena.

## Components

### Buttons
- **Shape:** rectángulo con radio de 2 px (2px), borde de 1,5 px.
- **Primary:** fondo K (#0b0b0c), texto papel, 13px 22px, 48 px de alto; en la descarga, 18px 30px y 64 px.
- **Ghost:** transparente con borde K; en hover se rellena de K.
- **Hover / Focus:** relleno a #26262a; `scale(0.98)` al pulsar; foco de 3 px en K (papel sobre plancha negra), desplazado 3 px.

### Anotación del demo (plate-panel)
- **Style:** panel blanco con borde K de 1,5 px, sin radio ni sombra; deslizadores con `accent-color` K; interruptor con borde K que se rellena de amarillo.

### Cards / Containers
- **Corner Style:** 0.
- **Background:** papel sobre campo de color (requisitos de instalación) o blanco (demo).
- **Border:** 1,5 px K.
- **Internal Padding:** 24 px.

### Navigation
- Fija, 16 px de relleno vertical; transparente en la parte alta y papel al 94 % con filtro de 8 px y borde K al desplazarse. Invierte a negro durante la historia. Enlaces de 15 px con subrayado de 1,5 px al pasar. Botón de descarga en K (papel sobre plancha negra).

### FAQ (details)
- Filas separadas por reglas K de 1,5 px, sin cajas; resumen en Title; icono más/menos dibujado con dos barras que gira 45° al abrir.

### Línea de pie de prueba y barra de color (signature)
- Barra de 14 px con diez bloques planos: C, M, Y, K, R, G, B y tres grises. Cierra la portada y abre el pie. Línea de pie de 11 px en mayúsculas con datos reales (30 LPI, 33°, MIT).

## Do's and Don'ts

### Do:
- **Do** dar a cada tinta de proceso una región entera de la página.
- **Do** usar bordes de 1,5 px en K en lugar de sombras.
- **Do** mantener el negro K en texto sobre cian, magenta y amarillo (≥5,4:1).
- **Do** usar la barra de color y las marcas de corte como estructura, no como adorno suelto.
- **Do** respetar `prefers-reduced-motion`: sin el registro de la titular ni el fundido de pasos.

### Don't:
- **Don't** usar papel crema ni cálido: el papel es blanco frío.
- **Don't** usar sombras, degradados en texto ni acentos laterales de color.
- **Don't** poner etiquetas o numeraciones encima de un titular: los identificadores de plancha van como pie.
- **Don't** usar la serif cursiva fuera del logotipo.
