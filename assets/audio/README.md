# Banda sonora de Lumera

La colección contiene 37 pistas distintas: las 11 anteriores y las 26 recibidas el 11 de octubre de 2026. Los originales de `AUDIOS` se conservan intactos. Las copias de `assets/audio` tienen nombres ASCII y exactamente los mismos bytes; no se han recodificado. `INVENTARIO.md` relaciona cada copia con su título ID3, archivo original, tamaño y SHA-256. Uno de los 12 archivos anteriores repetía Turquesa; se distribuye una sola copia de esa canción.

## Canciones asignadas

| Escena | Pista | Archivo |
| --- | --- | --- |
| Menú principal y sus opciones / créditos informativos | ZornBeats - Arcade / ACZINO vs JACK | pista-37.mp3 |
| Enfrentamiento final de cualquier dificultad | BAGHIRA: STRADIVARI / CHUTY VS ACZINO | pista-03.mp3 |
| Créditos de victoria al completar una dificultad | Lo Que Soy / Los Vaguens | pista-34.mp3 |

Las otras 34 canciones forman la lista aleatoria de los niveles. Las tres canciones asignadas quedan excluidas de esa lista.

La selección aleatoria comparte una bolsa barajada entre niveles: recorre la colección antes de volver a mezclar y evita repetir la anterior al cambiar de canción. La canción continúa al cerrar diálogos, abrir opciones o regresar de los créditos informativos. Pausar conserva el archivo y su posición. Los volúmenes de música y efectos son independientes.

Una canción de nivel se repite cuando termina; el siguiente sorteo ocurre al morir, reiniciar o pasar de nivel. Arcade y la canción del jefe también se repiten mientras permanezca su escena. Lo Que Soy se reproduce una vez: al terminar avisa a la pantalla de victoria para que finalice la animación y vuelva al menú. Volver al menú antes permite salir de esos créditos.

## Rutas y publicación

Todos los archivos principales están directamente en `assets/audio/pista-01.mp3` a `pista-37.mp3`. Publica esas copias junto con `tracks.json`. Los nombres no contienen espacios ni tildes.

Las primeras 11 entradas también conservan como rutas alternativas las carpetas de la publicación anterior:

- `01-AUDIOS-1-A-4/assets/audio/`: pistas 01 a 04.
- `02-AUDIOS-5-A-8/assets/audio/`: pistas 05 a 08.
- `03-AUDIOS-9-A-11/assets/audio/`: pistas 09 a 11.

Cada `src` se resuelve desde la dirección de `tracks.json`. Si falla, `alternateSrcs` prueba otras ubicaciones de la misma canción. Una canción de nivel sin ubicaciones disponibles permite intentar otra de la lista. Una canción fija ausente queda en silencio, evitando sustituirla por una distinta. Los efectos siguen funcionando y no se genera la antigua música genérica.

```json
{
  "id": "pista-37",
  "title": "ZornBeats - Arcade || ACZINO vs JACK - Instrumental FMS",
  "src": "pista-37.mp3",
  "gain": 0.65
}
```

El reproductor admite hasta 500 entradas, eliminando el límite anterior de 20 que habría descartado parte de la colección nueva. `gain`, entre 0 y 1, se multiplica por el volumen elegido.

## API y reproducción sin conexión

`Audio.playMusic(theme)` conserva la canción de la misma escena o de una lista equivalente. `Audio.playMusic(theme, { restart: true })` selecciona otra al morir o pasar de nivel; en una escena fija reinicia su canción. `Audio.pauseMusic()` y `resumeMusic()` conservan la posición.

`Audio.subscribeTrackEnd(callback)` devuelve una función para cancelar la suscripción. Solo los créditos de victoria emiten el evento natural `{ theme: 'ending', id, title }`, una vez por reproducción. `Audio.getMusicStatus()` informa de la canción, posición, duración, escena y modo, incluido `ended`.

Solo se descarga la canción seleccionada. La PWA guarda las pistas reproducidas completamente para usarlas sin conexión; las canciones todavía no guardadas requieren Internet. Si ninguna está disponible, no se sustituye por música genérica. Actualiza la versión de la caché al distribuir cambios.
