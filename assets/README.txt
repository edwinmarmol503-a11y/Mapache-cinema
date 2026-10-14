ASSETS  -  MAPACHE CINEMA: LA ULTIMA NOCHE
==========================================

El arte se genera por codigo (js/sprites.js dibuja formas en canvas).
El manifiesto activa 43 audios: 39 canciones y 4 clips cortos.
Las 34 canciones de nivel recorren una lista en orden, guardada en el navegador.
ARCADE queda para el menu, CHUTY VS ACZINO para el jefe y LO QUE SOY para los finales A y C. FINAL MALO acompana B en Facil, Normal y Dificil; FINAL MALO dificultad pesadilla solo B en Pesadilla.
Tres burlas alternadas comienzan durante los 0.5 segundos de fondo negro despues
de morir y continuan mientras aparece la frase. Al pulsar un boton nuevo se corta
la burla, suena REAPARICION y despues empieza
la siguiente cancion. Los clips usan Volumen efectos y no entran en la lista.
Los efectos restantes se sintetizan con Web Audio API; la musica usa tus pistas.

Cuando tengas assets definitivos, colocalos asi:

  assets/
    player/      riko.png            (sheet: idle/walk/jump/fall/attack/hurt/death)
    enemies/     sombra.png cuervo.png devorador.png guardian.png farolero.png
    backgrounds/ roofs.png forest.png sewers.png district.png tower.png
    objects/     items.png           (llave, lata, bombilla, iman, cuerda, recuerdo)
    ui/          hud.png fonts...
    audio/       pista-01.mp3 ... pista-37.mp3, tracks.json
                 final-malo.mp3 final-malo-pesadilla.mp3
                 burla-01-v6.mp3 burla-02.mp3 burla-03.mp3 reaparicion.mp3
    fonts/       pixel.woff2

COMO ENCHUFARLOS
----------------
1) Sprites: en js/sprites.js, sustituye cada funcion drawXxx() por un
   ctx.drawImage(sheet, sx, sy, sw, sh, x, y, w, h). El resto del juego
   (player.js, enemies.js, boss.js) solo llama a esas funciones: no hay que
   tocar la logica.

2) Musica: configura pistas y listas en assets/audio/tracks.json.
   La pista avanza en orden al reaparecer tras morir o pasar de nivel; los
   textos, opciones y reinicio manual conservan la cancion y su posicion.
   Canciones y clips tienen volumen separado en Opciones.
   Consulta assets/audio/README.md para anadir o reasignar pistas.

3) Fuente pixel: anade @font-face en css/style.css y cambia la font-family.

El mundo usa coordenadas de 480x270 y tiles de 16 px. El canvas se dibuja
a mayor resolucion segun la pantalla para mantener las letras legibles.
