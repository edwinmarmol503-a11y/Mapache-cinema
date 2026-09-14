ASSETS  -  MAPACHE CINEMA: LA ULTIMA NOCHE
==========================================

El juego funciona SIN ningun fichero aqui: todo el arte y el audio son
placeholders generados por codigo (js/sprites.js dibuja formas en canvas,
js/audio.js sintetiza sonido con la Web Audio API).

Cuando tengas assets definitivos, colocalos asi:

  assets/
    player/      riko.png            (sheet: idle/walk/jump/fall/attack/hurt/death)
    enemies/     sombra.png cuervo.png devorador.png guardian.png farolero.png
    backgrounds/ roofs.png forest.png sewers.png district.png tower.png
    objects/     items.png           (llave, lata, bombilla, iman, cuerda, recuerdo)
    ui/          hud.png fonts...
    audio/       music_roofs.ogg ... sfx_jump.wav ...
    fonts/       pixel.woff2

COMO ENCHUFARLOS
----------------
1) Sprites: en js/sprites.js, sustituye cada funcion drawXxx() por un
   ctx.drawImage(sheet, sx, sy, sw, sh, x, y, w, h). El resto del juego
   (player.js, enemies.js, boss.js) solo llama a esas funciones: no hay que
   tocar la logica.

2) Audio: en js/audio.js, cambia _tone()/sfx()/playMusic() por HTMLAudioElement
   o AudioBufferSourceNode cargando desde assets/audio/. Mantén los mismos
   nombres de metodo (sfx('jump'), playMusic('roofs'), ...).

3) Fuente pixel: anade @font-face en css/style.css y cambia la font-family.

La resolucion interna es 480x270, tile = 16 px.
