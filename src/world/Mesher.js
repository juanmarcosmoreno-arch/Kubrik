// Construcción de la malla de un chunk.
//
// Recorre todos los bloques y agrega SOLO las caras que dan a un bloque que
// no las tapa (aire, agua, vidrio, etc.). Las caras ocultas entre dos bloques
// sólidos nunca se generan, lo que reduce muchísimo la cantidad de triángulos.
//
// El resultado es UNA geometría por chunk (arrays tipados) con un grupo por
// capa de render (opaca, recortada y translúcida), sin dependencias de
// Three.js ni del DOM: así este módulo puede correr en un Web Worker (etapa 7).

import { BLOCK, BLOCKS } from './blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE, Chunk } from './Chunk.js';
import { tileUV } from '../render/atlasLayout.js';

// Altura de la superficie del agua cuando no tiene agua arriba (un poco más
// baja que un bloque entero, para que se note el nivel).
export const WATER_SURFACE = 0.875;

/**
 * Las 6 caras de un cubo. Para cada una: dirección del vecino, normal, la
 * textura que usa (top/side/bottom) y sus 4 esquinas con su UV.
 * El orden de las esquinas da triángulos en sentido antihorario vistos desde
 * afuera (cara frontal en Three.js).
 */
const FACES = [
  {
    // -X (izquierda)
    dir: [-1, 0, 0],
    tile: 'side',
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    // +X (derecha)
    dir: [1, 0, 0],
    tile: 'side',
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    // -Y (abajo)
    dir: [0, -1, 0],
    tile: 'bottom',
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    // +Y (arriba)
    dir: [0, 1, 0],
    tile: 'top',
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    // -Z (atrás)
    dir: [0, 0, -1],
    tile: 'side',
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    // +Z (adelante)
    dir: [0, 0, 1],
    tile: 'side',
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tablas precalculadas (todo en arrays tipados para que el bucle sea rápido)
// ---------------------------------------------------------------------------

const MAX_ID = 256;
/** Propiedades de cada ID de bloque. */
const OPAQUE = new Uint8Array(MAX_ID);
const LAYER_OF = new Int8Array(MAX_ID).fill(-1); // -1 = no se dibuja (aire)
const CULL_SAME = new Uint8Array(MAX_ID);
const LIQUID = new Uint8Array(MAX_ID);
/** UV de cada cara de cada bloque: [id * 24 + cara * 4 + (u0, v0, u1, v1)]. */
const FACE_UVS = new Float32Array(MAX_ID * 24);
for (const block of BLOCKS) {
  if (!block) continue;
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  LAYER_OF[block.id] = block.layer ?? -1;
  CULL_SAME[block.id] = block.cullSame ? 1 : 0;
  LIQUID[block.id] = block.liquid ? 1 : 0;
  if (!block.tiles) continue;
  FACES.forEach((face, f) => FACE_UVS.set(tileUV(block.tiles[face.tile]), block.id * 24 + f * 4));
}

/** Esquinas de cada cara, aplanadas: [cara * 20 + esquina * 5 + (x, y, z, u, v)]. */
const CORNERS = new Float32Array(6 * 20);
const NORMALS = new Float32Array(6 * 3);
const IS_SIDE = new Uint8Array(6);
FACES.forEach((face, f) => {
  NORMALS.set(face.dir, f * 3);
  IS_SIDE[f] = face.tile === 'side' ? 1 : 0;
  face.corners.forEach(({ pos, uv }, c) => CORNERS.set([...pos, ...uv], f * 20 + c * 5));
});

/**
 * Buffers que crecen solos y se reutilizan entre chunks (el mallado es
 * sincrónico, así que no hay dos chunks usándolos a la vez).
 */
class LayerBuffer {
  constructor() {
    this.positions = new Float32Array(4096 * 3);
    this.normals = new Float32Array(4096 * 3);
    this.uvs = new Float32Array(4096 * 2);
    this.vertexCount = 0;
  }

  /** Asegura lugar para 4 vértices más (duplica el tamaño si hace falta). */
  reserveQuad() {
    const needed = (this.vertexCount + 4) * 3;
    if (needed <= this.positions.length) return;
    const grow = (a, perVertex) => {
      const b = new Float32Array(Math.max(a.length * 2, needed / 3 * perVertex));
      b.set(a);
      return b;
    };
    this.positions = grow(this.positions, 3);
    this.normals = grow(this.normals, 3);
    this.uvs = grow(this.uvs, 2);
  }
}

const LAYERS = [new LayerBuffer(), new LayerBuffer(), new LayerBuffer()];

/** Agrega una cara (4 vértices) del bloque `id` en (x, y, z). */
function emitFace(buf, f, id, x, y, z, topHeight) {
  buf.reserveQuad();
  const P = buf.positions;
  const N = buf.normals;
  const T = buf.uvs;
  const uvBase = id * 24 + f * 4;
  const u0 = FACE_UVS[uvBase];
  const v0 = FACE_UVS[uvBase + 1];
  const du = FACE_UVS[uvBase + 2] - u0;
  const dv = FACE_UVS[uvBase + 3] - v0;
  const nx = NORMALS[f * 3];
  const ny = NORMALS[f * 3 + 1];
  const nz = NORMALS[f * 3 + 2];
  const side = IS_SIDE[f];
  for (let c = 0; c < 4; c++) {
    const k = f * 20 + c * 5;
    const v = buf.vertexCount++;
    const cy = CORNERS[k + 1];
    P[v * 3] = x + CORNERS[k];
    P[v * 3 + 1] = y + (cy === 1 ? topHeight : 0);
    P[v * 3 + 2] = z + CORNERS[k + 2];
    N[v * 3] = nx;
    N[v * 3 + 1] = ny;
    N[v * 3 + 2] = nz;
    // En caras laterales de agua baja, recortar la textura igual que la
    // geometría para que no se estire.
    const tv = CORNERS[k + 4];
    T[v * 2] = u0 + du * CORNERS[k + 3];
    T[v * 2 + 1] = v0 + dv * (side && tv === 1 ? topHeight : tv);
  }
}

/**
 * ¿Hay que dibujar la cara de `id` que da hacia el bloque `n`?
 * - Contra aire o un bloque no opaco (agua, vidrio, hojas): sí, salvo que
 *   sean del mismo tipo y ese tipo oculte caras entre iguales (cullSame).
 * - Contra un bloque opaco: nunca (queda tapada).
 */
function faceVisible(id, n) {
  if (OPAQUE[n]) return false;
  return !(n === id && CULL_SAME[id]);
}

/**
 * Arma los datos de malla de un chunk.
 *
 * @param {Uint8Array} data bloques del chunk
 * @param {{nx?: Uint8Array, px?: Uint8Array, nz?: Uint8Array, pz?: Uint8Array}} neighbors
 *   datos de los 4 chunks vecinos (-X, +X, -Z, +Z) para decidir las caras de
 *   los bordes. Si falta uno, se lo trata como aire.
 * @param {number} [maxY] bloque no-aire más alto del chunk (optimización)
 * @returns {null | {positions: Float32Array, normals: Float32Array, uvs: Float32Array,
 *   colors: Float32Array, indices: Uint16Array | Uint32Array,
 *   groups: {start: number, count: number, materialIndex: number}[]}}
 *   null si el chunk no tiene ninguna cara visible.
 */
export function buildChunkMesh(data, neighbors = {}, maxY = CHUNK_HEIGHT - 1) {
  const { nx, px, nz, pz } = neighbors;
  for (const l of LAYERS) l.vertexCount = 0;
  const neighbor = new Uint8Array(6); // -X, +X, -Y, +Y, -Z, +Z (orden de FACES)
  const lastX = CHUNK_SIZE - 1;
  const lastY = CHUNK_HEIGHT - 1;
  const top = Math.min(lastY, maxY);

  for (let y = 0; y <= top; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const idx = Chunk.index(x, y, z);
        const id = data[idx];
        if (id === 0) continue;
        const layer = LAYER_OF[id];
        if (layer < 0) continue;

        // Vecinos (en los bordes del chunk, del chunk de al lado). Debajo
        // del mundo se considera sólido: la cara de abajo de y=0 no se ve.
        neighbor[0] = x > 0 ? data[idx - 1] : nx ? nx[idx + lastX] : BLOCK.AIR;
        neighbor[1] = x < lastX ? data[idx + 1] : px ? px[idx - lastX] : BLOCK.AIR;
        neighbor[2] = y > 0 ? data[idx - 256] : BLOCK.BEDROCK;
        neighbor[3] = y < lastY ? data[idx + 256] : BLOCK.AIR;
        neighbor[4] = z > 0 ? data[idx - 16] : nz ? nz[idx + 240] : BLOCK.AIR;
        neighbor[5] = z < lastX ? data[idx + 16] : pz ? pz[idx - 240] : BLOCK.AIR;

        // Descarte rápido: bloque totalmente rodeado de bloques opacos.
        if (
          OPAQUE[neighbor[0]] &&
          OPAQUE[neighbor[1]] &&
          OPAQUE[neighbor[2]] &&
          OPAQUE[neighbor[3]] &&
          OPAQUE[neighbor[4]] &&
          OPAQUE[neighbor[5]]
        ) {
          continue;
        }

        // El agua sin agua arriba se dibuja un poco más baja; en ese caso la
        // tapa se dibuja siempre, aunque arriba haya algo (si no, queda un hueco).
        const lowered = LIQUID[id] && neighbor[3] !== id;
        const topHeight = lowered ? WATER_SURFACE : 1;
        const buf = LAYERS[layer];
        for (let f = 0; f < 6; f++) {
          if ((f === 3 && lowered) || faceVisible(id, neighbor[f])) {
            emitFace(buf, f, id, x, y, z, topHeight);
          }
        }
      }
    }
  }

  // Unir las capas en una sola geometría, con un grupo (rango de índices y
  // material) por capa. Los índices siguen siempre el mismo patrón por cara.
  let vertexCount = 0;
  for (const l of LAYERS) vertexCount += l.vertexCount;
  if (vertexCount === 0) return null;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3).fill(1); // AO en la etapa 6
  const indexCount = (vertexCount / 4) * 6;
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const groups = [];
  let v = 0;
  let i = 0;
  for (let layer = 0; layer < LAYERS.length; layer++) {
    const l = LAYERS[layer];
    if (l.vertexCount === 0) continue;
    positions.set(l.positions.subarray(0, l.vertexCount * 3), v * 3);
    normals.set(l.normals.subarray(0, l.vertexCount * 3), v * 3);
    uvs.set(l.uvs.subarray(0, l.vertexCount * 2), v * 2);
    const start = i;
    for (let q = 0; q < l.vertexCount; q += 4) {
      const b = v + q;
      indices[i++] = b;
      indices[i++] = b + 1;
      indices[i++] = b + 2;
      indices[i++] = b + 2;
      indices[i++] = b + 1;
      indices[i++] = b + 3;
    }
    groups.push({ start, count: i - start, materialIndex: layer });
    v += l.vertexCount;
  }
  return { positions, normals, uvs, colors, indices, groups };
}
