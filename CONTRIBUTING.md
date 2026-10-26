# Contribuir a Open-DTF

Gracias por ayudar. Open-DTF es un plugin UXP para Photoshop con licencia MIT.

## Reportar un problema
Abre un [issue](https://github.com/eguiajosue/halftones-dtf/issues) con:
- versión de Photoshop y sistema operativo;
- versión de Open-DTF (Plugins › Gestionar plugins);
- qué hiciste, qué esperabas y qué pasó (el mensaje de error del panel, si aparece);
- si puedes, una captura o un vídeo corto.

## Preparar el entorno
1. Instala **UXP Developer Tool** y activa *Preferencias › Plugins › Habilitar modo desarrollador* en Photoshop.
2. Clona el repo y carga `manifest.json` en UDT (*Add Plugin › Load*).
3. El código está en `src/`. Tras editarlo ejecuta `npm run build` para regenerar `main.js` (es el archivo que carga Photoshop) y recarga en UDT.

## Reglas del proyecto
- **Procesado nativo:** todo el trabajo sobre píxeles se hace con funciones de Photoshop (batchPlay/DOM). El JavaScript solo orquesta. `npm run check` lo verifica.
- **Compatibilidad UXP:** evita APIs que UXP no implementa (`toggleAttribute`, `classList.toggle(x, bool)`, CSS `gap`/`grid`).
- **Recursos propios:** motivos, iconos y textos deben ser originales o con licencia compatible con MIT.

## Pull requests
1. Crea una rama desde `main`.
2. Ejecuta `npm run check` y `npm run build`, y haz commit de `main.js` junto a tus cambios en `src/`.
3. Describe qué cambia y cómo lo probaste en Photoshop.

## Publicar una versión (mantenedores)
1. Sube la versión en `manifest.json` y `package.json`.
2. Haz merge a `main`.
3. En GitHub: **Releases › Draft a new release**, crea un tag igual a la versión (p. ej. `v1.5.0`) sobre `main` y pulsa **Publish release**. También vale empujar el tag con git. O bien **Actions › Release › Run workflow** (rama `main`) escribiendo el tag.
4. El workflow **Release** construye el `.ccx` y lo adjunta al release (como `OpenDTF_vX.Y.Z.ccx` y `OpenDTF.ccx`).
