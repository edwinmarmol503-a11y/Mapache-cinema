ASSETS  -  MAPACHE CINEMA: LA ULTIMA NOCHE
==========================================

El arte se genera por codigo (js/sprites.js dibuja formas en canvas).
La carpeta audio contiene 37 pistas MP3: 34 aleatorias para los niveles y
ARCADE para el menu, CHUTY VS ACZINO para el jefe y LO QUE SOY para el final.
Solo los efectos se sintetizan con Web Audio API; la musica usa tus pistas.

Cuando tengas assets definitivos, colocalos asi:

  assets/
    player/      riko.png            (sheet: idle/walk/jump/fall/attack/hurt/death)
    enemies/     sombra.png cuervo.png devorador.png guardian.png farolero.png
    backgrounds/ roofs.png forest.png sewers.png district.png tower.png
    objects/     items.png           (llave, lata, bombilla, iman, cuerda, recuerdo)
    ui/          hud.png fonts...
    audio/       pista-01.mp3 ... pista-37.mp3, tracks.json
    fonts/       pixel.woff2

COMO ENCHUFARLOS
----------------
1) Sprites: en js/sprites.js, sustituye cada funcion drawXxx() por un
   ctx.drawImage(sheet, sx, sy, sw, sh, x, y, w, h). El resto del juego
   (player.js, enemies.js, boss.js) solo llama a esas funciones: no hay que
   tocar la logica.

2) Musica: configura pistas y listas en assets/audio/tracks.json.
   La pista cambia al morir o pasar de nivel; los textos y menus conservan
   la cancion y su posicion. El volumen se ajusta en Opciones.
   Consulta assets/audio/README.md para anadir o reasignar pistas.

3) Fuente pixel: anade @font-face en css/style.css y cambia la font-family.

El mundo usa coordenadas de 480x270 y tiles de 16 px. El canvas se dibuja
a mayor resolucion segun la pantalla para mantener las letras legibles.
