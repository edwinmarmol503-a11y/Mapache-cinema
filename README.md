# MAPACHE CINEMA: LA ÚLTIMA NOCHE

Videojuego 2D pixel-art para navegador. **HTML5 + CSS3 + JavaScript (ES6 modules)**.
Sin frameworks ni motores externos en el juego. Todo el gameplay se
renderiza en un `<canvas>` 2D con un mundo lógico de 480×270. El dibujo utiliza
una resolución de 960×540 a 1920×1080, según la pantalla, para conservar las
formas del pixel art y mostrar letras nítidas sin modificar las colisiones.

Lumera es una ciudad nocturna cuyas luces guardan recuerdos. Una noche empiezan
a apagarse. **Riko**, un mapache de los tejados, cruza cinco zonas para llegar
hasta **El Farolero**, que lo estaba guardando todo.

---

## Cómo ejecutar

Juego publicado: https://edwinmarmol503-a11y.github.io/Mapache-cinema/

**Versión local 6.0.1:** abre `INICIAR-JUEGO.cmd` y entra en `http://127.0.0.1:4174`.
La copia descargada consulta la misma clasificación mundial. Necesita Node.js;
el lanzador también reconoce el Node incluido
en este equipo con Codex. No necesita WampServer, PHP ni MySQL.

El escenario se ajusta automáticamente al mayor tamaño posible dentro del
marco, manteniendo su proporción 16:9 y el pixel art.
También funciona con la escala de Windows al 125% o 150%. En celular se ajusta
siempre al espacio disponible en horizontal, respetando las zonas seguras de
la pantalla; los menús también pueden usarse en vertical. El tamaño siempre
se ajusta automáticamente; la antigua opción de escala se ha retirado.

Al abrir una actualización, el cargador prepara primero la nueva caché y después
inicia el juego. Así se evita mezclar módulos antiguos con una pantalla nueva.
Las partidas y opciones guardadas se conservan; una copia ya instalada sigue
funcionando sin conexión y una partida activa nunca se recarga automáticamente.

El servidor de desarrollo (`pnpm start`, Node.js 24+, puerto 4173) incluye una
base SQLite de prueba en `.local/ranking.sqlite`.
Sus datos de prueba no se publican en la clasificación mundial. El juego alojado
y las copias descargadas utilizan la URL HTTPS de `js/config.js` para consultar
la misma base D1. El servidor de desarrollo configura su propia URL para probar
sin alterar los récords públicos.

Para trabajar desde terminal:

```bash
pnpm install
pnpm start
pnpm test
pnpm build
```

Solo las herramientas de desarrollo usan dependencias; el navegador y el
servidor de clasificación conservan JavaScript sin frameworks.

Los módulos ES necesitan servirse por HTTP (no `file://`).

1. Abre la carpeta en **Visual Studio Code**.
2. Instala la extensión **Live Server**.
3. Clic derecho en `index.html` → **Open with Live Server**.

Alternativas:
```bash
npx serve .
# o
python -m http.server
```
Luego abre `http://localhost:PUERTO`.

---

## Controles (reconfigurables en Opciones)

| Acción        | Tecla por defecto        |
|---------------|--------------------------|
| Mover         | `A` / `D` o `←` / `→`    |
| Saltar        | `W` / `↑` (altura variable, coyote-time, buffer, **doble salto** al soltar y volver a pulsar) |
| Atacar        | `J`  (o **caer encima** de un enemigo: −1 vida al enemigo, 0 a Riko, rebota) |
| Esquivar      | `Shift`  (i-frames + impulso) |
| Parada        | `L`  (contraataque perfecto — solo **3 cargas** por nivel/reintento) |
| Interactuar   | `E`                      |
| Lanzar objeto | `K`  (lata seleccionada) |
| Cambiar objeto| `Q` / `R`                |
| Emote         | `G` (cuatro gestos alternados) |
| Pausa         | `Esc`                    |

`↓` permite bajar de plataformas de un sentido.

Selecciona **Recuerdos** con Q/R y pulsa E: cada **3 recuerdos recuperan un
corazón**. Se acumulan entre niveles y se guardan; con vida completa no se gastan.
Los cuatro emotes son acostarse, voltereta, saludo a cámara y baile. Son visuales:
no dan invulnerabilidad y se interrumpen al moverse, atacar o recibir daño.
En mando se usa L3 (editable); en celular, MÁS → GESTO.

**Parada (L):** justo antes de recibir un golpe (Sombra, Cuervo, Devorador,
Guardián, proyectil o el jefe), pulsa `L`. Si aciertas: no recibes daño, el mundo
hace un *freeze-frame*, el atacante queda aturdido y recibe daño, y los
proyectiles se reflejan. Gastas 1 de 3 cargas solo si la parada tiene éxito; las
cargas se recargan al empezar/reiniciar un nivel. Se muestran como rombos azules
en el HUD.

La oscuridad está limitada a un rango nocturno "oscuro pero legible"; Riko lleva
su propia luz (círculo reducido) y siempre se dibuja por encima de la penumbra.

---

## Estructura

```
index.html
css/   style.css · menu.css · game.css · ui.css · touch.css
       controller-settings.css · death.css · typography.css · endings.css
js/    bootstrap.js     actualización coherente de caché antes de importar el juego
       main.js          game loop (requestAnimationFrame, fixed step)
       input.js         input centralizado + rebinding
       gamepad.js       mando estándar: lectura, navegación y desconexión segura
       controller-bindings.js  botones del mando, captura e intercambio de acciones
       controller-settings.js  editor de botones operable desde el televisor
       control-mode.js         teclado/táctil automáticos; mando mediante Código
       developer-controls.js  acceso al mando y previsualización de finales desde Créditos
       endings.js       tres escenas y narraciones distintas según la decisión
       emotes.js        cuatro animaciones cosméticas de Riko
       ranking-session.js     persistencia y validación de tickets al continuar
       audio.js         canciones en orden y clips de muerte/reaparición
       save.js          localStorage (progreso + opciones)
       particles.js     sistema de partículas con pooling
       camera.js        cámara 2D (follow suave, límites, shake, zoom)
       physics.js       físicas de plataformas + colisión con tilemap (AABB barrido)
       collision.js     primitivas AABB reutilizables
       sprites.js       PLACEHOLDERS pixel-art procedurales (Riko, enemigos, jefe)
       inventory.js     bolsa de objetos (llave, lata, bombilla, imán, cuerda, recuerdos)
       items.js         pickups, recuerdos y proyectiles
       player.js        Riko: movimiento, salto, esquiva, ataque, daño, muerte
       enemies.js       base Enemy + Sombra / Cuervo / Devorador / Guardián
       boss.js          El Farolero (3 fases, escudo roto encendiendo faroles)
       puzzles.js       elementos modulares: botón, palanca, puerta, plataforma,
                        caja, imán, cuerda, nodo de luz, secuencia
       levels.js        TileMap + 5 niveles definidos como DATOS (feature list)
       dialogue.js      diálogo tipo máquina de escribir + menús de decisión
       ui.js            HUD en canvas + fondos parallax
       menu.js          menú principal / opciones / créditos (DOM)
       pause.js         menú de pausa (DOM)
       game.js          WORLD: une todo, transiciones, checkpoints, finales
assets/  carpetas para sprites/audio definitivos (ver assets/README.txt)
```

## Niveles

1. **Los Tejados** — tutorial: mover, saltar, interactuar, objeto, puzzle botón-puerta, combate.
2. **El Bosque Azul** — oscuridad, bombillas, exploración. Se descubre: *las luces contienen recuerdos.*
3. **Las Alcantarillas** — enfocado en puzzles: caja + imán, plataforma y secuencia de botones. Las barreras del imán y de la secuencia llegan del techo al suelo; deben resolverse y no se pueden saltar.
4. **El Distrito Abandonado** — lluvia, calles vacías. Se revela la motivación del Farolero.
5. **La Torre del Farolero** — ascenso vertical + arena del jefe.

### El Farolero (jefe, estilo Bowser)

Vuela **alto y fuera de alcance**, escupiendo orbes que quitan vida e invocando
enemigos aleatorios (Sombra / Cuervo / Devorador / Guardián). Cada pocos segundos
**baja en picado** y barre el suelo de la arena — ese es el **único momento** para
dañarlo: golpéalo con `J` o **cae sobre su cabeza** (usa el doble salto para
alcanzarlo). Un golpe lo lanza de vuelta arriba. **3 fases** por vida: cada una
baja antes, lanza patrones más densos y mantiene más enemigos a la vez.

## Dificultades  (menú NIVELES)

| Modo | Cambios |
|------|---------|
| **Fácil** | Mitad de enemigos, +vida y +daño para ti (4 corazones), muchos más objetos. |
| **Normal** | La experiencia por defecto. |
| **Difícil** | Más enemigos, +1 vida y ~×1.35 velocidad, jefe más resistente. |
| **Pesadilla** | Como Difícil + `J` y pisar **no hacen daño**: solo la PARADA (aquí **ilimitada**, ∞ en el HUD) y la esquiva. 2 corazones. |

**NIVELES** abre un selector: pestañas de dificultad + 5 tarjetas. En cada dificultad,
el nivel *N* se desbloquea al superar el *N-1* de esa misma dificultad (el progreso
es permanente, aparte de la partida). `JUGAR` = Normal desde el principio.

## Finales (se guardan en `localStorage`)

- **A — Devolver la luz:** Riko restaura la ciudad con una onda de luz.
- **B — Conservar la luz:** el poder corrompe a Riko; flota en la esfera con sus nuevos aliados.
- **C — Compartir la luz:** la luz se reparte entre todos *(final verdadero)*.

Créditos → Código permite abrir una galería de los tres finales con el código
de previsualización del desarrollador. Verlos allí no modifica la partida,
los finales desbloqueados ni la clasificación.

## Guardado

`JUGAR` inicia una campaña Normal nueva. `NIVELES` permite elegir dificultad.
Empezar en el primer nivel registra también una campaña completa. `CONTINUAR`
retoma desde el último checkpoint. Los tickets de clasificación válidos se
conservan; un guardado antiguo sin ticket sigue siendo local para ese nivel.
Para borrar el progreso desde la consola del navegador:
```js
MC.Save.clear()
```

## Arte, música y reaparición

Todo el arte es procedural (formas dibujadas en canvas). Para sustituirlo por
sprite-sheets reales, reemplaza las funciones de `js/sprites.js` cargando
imágenes desde `assets/` — la lógica de juego no cambia. Los efectos se sintetizan
con `Web Audio API`. Hay **38 canciones MP3 y cuatro clips cortos**: **ARCADE** en el menú,
**CHUTY VS ACZINO** durante el jefe, **LO QUE SOY** en los finales A y C y
**FINAL MALO** en el final B.
Las otras **34 suenan en orden**, desde pista-01 y pista-02, después pista-04
hasta pista-33, pista-35 y pista-36. Al terminar la lista vuelve a la primera.
Todas las zonas y dificultades comparten el recorrido; el siguiente ID se
conserva en este navegador. Se elige otra al entrar en un nivel o reaparecer
después de morir; los textos,
opciones, créditos informativos, pausa y reinicio manual conservan canción y
posición. Si una canción de nivel termina se repite la misma.

Al morir se conserva la animación del cuerpo y el alma de Riko. Después el
fondo queda negro **0.5 segundos** y suena una de tres grabaciones de
burla, alternadas en orden. Después aparece la frase de muerte en
pantalla completa mientras continúa el audio, y espera una **pulsación nueva de cualquier
botón o tecla**, o un toque. Mantener el botón que causó la muerte no reanuda
solo. Confirmar corta la burla; Riko vuelve al checkpoint y se puede jugar
mientras suena **REAPARICION**; al terminar ese clip empieza la siguiente canción
de nivel. Una nueva muerte, salida al menú o transición cancela los sonidos y
continuaciones pendientes. Los cuatro clips usan **Volumen efectos**.

Los finales A y C incluyen globos aerostáticos, fuegos artificiales y luces del
cielo; el B tiene una esfera de luz corrupta y enemigos aliados. **FELICIDADES** tiene brillo
dorado y destellos; **EKD** aparece a la izquierda y **3E** a la derecha. El botón
**Volver al menú** queda abajo a la derecha; en mando también funciona el botón
asignado a **Atacar**. Si no se pulsa, se vuelve al menú al terminar la canción del final.
Los efectos reducidos y la preferencia de movimiento reducido detienen los
adornos animados del cielo y el brillo del título.

Opciones controla música y efectos por separado. Los originales de `AUDIOS/`
permanecen intactos; una copia antigua duplicada se omite. Consulta
`assets/audio/README.md` e `INVENTARIO.md` para títulos y huellas de los archivos.

## Clasificación compartida

- Tablas independientes para Fácil, Normal, Difícil y Pesadilla, por cada uno de
  los cinco niveles o por campaña completa. El menor tiempo gana; cada jugador
  conserva su mejor resultado por tabla. Los empates se ordenan por fecha y jugador.
- El servidor entrega un ticket al comenzar y valida el tiempo activo de juego.
  Pausas, diálogos, introducciones, espera para reaparecer y demoras de conexión
  no aumentan el cronómetro. El reloj del dispositivo no determina el resultado.
- Una campaña exige cinco niveles vinculados y completados en orden, desde el
  principio, y elegir un final. Entrar directamente a otro nivel registra ese
  nivel; nunca fabrica un tiempo de campaña.
- Para participar se utiliza un apodo y una identidad anónima persistente en el
  navegador. No requiere Google Play ni Play Store. El servidor guarda el hash
  de esa identidad, apodo, dificultad, nivel/campaña, mejor tiempo, final, muertes
  y tickets. El progreso, opciones y récords locales permanecen en el dispositivo.
- Borrar los datos del navegador crea otra identidad. Todavía no hay cuenta,
  recuperación entre dispositivos ni guardado de progreso en la nube.
- Sin conexión al comenzar, la partida es local. Si se pierde la conexión al
  terminar una partida iniciada en línea, el envío se conserva hasta que expire
  su ticket (6 horas por nivel, 24 horas por campaña) y se reintenta automáticamente.
  Esa demora no suma al tiempo. La tabla almacenada sin conexión se etiqueta.
- Pesadilla con la ayuda automática tras 25 muertes se publica en la categoría
  **Con ayuda**, separada de **Estándar**. El apodo conserva solo el nombre elegido.
- Los récords locales antiguos sin ticket no se pueden convertir en resultados
  mundiales. Una partida nueva iniciada en línea puede registrar nuevos tiempos.
- Tickets, validación de datos, límites de solicitudes y envíos idempotentes
  reducen tiempos imposibles y duplicados. El juego se ejecuta en el navegador:
  estas medidas no verifican cada movimiento ni impiden todas las trampas.

El backend está en `server/`; su esquema en `db/schema.ts` y las migraciones
de producción en `drizzle/`. El alojamiento usa `.openai/hosting.json` y el
binding D1 `DB`. Las migraciones se aplican al publicar, nunca al recibir una
partida. `migrations/0001_ranking.sql` es la versión del emulador de desarrollo.

## Controles móviles y ambientes

Joystick con zona muerta, histéresis y movimientos diagonales. Empujar hacia
arriba salta; volver al centro y subir de nuevo hace el doble salto. No hay
botón SALTO adicional. ATQ, ESQ y USAR forman un arco cómodo a la derecha;
MÁS abre BLOQ, LANZA, GESTO y cambio de objeto. Hacia abajo permite bajar plataformas;
la dirección también orienta la parada. Opciones permite cruceta clásica o
acciones a la izquierda para zurdos. Los botones de acción avanzan los textos
con una pulsación nueva; mantener un botón no descarta toda la conversación.
Pausar, cancelar un toque o cambiar de pestaña libera los controles.

Opciones ofrece **Noche original**, **Noche clara** y **Día**. Día cambia cielo,
sol, nubes, fachadas, vegetación, terrenos y reflejos. Las alcantarillas siguen
siendo subterráneas con luz desde rejillas. La ambientación no cambia colisiones,
puzzles ni dificultad. Efectos reducidos elimina lluvia, relámpagos y parte de
las partículas decorativas.

Hay decoración y señales específicas en cada zona, menú adaptable, pantalla de
carga con recuperación y guardado coherente de llaves, bombillas y puzzles al
recargar. El cronómetro superior indica si la partida es ONLINE o LOCAL.

## Verificación

La versión 6.0.1 incorpora Monocraft local, menú a la derecha con glitch ocasional,
tres escenas finales, recuerdos para curarse, cuatro emotes, barra del jefe abajo
y clasificación por tiempo activo con categoría de ayuda. Conserva los botones
de mando editables, la lista musical en orden y las barreras obligatorias de los
puzzles. Las pruebas automáticas de
mandos utilizan dispositivos simulados; la comodidad de cada configuración
y la compatibilidad física deben comprobarse en el equipo del evento.

`pnpm test` prueba clasificación con SQLite real, identidad entre dispositivos,
concurrencia, reintentos, reinicios, partidas continuadas, inventario y multitouch.
`tests/visual-review.html` comprueba niveles, dificultades, diálogos, jefe y finales.
Los revisores `tests/release-review.mjs` y `tests/world-review.mjs` usan Playwright
(instalado aparte o mediante la variable `PLAYWRIGHT_MODULE`) para la prueba de
dos navegadores, PWA sin conexión y ambientes. Las capturas quedan en `test-results/`.
`tests/cache-upgrade-review.mjs` verifica en Chromium que una caché antigua no
mezcla módulos con el HTML nuevo, conserva la partida y funciona sin conexión.
`tests/sequence-gate.test.mjs` comprueba la secuencia, intentos de salto/esquiva
en las cuatro dificultades y la restauración de puzzles guardados.

## Controles para la exposición

Créditos contiene el apartado **Código**. El código simplificado del desarrollador
habilita directamente **Mando** y permite configurar sus botones. Ya no muestra
las opciones Táctil y Teclado dentro de este acceso. El acceso solo dura en la
página abierta: recargar o pulsar **Cerrar acceso de desarrollador**
restaura los controles normales del dispositivo. Las preferencias, los récords
y las partidas guardadas no se borran al cambiar la forma de jugar.

El código actual y las instrucciones privadas se conservan fuera de los archivos
públicos, en `.local/developer-controls/access.json` y
`.local/developer-controls/LEEME-PRIVADO.txt`. El cliente contiene únicamente su
verificador SHA-256 con sal. Este bloqueo de interfaz sirve para la exposición;
no equivale a autenticación de cuenta o a permisos comprobados en un servidor.
No incluyas la carpeta `.local` al subir el juego a GitHub.

El mando debe estar vinculado por Bluetooth con el dispositivo que ejecuta el
navegador. Reconocerlo en los ajustes del televisor no garantiza que su navegador
ofrezca **Gamepad API**. El panel muestra si el navegador lo admite, si detecta el
mando y si su distribución de botones es estándar. Para activar la lectura,
pulsa y suelta un botón y deja el stick centrado.

| Acción | DualShock 4 con distribución estándar |
| --- | --- |
| Mover / navegar | Stick izquierdo o cruceta |
| Saltar | ✕ (botón configurable; arriba en el stick no salta) |
| Confirmar menús | ✕ |
| Atacar | □ |
| Esquivar / volver | ○ |
| Interactuar | △ |
| Avanzar diálogo | Una pulsación nueva de cualquier acción |
| Parada / lanzar | L1 / R1 |
| Cambiar objeto | L2 / R2 |
| Pausar / reanudar | OPTIONS |
| Volver al menú tras completar el juego | Botón asignado a Atacar (□ de fábrica) |

En **Opciones → Botones del mando**, elige una acción con ✕, centra el stick y
suelta los botones; después pulsa el botón que quieras asignar. Si ese botón
ya tenía otra acción, se intercambian para que ambas sigan disponibles. Un
OPTIONS corto puede asignarse; mantener OPTIONS cancela la captura. **Restaurar
botones del mando** recupera la distribución original. Las asignaciones se
guardan en el navegador y las etiquetas del HUD se actualizan con cada cambio.
El stick sirve para moverse y apuntar; el salto usa su botón asignado. En los
menús ✕ y ○ conservan confirmar/volver para poder editar cualquier distribución.

Los menús, niveles y opciones se pueden recorrer con el mando. Izquierda y
derecha ajustan selectores y volumen. Puedes empezar con el apodo guardado o
RIKO. Si el mando se desconecta durante la partida, el juego se pausa y libera
los botones; al volver a conectarlo pide soltar las teclas y centrar el stick.

Referencias: [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
y [mandos en aplicaciones Samsung Tizen](https://developer.samsung.com/smarttv/develop/guides/user-interaction/gamepad.html).
Estas referencias no confirman la compatibilidad del modelo de televisor del evento.

El arco de controles táctiles sigue la disposición del ejemplo oficial de
[plataformas 2D de Microsoft](https://learn.microsoft.com/en-us/gaming/gdk/docs/features/common/game-streaming/building-touch-layouts/samples/game-streaming-touch-tak-sample-platformer?view=gdk-2604),
adaptado al salto con joystick solicitado para este juego.
