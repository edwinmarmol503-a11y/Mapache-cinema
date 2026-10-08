# Banda sonora de Lumera

La versión 3.1 incluye 11 pistas MP3 distintas, copiadas sin recodificar de la carpeta AUDIOS. Los 12 archivos originales contienen un duplicado idéntico; se conserva una sola copia para reproducirlo y distribuirlo. Los originales permanecen intactos.

Los cinco niveles (roofs, forest, sewers, district y tower) y el jefe (boss) comparten la misma colección. La selección usa una bolsa barajada: todas las canciones tienen oportunidad de sonar antes de volver a mezclar, y no se repite una canción inmediatamente al cambiar de nivel o terminar una pista. La música sigue con otra pista cuando termina. El menú y el final conservan la música sintetizada.

Cada archivo se reproduce por streaming con un solo elemento de audio; no se descargan las once canciones al abrir el menú. El volumen de música de Opciones es independiente de los efectos. Pausar o cambiar de pestaña conserva la posición de la canción. Una pista ausente o incompatible usa música sintetizada de respaldo.

## Archivos y configuración

Guarda los MP3, OGG o WAV en esta carpeta. tracks.json describe sus identificadores, títulos, rutas y listas; src es relativo a esta carpeta. Los nombres pista-01.mp3 a pista-11.mp3 son las copias actuales. El manifiesto admite hasta 20 pistas. Ejemplo de una entrada:

```json
{ "id": "pista-01", "title": "Pista 01", "src": "pista-01.mp3", "gain": 0.65 }
```

Incluye el identificador en las listas de los niveles donde debe sonar. gain va de 0 a 1 y se aplica antes del volumen elegido por el jugador. Una lista de una sola pista la repite; loop: true puede fijar una canción hasta abandonar el tema. También se admiten URLs HTTPS con CORS.

## Juego sin conexión

La PWA instala solo los archivos pequeños del juego. Guarda una canción en caché cuando se solicita durante la reproducción, sin descargar toda la colección al inicio. Una canción que todavía no se ha guardado necesita conexión; si falta, se usa el respaldo sintetizado. Las copias descargadas incluyen las once pistas y se sirven localmente con INICIAR-JUEGO.cmd.

Al distribuir una banda sonora nueva, incluye los archivos y actualiza la versión de la caché del service worker. Audio.configureTracks(manifest) reemplaza la configuración; Audio.getMusicStatus() devuelve el modo, tema y título actual.
