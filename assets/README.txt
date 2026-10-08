ASSETS  -  MAPACHE CINEMA: LA ULTIMA NOCHE
==========================================

El arte se genera por codigo (js/sprites.js dibuja formas en canvas).
La carpeta audio contiene 11 pistas MP3 de fondo para los niveles y el jefe.
Los efectos y el respaldo de musica se sintetizan con Web Audio API.

Cuando tengas assets definitivos, colocalos asi:

  assets/
    player/      riko.png            (sheet: idle/walk/jump/fall/attack/hurt/death)
    enemies/     sombra.png cuervo.png devorador.png guardian.png farolero.png
    backgrounds/ roofs.png forest.png sewers.png district.png tower.png
    objects/     items.png           (llave, lata, bombilla, iman, cuerda, recuerdo)
    ui/          hud.png fonts...
    audio/       pista-01.mp3 ... pista-11.mp3, tracks.json
    fonts/       pixel.woff2

COMO ENCHUFARLOS
----------------
1) Sprites: en js/sprites.js, sustituye cada funcion drawXxx() por un
   ctx.drawImage(sheet, sx, sy, sw, sh, x, y, w, h). El resto del juego
   (player.js, enemies.js, boss.js) solo llama a esas funciones: no hay que
   tocar la logica.

2) Musica: configura pistas y listas en assets/audio/tracks.json.
   El reproductor ya mezcla las canciones al azar y usa el volumen de Opciones.
   Consulta assets/audio/README.md para anadir o reasignar pistas.

3) Fuente pixel: anade @font-face en css/style.css y cambia la font-family.

La resolucion interna es 480x270, tile = 16 px.
