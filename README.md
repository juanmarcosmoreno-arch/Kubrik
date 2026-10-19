<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo/megabrick-oscuro.webp" />
    <img src="public/logo/megabrick-claro.webp" alt="Megabrick" width="420" />
  </picture>
</p>

# Megabrick

**Megabrick** es un juego sandbox de bloques en primera persona que corre en el navegador. Recorrés un mundo hecho de cubos, lo explorás y construís bloque a bloque. Todo es original: el nombre, el diseño y las texturas, que se generan por código en pixel art de 16×16.

🎮 **Versión jugable:** https://juanmarcosmoreno-arch.github.io/Kubrik/

> Megabrick se juega en **PC o Mac con teclado y mouse**. Por ahora no está pensado para celulares ni tablets.

## Estado del desarrollo

El juego se construye por etapas. Siempre queda una versión jugable.

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Base jugable: cámara en primera persona, vuelo, piso de bloques, atlas procedural, FPS | ✅ |
| 2 | Mundo por chunks y terreno procedural infinito | ✅ |
| 3 | Física del jugador: gravedad, salto, colisiones, nado | ⏳ |
| 4 | Romper y poner bloques, hotbar, mira | ⏳ |
| 5 | Guardado en IndexedDB y menú de mundos | ⏳ |
| 6 | Ciclo día/noche, oclusión ambiental, sonidos, opciones | ⏳ |
| 7 | Rendimiento: Web Workers, cola de chunks priorizada | ⏳ |

## Requisitos

- [Node.js](https://nodejs.org/) 20.19 o más nuevo (recomendado: 22).
- Un navegador de escritorio con WebGL 2: Chrome, Edge, Firefox o Safari.

## Instalación

```bash
git clone https://github.com/juanmarcosmoreno-arch/Kubrik.git
cd Kubrik
npm install
```

## Cómo correrlo

```bash
npm run dev       # servidor de desarrollo con recarga automática
npm run build     # build de producción en la carpeta dist/
npm run preview   # sirve el build de producción para probarlo
```

`npm run dev` muestra en la consola la dirección para abrir el juego, por ejemplo `http://localhost:5173/megabrick/`.

### Semilla y distancia de render

Por ahora se eligen en la dirección del juego. El menú de mundos llega en la etapa 5 y el de opciones en la 6.

- `?semilla=lo-que-quieras`: la misma semilla genera siempre el mismo mundo. Acepta texto o un número. Sin este parámetro se usa `megabrick`.
- `?distancia=8`: distancia de render en chunks, de 2 a 16. Por defecto es 6.

Ejemplo: `http://localhost:5173/megabrick/?semilla=islas&distancia=8`.

## Controles

| Tecla | Acción |
|---|---|
| Clic en **Jugar** | Empezar a jugar (captura el mouse) |
| Clic en **Continuar** o en cualquier parte (en pausa) | Volver al juego |
| **W A S D** | Moverse |
| **Mouse** | Mirar |
| **Espacio** | Subir (modo vuelo) |
| **Shift** | Bajar (modo vuelo) |
| **V** | Cambiar la cámara: primera persona → tercera persona → de frente |
| **Esc** | Soltar el mouse y pausar |

Por ahora el jugador vuela. La gravedad, el salto y las colisiones llegan en la etapa 3.

## El mundo

El mundo es infinito y se genera a medida que te movés, en chunks de 16 × 16 bloques de base y 128 de alto.

- **Terreno:** sale de ruido simplex con varias octavas, que arma llanuras, colinas y algunas montañas. Las cimas muy altas son de piedra.
- **Capas:** césped arriba, 3 o 4 de tierra, piedra debajo y lecho primordial indestructible en y = 0.
- **Agua:** el mar está a una altura fija (y = 40) y es semitransparente. Hay arena en costas y fondos poco profundos.
- **Árboles:** se agrupan en bosques y también aparecen sueltos. Sus copas pasan de un chunk a otro sin cortarse.
- **Minerales:** cobrizo, azurita y solarita aparecen en vetas dentro de la piedra. Cuanto más raro el mineral, más hondo.
- **Carga de chunks:** se generan y mallan primero los más cercanos al jugador, con un tope de tiempo por frame para no trabar el juego. Los lejanos se liberan de la memoria.
- **Niebla:** tiene el color del cielo y tapa el borde del área cargada.

## Personaje

El protagonista de Megabrick es un personaje con estilo de juguete: formas redondeadas y acabado plástico. Lleva gorra con la "M", buzo con capucha y panel blanco con el logo, mochila negra, pantalón cargo y zapatillas. Contrasta con el mundo de bloques pixel art. Se arma por código: la cara, la gorra y los logos se dibujan en canvas, sin imágenes externas.

- **Colores:** verde, azul, rojo, amarillo, violeta y negro. Se elige en la pantalla de inicio y queda guardado en el navegador.
- **Expresiones:** normal, feliz, sorprendido, determinado y divertido, más un parpadeo automático. En la pantalla de inicio las va mostrando una por una. En el juego se pone feliz cuando sube volando.
- **Animación:** camina moviendo brazos y piernas, la cabeza sigue la mirada y el cuerpo gira con suavidad.
- **Cámara:** en primera persona no se ve. Con **V** pasa a tercera persona, desde atrás o de frente, y la cámara se acerca sola si atrás hay una pared.

## Estructura del código

```
index.html              → página: canvas, HUD y menús en HTML
vite.config.js          → configuración de Vite (ruta base para GitHub Pages)
public/
  logo/                 → logo de Megabrick (versión para fondo oscuro y para fondo claro)
  favicon.png           → ícono de la pestaña (emblema "M")
src/
  main.js               → arranque, estados del juego y loop principal
  style.css             → estilos del HUD y los menús
  world/
    blocks.js           → tipos de bloque y sus propiedades
    Chunk.js            → datos de un chunk de 16×128×16 (Uint8Array, 0 = aire)
    World.js            → chunks alrededor del jugador (carga/descarga), get/set de bloques, mallas
    Mesher.js           → una malla por chunk con solo las caras visibles (sin DOM, apto para workers)
    TerrainGen.js       → terreno procedural con semilla: alturas, capas, agua, árboles y minerales
  player/
    Player.js           → posición, orientación y movimiento
    Controls.js         → teclado, mouse y pointer lock
    Avatar.js           → modelo del personaje (piezas redondeadas), animación y expresiones
    ViewCamera.js       → cámara en primera y tercera persona (tecla V)
    Raycast.js          → (etapa 4) bloque apuntado con DDA
  render/
    atlasLayout.js      → ubicación de cada textura en el atlas (sin DOM, apto para workers)
    textures.js         → dibujo procedural del atlas (pixel art 16×16)
    materials.js        → materiales por capa: opaca, recortada (hojas/vidrio) y translúcida (agua)
    Sky.js              → cielo, iluminación y niebla (después también día/noche)
    avatarTextures.js   → cara, gorra y logos del personaje dibujados en canvas (6 colores, 5 expresiones)
    CharacterPreview.js → personaje girando en la pantalla de inicio
  ui/
    Hud.js              → FPS y avisos (después mira, hotbar y coordenadas)
    Menu.js             → pantalla de inicio (con selector de color) y menú de pausa
  save/
    Preferences.js      → preferencias del jugador (color del personaje)
    Storage.js          → (etapa 5) guardado en IndexedDB
```

### Bloques

| ID | Bloque | Notas |
|---|---|---|
| 0 | Aire | — |
| 1 | Césped | Superficie del terreno |
| 2 | Tierra | Debajo del césped |
| 3 | Piedra | Capa profunda |
| 4 | Lecho primordial | Roca base indestructible |
| 5 | Arena | Cerca del agua |
| 6 | Agua | Semitransparente |
| 7 | Tronco | Árboles |
| 8 | Follaje | Copa de los árboles, con huecos |
| 9 | Mineral de cobrizo | Veta naranja |
| 10 | Mineral de azurita | Veta azul |
| 11 | Mineral de solarita | Veta dorada, la más rara |
| 12 | Tablones | Para construir |
| 13 | Ladrillo de piedra | Para construir |
| 14 | Vidrio | Transparente, para construir |

Para agregar un bloque se suma una fila en `src/world/blocks.js` y, si necesita una textura nueva, su nombre en `src/render/atlasLayout.js` y su pintor en `src/render/textures.js`.

## Publicación en GitHub Pages

El workflow `.github/workflows/deploy.yml` arma el build y lo publica en GitHub Pages con cada push a `main`. Hay que activarlo una sola vez: en el repositorio, **Settings → Pages → Build and deployment → Source: GitHub Actions**.

La ruta base del build se toma del nombre del repositorio, porque GitHub Pages distingue mayúsculas en la ruta. Si el repositorio se renombra, por ejemplo a `megabrick`, el build se adapta solo y la versión jugable pasa a estar en `https://juanmarcosmoreno-arch.github.io/megabrick/`.
