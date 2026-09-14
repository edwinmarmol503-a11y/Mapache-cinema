# MAPACHE CINEMA: LA ÚLTIMA NOCHE

Videojuego 2D pixel-art para navegador. **HTML5 + CSS3 + JavaScript (ES6 modules)**.
Sin frameworks, sin motores externos, sin dependencias. Todo el gameplay se
renderiza en un `<canvas>` 2D a resolución interna baja (480×270) y se escala
por CSS con `image-rendering: pixelated`.

Lumera es una ciudad nocturna cuyas luces guardan recuerdos. Una noche empiezan
a apagarse. **Riko**, un mapache de los tejados, cruza cinco zonas para llegar
hasta **El Farolero**, que lo estaba guardando todo.

---

## Cómo ejecutar

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
| Saltar        | `Espacio`  (altura variable, coyote-time, buffer, **doble salto** — el 2º a media altura) |
| Atacar        | `J`  (o **caer encima** de un enemigo: −1 vida al enemigo, 0 a Riko, rebota) |
| Esquivar      | `Shift`  (i-frames + impulso) |
| Parada        | `L`  (contraataque perfecto — solo **3 cargas** por nivel/reintento) |
| Interactuar   | `E`                      |
| Lanzar objeto | `K`  (lata seleccionada) |
| Cambiar objeto| `Q` / `R`                |
| Pausa         | `Esc`                    |

`↓` + salto para bajar de plataformas de un sentido.

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
css/   style.css · menu.css · game.css · ui.css
js/    main.js          bootstrap + game loop (requestAnimationFrame, fixed step)
       input.js         input centralizado + rebinding
       audio.js         Web Audio API (música y SFX 100% procedurales)
       save.js          localStorage (progreso + opciones)
       particles.js     sistema de partículas con pooling
       camera.js        cámara 2D (follow suave, límites, shake, zoom)
       physics.js       físicas de plataformas + colisión con tilemap (AABB barrido)
       collision.js     primitivas AABB reutilizables
       sprites.js       PLACEHOLDERS pixel-art procedurales (Riko, enemigos, jefe)
       inventory.js     bolsa de objetos (llave, lata, bombilla, imán, cuerda)
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
3. **Las Alcantarillas** — enfocado en puzzles: caja + imán, palanca + plataforma, secuencia de botones.
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

- **A — Devolver la luz**
- **B — Conservar la luz**
- **C — Compartir la luz** *(final verdadero)*

## Guardado

`NUEVA PARTIDA` sobrescribe. `CONTINUAR` retoma desde el último checkpoint.
Para borrar el progreso desde la consola del navegador:
```js
MC.Save.clear()
```

## Placeholders

Todo el arte es procedural (formas dibujadas en canvas). Para sustituirlo por
sprite-sheets reales, reemplaza las funciones de `js/sprites.js` cargando
imágenes desde `assets/` — la lógica de juego no cambia. El audio es síntesis
por `Web Audio API`; puedes cambiar `js/audio.js` por `<audio>`/buffers si
añades ficheros a `assets/audio/`.
