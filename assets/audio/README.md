# Banda sonora de Lumera

Esta carpeta está preparada para recibir entre 5 y 20 pistas. Mientras el manifiesto esté vacío, el juego conserva su música sintetizada. Una pista que no pueda cargarse también usa esa música como respaldo.

Guarda aquí los archivos MP3, OGG o WAV. MP3 es una buena opción para reducir el tamaño de descarga; no hace falta precargar todas las pistas. La reproducción utiliza un solo elemento de audio y respeta el volumen de música de Opciones.

Añade las pistas a `tracks.json` y asigna sus identificadores a las listas de cada zona. `src` es relativo a esta carpeta. Ejemplo:

```json
{
  "version": 1,
  "tracks": [
    { "id": "tejados-01", "title": "Luces de Lumera", "src": "tejados-01.mp3", "gain": 0.7 },
    { "id": "tejados-02", "title": "Sobre los tejados", "src": "tejados-02.mp3", "gain": 0.65 },
    { "id": "bosque-01", "title": "El bosque despierta", "src": "bosque-01.mp3", "gain": 0.7 }
  ],
  "playlists": {
    "menu": ["tejados-01"],
    "roofs": ["tejados-01", "tejados-02"],
    "forest": ["bosque-01"],
    "sewers": [],
    "district": [],
    "tower": [],
    "boss": [],
    "ending": ["tejados-01"]
  }
}
```

Las listas con varias pistas avanzan al terminar cada canción y rotan al volver a la zona. Una lista con una sola pista la repite. El campo opcional `loop: true` hace que una pista se repita hasta abandonar la zona. `gain` permite equilibrar cada canción entre 0 y 1; después se aplica el volumen elegido por el jugador. Al pausar o cambiar de pestaña, la canción conserva su posición.

Las zonas sin pistas asignadas usan el respaldo sintetizado. También se pueden utilizar URLs HTTPS de un servidor que permita CORS. Para que una banda sonora nueva quede disponible al distribuir otra versión del juego, incluye sus archivos y actualiza la versión de la caché del service worker.

API opcional para futuras herramientas: `Audio.configureTracks(manifest)` reemplaza la configuración; `Audio.getMusicStatus()` devuelve el modo de reproducción y el título actual. Los métodos habituales `playMusic`, `pauseMusic`, `resumeMusic`, `stopMusic` y los volúmenes siguen funcionando.
