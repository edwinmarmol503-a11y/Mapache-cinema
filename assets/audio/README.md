# Banda sonora de Lumera

La colección contiene **41 archivos de audio**: 37 canciones y 4 clips cortos para muerte y reaparición. Los originales de `AUDIOS` permanecen intactos. Las copias de `assets/audio` tienen nombres ASCII y exactamente los mismos bytes; no se recodificaron. `INVENTARIO.md` relaciona cada copia con su archivo original, tamaño y SHA-256. Uno de los 12 archivos anteriores repetía Turquesa; se distribuye una sola copia de esa canción.

## Canciones asignadas

| Escena | Pista | Archivo |
| --- | --- | --- |
| Menú principal y sus opciones / créditos informativos | ZornBeats - Arcade / ACZINO vs JACK | pista-37.mp3 |
| Enfrentamiento final de cualquier dificultad | BAGHIRA: STRADIVARI / CHUTY VS ACZINO | pista-03.mp3 |
| Créditos de victoria al completar una dificultad | Lo Que Soy / Los Vaguens | pista-34.mp3 |

Las otras **34 canciones se reproducen en orden**, según las listas de `tracks.json`: pista-01, pista-02, pista-04 hasta pista-33, pista-35 y pista-36. Al llegar a la última, se vuelve a la primera. Todas las dificultades y mundos comparten el mismo cursor. Menú, jefe, final y clips de muerte quedan fuera de esa secuencia.

La canción cambia al pasar de nivel o al reaparecer tras una muerte. Cerrar diálogos, abrir opciones, pausar o reiniciar manualmente conserva la canción. Una canción de nivel que termine se repite hasta la próxima muerte o transición de nivel; no salta automáticamente a otra. Los cambios de volumen no reinician la reproducción.

El próximo ID de la lista se conserva en `localStorage`, clave `mapache_cinema_music_order_v1`, para continuar el recorrido al volver a abrir el juego. Si el navegador impide guardar datos, el recorrido sigue en memoria durante la sesión. No se guarda ningún audio ni dato de cuenta en esa clave.

## Muerte y reaparición

| Momento | Clip | Duración original |
| --- | --- | ---: |
| Pantalla negra después del alma: primera muerte | burla-01.mp3 | 3.888 s |
| Pantalla negra después del alma: segunda muerte | burla-02.mp3 | 2.544 s |
| Pantalla negra después del alma: tercera muerte | burla-03.mp3 | 2.496 s |
| Al pulsar una acción nueva para reaparecer | reaparicion.mp3 | 3.120 s |

Las burlas se alternan 1 → 2 → 3 → 1 y suenan completas antes de mostrar la frase. El fondo permanece negro al menos 0.5 s y hasta que termine la grabación. La frase espera en silencio. Al pulsar una acción nueva, Riko vuelve inmediatamente y se puede jugar mientras suena REAPARICION. Cuando termina, comienza la siguiente canción reservada de la lista. Si ocurre otra muerte o cambio de nivel mientras suena REAPARICION, se cancela la grabación y la continuación anterior, conservando el avance realizado.

Estos clips utilizan **Volumen efectos**. Los cuatro archivos pequeños se precargan y decodifican a buffers PCM de Web Audio para reproducirlos completos y reutilizarlos sin errores de duración o búsqueda MP3; las canciones largas se descargan solo cuando se seleccionan. El silencio o un error de audio no bloquean la reaparición: se esperan tiempos máximos de carga y reproducción y se continúa sin reemplazar el archivo por música genérica.

## Rutas y publicación

Publica todos los archivos de `assets/audio`, incluido `tracks.json`: pista-01.mp3 a pista-37.mp3, burla-01.mp3, burla-02.mp3, burla-03.mp3 y reaparicion.mp3. Los nombres no contienen espacios ni tildes.

Las primeras 11 canciones conservan rutas alternativas de la publicación anterior:

- `01-AUDIOS-1-A-4/assets/audio/`: pistas 01 a 04.
- `02-AUDIOS-5-A-8/assets/audio/`: pistas 05 a 08.
- `03-AUDIOS-9-A-11/assets/audio/`: pistas 09 a 11.

Cada `src` se resuelve desde la dirección de `tracks.json`. Si falla una canción, `alternateSrcs` prueba otras ubicaciones de la misma canción. Una canción de nivel sin ubicaciones disponibles permite intentar la siguiente disponible. Una canción fija ausente queda en silencio. Los efectos siguen funcionando y no se genera la antigua música genérica.

El reproductor admite hasta 500 entradas. `gain`, entre 0 y 1, se multiplica por el volumen de música o efectos que corresponda.

## API

- `Audio.playMusic(theme)` conserva la canción de la misma escena o lista equivalente. `Audio.playMusic(theme, { restart: true })` selecciona la siguiente canción; en una escena fija reinicia su canción.
- `Audio.reserveMusic(theme)` consume y guarda una selección, pero no la reproduce. Devuelve una reserva inmutable. `Audio.playReservedMusic(reservation)` inicia esa selección sin consumir otra; la reserva se usa una sola vez y se invalida al cambiar o detener la música.
- `Audio.stopMusic()` detiene la música, cancela los clips transitorios e invalida las reservas pendientes.
- `Audio.playTransitionCue('death')` alterna una burla completa. `Audio.playTransitionCue('respawn')` reproduce REAPARICION completa. Ambas devuelven una promesa con `{ name, id, title, status }`, donde `status` puede ser `ended`, `unavailable`, `timed-out` o `cancelled`. La aplicación debe ignorar continuaciones antiguas al cambiar de pantalla. Para un uso futuro, `{ maxDuration: segundos }` permite limitar explícitamente un clip; el flujo normal no lo limita.
- `Audio.cancelTransientCue()` resuelve la promesa del clip como `cancelled` y lo detiene. `getCueStatus()` informa del clip, modo, posición y duración.
- `Audio.pauseMusic()` y `resumeMusic()` también pausan o reanudan los clips, conservando su posición y el tiempo de espera restante. Una acción de usuario que desbloquee el audio no anula una pausa explícita.
- `Audio.subscribeTrackEnd(callback)` devuelve una función para cancelar la suscripción. Solo los créditos de victoria emiten `{ theme: 'ending', id, title }`, una vez al terminar LO QUE SOY.
- `Audio.getMusicStatus()` informa de la canción y clip activos, posición, duración, escena y modo, incluido `ended`.

## Sin conexión

La PWA guarda las pistas que se descargan completamente para usarlas sin conexión. Las canciones todavía no guardadas requieren Internet. Si ninguna está disponible, se mantiene el silencio. Actualiza la versión de caché al distribuir cambios.

