# Open-DTF

Plugin **libre y de código abierto** (MIT) para Adobe Photoshop que prepara diseños para impresión **DTF/DTG**: redimensiona a 300 ppi, elimina el color de la prenda (knockout) y genera la trama de semitono, con ajustes en vivo. Todo el procesado de imagen lo hace Photoshop con funciones nativas; el JavaScript solo orquesta.

**Web:** https://eguiajosue.github.io/halftones-dtf/ · **Descargas:** [Releases](https://github.com/eguiajosue/halftones-dtf/releases)

## Instalación
1. Descarga `OpenDTF.ccx` desde la [última versión](https://github.com/eguiajosue/halftones-dtf/releases/latest).
2. Haz doble clic: Creative Cloud lo instala (pedirá confirmar porque no viene del Marketplace).
3. En Photoshop 2022 (23.3) o posterior: **Plugins › Open-DTF**.

## Uso
1. **Paso 1:** elige tamaño (in/cm/mm), semitono (tipo, LPI, ángulo), knockout y colores → **Preparar**.
2. **Paso 2 (en vivo):** tipo de semitono, frecuencia y ángulo, niveles de entrada/salida, realce de sombras, knockout y colores se aplican mientras arrastras. Vistas Original/Prenda/Alfa/Máscara, limpieza y de-fringe.
3. **Aplicar** crea `<doc> - Prepped` con una sola capa con transparencia. **Cancelar** descarta el trabajo; el original nunca se modifica.

## Desarrollo
1. Instala **UXP Developer Tool**; en Photoshop activa *Preferencias › Plugins › Habilitar modo desarrollador*.
2. UDT → *Add Plugin* → `manifest.json` → *Load*.
3. El código está en `src/`. `npm run build` genera `main.js` (el bundle que carga Photoshop): reconstrúyelo tras editar `src/`.
4. `npm run check` (regla nativa y sintaxis) · `npm run package` → `dist/OpenDTF_v<versión>.ccx`.
5. `npm run tiles` / `npm run icons` regeneran los recursos (Python 3, solo herramienta de desarrollo).

Más detalles en [CONTRIBUTING.md](CONTRIBUTING.md). Los descriptores de batchPlay pendientes de validar están en [`docs/VERIFICACION.md`](docs/VERIFICACION.md).

## Publicar una versión
Sube la versión en `manifest.json` y `package.json`, haz merge a `main` y empuja el tag (`git tag v1.3.0 && git push origin v1.3.0`). El workflow **Release** construye el `.ccx` y publica el release; **Pages** publica `site/` en cada cambio de la web.

## Estructura
`manifest.json`, `index.html`, `styles.css`, `main.js` (generado) · `src/` (`main.js`, `state.js`, `presets.js`, `ps/`, `ui/`) · `assets/` (motivos e iconos) · `tools/` (generadores, comprobaciones, empaquetado) · `site/` (web en GitHub Pages) · `.github/workflows/` (CI, release y Pages).

## Licencia
[MIT](LICENSE). No afiliado a Adobe; Photoshop es una marca de Adobe.
