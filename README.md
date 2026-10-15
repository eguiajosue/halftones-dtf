# Halftones DTF

Plugin (panel UXP) para Adobe Photoshop 24.2+.

## Desarrollo
1. Instala **UXP Developer Tool** desde Creative Cloud.
2. En Photoshop activa *Preferencias > Plugins > Enable Developer Mode*.
3. En UXP Developer Tool: *Add Plugin* → selecciona `manifest.json` → *Load*.
4. Edita y usa *Reload* (o *Watch*).

## Estructura
- `manifest.json` — manifiesto UXP v5
- `index.html`, `src/` — UI y lógica del panel
- `icons/` — iconos del plugin (pendiente)
- `scripts/package.js` — empaqueta `.ccx` (`npm run package`)
