# Video promocional 9:16 (TikTok)

15 s a 30 fps, 1080×1920, en español. Todo se genera con código: la animación es
un lienzo (Canvas 2D + Three.js para la camiseta) y el sonido se sintetiza con numpy.
No usa música ni muestras de terceros.

| Archivo | Qué hace |
|---|---|
| `index.html` + `promo.js` | Animación. Cada fotograma depende solo del tiempo (`promo.frame(i)`). |
| `audio.py` | Efectos de sonido y pulso de 120 BPM → `build/audio.wav`. |
| `render.js` | Captura los 450 fotogramas con Chromium y los codifica con ffmpeg → `build/open-dtf-tiktok.mp4`. |

```sh
python3 promo/tiktok/audio.py
npm i --no-save playwright          # o NODE_PATH apuntando a un playwright instalado
node promo/tiktok/render.js         # video completo
node promo/tiktok/render.js --stills 0,150,449   # fotogramas sueltos en build/
```

Variables opcionales de `render.js`: `CHROMIUM_PATH` (ejecutable de Chromium) y
`THREE_DIR` (carpeta local del paquete `three@0.160.0` si no hay acceso al CDN).

Vista previa: sirve la raíz del repositorio (`python3 -m http.server`), abre
`/promo/tiktok/` y haz clic en el lienzo para reproducir.

Los tiempos de los eventos están en `T` (promo.js) y se repiten en `audio.py`.

Guion: gancho «¿Sigues pagando licencias para hacer semitonos DTF?» → «Hay una
alternativa libre.» → trama, frecuencia/ángulo y knockout del negro (réplica del panel,
no es una captura) → estampa sobre camiseta → GRATIS / Código abierto (MIT) /
Photoshop 2022+ → logotipo y «Descárgalo gratis · link en la bio».

La camiseta es «T-SHIRT 3D Model Free» de Mohammad Rajabloo (CC BY 4.0), el mismo
modelo de la web; si publicas el video, menciónalo en la descripción.
