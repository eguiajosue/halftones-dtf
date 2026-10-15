# Halftones DTF

Plugin (panel UXP) para Adobe Photoshop 23.3+ que prepara imágenes para impresión **DTF/DTG**: redimensiona a 300 ppi, hace knockout de color y genera semitonos, todo con **funciones nativas de Photoshop** (capas de ajuste, relleno de motivo en *Mezcla definida* y filtros). El JavaScript solo orquesta; no procesa píxeles (`npm run check` lo verifica).

Implementación propia basada en `Especificacion_Plugin_DTF_Halftone.md`. Todos los recursos (motivos, iconos, textos) son originales.

## Uso
1. **Paso 1:** elige tamaño (in/cm/mm), semitono (tipo, LPI, ángulo), knockout y colores → **Preparar**.
2. **Paso 2 (en vivo):** tipo de semitono, frecuencia y ángulo, niveles de entrada/salida, realce de sombras, knockout y colores se aplican al documento mientras arrastras. Vistas Original/Prenda/Alfa/Máscara, limpieza y de-fringe.
3. **Aplicar** crea `<doc> - Prepped` con una sola capa rasterizada con alfa. **Cancelar** descarta el trabajo; el original nunca se modifica.

## Desarrollo
1. Instala **UXP Developer Tool**; en Photoshop activa *Preferencias > Plugins > Habilitar modo desarrollador*.
2. UDT → *Add Plugin* → `manifest.json` → *Load*.
3. `npm run build` genera `main.js` (bundle de `src/`; UDT carga ese archivo, hay que reconstruirlo tras editar `src/`). `npm run check` (regla nativa), `npm run package` → `dist/HalftonesDTF_v<versión>.ccx`.
4. `npm run tiles` / `npm run icons` regeneran los recursos (Python 3, solo herramienta de desarrollo).

## Estado
Escrito sin acceso a Photoshop: **no se ha podido ejecutar**. Los descriptores de batchPlay marcados con `🔍` en el código deben validarse con *Copiar como JavaScript*; ver [`docs/VERIFICACION.md`](docs/VERIFICACION.md).

## Estructura
`manifest.json`, `index.html`, `styles.css` · `src/` (`main.js`, `state.js`, `presets.js`, `ps/`, `ui/`) · `assets/tiles` (motivos de umbral) · `assets/icons` · `tools/` (generadores, `check_native.js`, `package.js`).
