# Banda sonora de Lumera

La versión 3.1.1 usa las 11 pistas MP3 del usuario en el menú, los cinco niveles, el jefe y el final. No genera la antigua música genérica; los efectos de salto, ataques y objetos conservan Web Audio API.

Las listas comparten una bolsa barajada: se selecciona al azar, se recorren las canciones antes de volver a mezclar y se evita repetir la anterior. Al terminar una pista comienza otra. Pausar conserva su posición y el volumen de música es independiente de los efectos.

## Rutas y publicación actual

El repositorio público recibió las canciones dentro de las carpetas de los bloques de subida:

- 01-AUDIOS-1-A-4/assets/audio/: pistas 01 a 04.
- 02-AUDIOS-5-A-8/assets/audio/: pistas 05 a 08.
- 03-AUDIOS-9-A-11/assets/audio/: pistas 09 a 11.

tracks.json apunta a esas rutas con src relativo a este manifiesto. alternateSrcs ofrece la ruta habitual de assets/audio/ para las copias locales completas. Si la primera ruta falla, se prueba la alternativa de la misma canción. Si ninguna funciona, se intenta otra pista; cuando ninguna está disponible, la música queda en silencio y el juego sigue con sus efectos.

Ejemplo:

```json
{ "id": "pista-01", "title": "Pista 01", "src": "../../01-AUDIOS-1-A-4/assets/audio/pista-01.mp3", "alternateSrcs": ["pista-01.mp3"], "gain": 0.65 }
```

Al reorganizar el repositorio, cambia src a pista-01.mp3 y guarda cada archivo directamente en assets/audio/. No es necesario modificar el reproductor. No borres las carpetas de los bloques mientras src siga apuntando a ellas.

El manifiesto admite hasta 20 pistas. gain de 0 a 1 se multiplica por el volumen elegido. Las listas se configuran con identificadores; una sola canción se repite. Los archivos originales de AUDIOS siguen intactos: se distribuyen 11 copias únicas de los 12 archivos recibidos, sin recodificarlos.

## Sin conexión

Solo se descarga la pista seleccionada, sin cargar toda la colección al inicio. La PWA guarda cada canción reproducida completamente y puede servirla sin conexión, también desde las carpetas de los bloques. Las canciones que todavía no se hayan guardado necesitan conexión. Si no hay una pista disponible, no se sustituye por música genérica.

Actualiza la versión de la caché al distribuir cambios. Audio.getMusicStatus() muestra el modo y la canción actual. Audio.configureTracks(manifest) reemplaza la configuración y permite volver a intentar archivos antes fallidos.
