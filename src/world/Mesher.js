// Construcción de la malla de un chunk.
//
// Recorre todos los bloques y agrega SOLO las caras que dan a un bloque que
// no las tapa (aire, agua, vidrio, etc.). Las caras ocultas entre dos bloques
// sólidos nunca se generan, lo que reduce muchísimo la cantidad de triángulos.
//
// El resultado es UNA geometría por chunk (arrays tipados) con un grupo por
// capa de render (opaca, recortada y translúcida), sin dependencias de
// Three.js ni del DOM: así este módulo puede correr en un Web Worker (etapa 7).
//
// Oclusión ambiental por vértice: cada esquina de cada cara se oscurece según
// cuántos bloques sólidos la rodean (los rincones y la base de las paredes
// quedan en penumbra), y eso se guarda en el color del vértice.

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

// ---------------------------------------------------------------------------
// Copia del chunk con un borde de un bloque (de los 8 chunks vecinos): así
// los vecinos de cualquier bloque, también para la oclusión, se leen con un
// desplazamiento fijo, sin preguntar de qué chunk son.
// ---------------------------------------------------------------------------

const PAD_W = CHUNK_SIZE + 2; // 18
const PAD_AREA = PAD_W * PAD_W; // 324
const PAD_H = CHUNK_HEIGHT + 2; // y de -1 a 128
const padded = new Uint8Array(PAD_AREA * PAD_H);
/** Índice en la copia con borde de (x, y, z) locales (de -1 a 16 / 128). */
const padIndex = (x, y, z) => x + 1 + (z + 1) * PAD_W + (y + 1) * PAD_AREA;
/** Desplazamiento en la copia para moverse (dx, dy, dz). */
const padOffset = (dx, dy, dz) => dx + dz * PAD_W + dy * PAD_AREA;

/** Vecino de cada cara, en el orden de FACES. */
const FACE_OFFSET = new Int32Array(FACES.map((f) => padOffset(...f.dir)));

/**
 * Para la oclusión de cada esquina de cada cara: los 3 bloques que la rodean
 * del lado de afuera de la cara (dos de costado y el de la diagonal).
 * [cara * 12 + esquina * 3 + (costado 1, costado 2, diagonal)]
 */
const AO_OFFSETS = new Int32Array(6 * 12);
FACES.forEach((face, f) => {
  const normalAxis = face.dir.findIndex((v) => v !== 0);
  const [a1, a2] = [0, 1, 2].filter((a) => a !== normalAxis);
  face.corners.forEach(({ pos }, c) => {
    const s1 = [0, 0, 0];
    const s2 = [0, 0, 0];
    s1[a1] = pos[a1] === 1 ? 1 : -1;
    s2[a2] = pos[a2] === 1 ? 1 : -1;
    const n = face.dir;
    const side1 = padOffset(n[0] + s1[0], n[1] + s1[1], n[2] + s1[2]);
    const side2 = padOffset(n[0] + s2[0], n[1] + s2[1], n[2] + s2[2]);
    const diag = padOffset(n[0] + s1[0] + s2[0], n[1] + s1[1] + s2[1], n[2] + s1[2] + s2[2]);
    AO_OFFSETS.set([side1, side2, diag], f * 12 + c * 3);
  });
});

/** Brillo según cuántos lados de la esquina están libres (0 = rincón cerrado). */
const AO_LIGHT = new Float32Array([0.5, 0.67, 0.84, 1]);

/** Copia el chunk y el borde de sus vecinos (lo que falta cuenta como aire). */
function fillPadded(data, n) {
  padded.fill(BLOCK.AIR);
  // Debajo del mundo: sólido (no se ve la cara de abajo de y = 0).
  padded.fill(BLOCK.BEDROCK, 0, PAD_AREA);
  const last = CHUNK_SIZE - 1;
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    const yi = y << 8;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      padded.set(data.subarray(yi + (z << 4), yi + (z << 4) + CHUNK_SIZE), padIndex(0, y, z));
    }
    for (let i = 0; i < CHUNK_SIZE; i++) {
      if (n.nx) padded[padIndex(-1, y, i)] = n.nx[yi + (i << 4) + last];
      if (n.px) padded[padIndex(CHUNK_SIZE, y, i)] = n.px[yi + (i << 4)];
      if (n.nz) padded[padIndex(i, y, -1)] = n.nz[yi + (last << 4) + i];
      if (n.pz) padded[padIndex(i, y, CHUNK_SIZE)] = n.pz[yi + i];
    }
    if (n.nxnz) padded[padIndex(-1, y, -1)] = n.nxnz[yi + (last << 4) + last];
    if (n.pxnz) padded[padIndex(CHUNK_SIZE, y, -1)] = n.pxnz[yi + (last << 4)];
    if (n.nxpz) padded[padIndex(-1, y, CHUNK_SIZE)] = n.nxpz[yi + last];
    if (n.pxpz) padded[padIndex(CHUNK_SIZE, y, CHUNK_SIZE)] = n.pxpz[yi];
  }
}

/**
 * Buffers que crecen solos y se reutilizan entre chunks (el mallado es
 * sincrónico, así que no hay dos chunks usándolos a la vez).
 */
class LayerBuffer {
  constructor() {
    this.positions = new Float32Array(4096 * 3);
    this.normals = new Float32Array(4096 * 3);
    this.uvs = new Float32Array(4096 * 2);
    this.light = new Float32Array(4096); // oclusión de cada vértice
    this.flip = new Uint8Array(1024); // por cara: dividir por la otra diagonal
    this.vertexCount = 0;
  }

  /** Asegura lugar para 4 vértices más (duplica el tamaño si hace falta). */
  reserveQuad() {
    const needed = (this.vertexCount + 4) * 3;
    if (needed <= this.positions.length) return;
    const grow = (a, perVertex) => {
      const b = new a.constructor(Math.max(a.length * 2, (needed / 3) * perVertex));
      b.set(a);
      return b;
    };
    this.positions = grow(this.positions, 3);
    this.normals = grow(this.normals, 3);
    this.uvs = grow(this.uvs, 2);
    this.light = grow(this.light, 1);
    this.flip = grow(this.flip, 0.25);
  }
}

const LAYERS = [new LayerBuffer(), new LayerBuffer(), new LayerBuffer()];

/** Agrega una cara (4 vértices) del bloque `id` en (x, y, z); `pi`: su índice en la copia con borde. */
function emitFace(buf, f, id, x, y, z, pi, topHeight) {
  buf.reserveQuad();
  const P = buf.positions;
  const N = buf.normals;
  const T = buf.uvs;
  const L = buf.light;
  const quad = buf.vertexCount >> 2;
  // El agua no lleva oclusión (se vería manchada).
  const shade = !LIQUID[id];
  const aoBase = f * 12;
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
    let ao = 3;
    if (shade) {
      const o = aoBase + c * 3;
      // Los desplazamientos ya incluyen el paso hacia afuera de la cara.
      const s1 = OPAQUE[padded[pi + AO_OFFSETS[o]]];
      const s2 = OPAQUE[padded[pi + AO_OFFSETS[o + 1]]];
      ao = s1 && s2 ? 0 : 3 - s1 - s2 - OPAQUE[padded[pi + AO_OFFSETS[o + 2]]];
    }
    L[v] = ao;
  }
  // El cuadrado se divide en dos triángulos por la diagonal 1-2. Si la otra
  // (0-3) une las esquinas más claras, se usa esa: así la sombra queda en su
  // rincón y no se estira en una raya.
  const b = quad * 4;
  buf.flip[quad] = L[b] + L[b + 3] > L[b + 1] + L[b + 2] ? 1 : 0;
  for (let c = 0; c < 4; c++) L[b + c] = AO_LIGHT[L[b + c]];
}

/**
 * ¿Hay que dibujar la cara de `id` que da hacia el bloque `n`?
 * - Contra aire o un bloque no opaco (agua, vidrio, hojas): sí, salvo que
 *   sean del mismo tipo y ese tipo oculte caras entre iguales (cullSame).
 * - Contra un bloque opaco: nunca (queda tapada).
 * - El agua, solo contra aire.
 */
function faceVisible(id, n) {
  if (OPAQUE[n]) return false;
  // El agua solo muestra su superficie hacia el aire: contra vidrio u hojas
  // dibujan esos bloques (si no, las dos caras se pisan y parpadean).
  if (LIQUID[id] && n !== BLOCK.AIR) return false;
  return !(n === id && CULL_SAME[id]);
}

/**
 * Arma los datos de malla de un chunk.
 *
 * @param {Uint8Array} data bloques del chunk
 * @param {{nx?: Uint8Array, px?: Uint8Array, nz?: Uint8Array, pz?: Uint8Array,
 *   nxnz?: Uint8Array, pxnz?: Uint8Array, nxpz?: Uint8Array, pxpz?: Uint8Array}} neighbors
 *   datos de los 8 chunks vecinos (-X, +X, -Z, +Z y las diagonales) para las
 *   caras y la oclusión de los bordes. Si falta uno, se lo trata como aire.
 * @param {number} [maxY] bloque no-aire más alto del chunk (optimización)
 * @returns {null | {positions: Float32Array, normals: Float32Array, uvs: Float32Array,
 *   colors: Float32Array, indices: Uint16Array | Uint32Array,
 *   groups: {start: number, count: number, materialIndex: number}[]}}
 *   null si el chunk no tiene ninguna cara visible.
 */
export function buildChunkMesh(data, neighbors = {}, maxY = CHUNK_HEIGHT - 1) {
  for (const l of LAYERS) l.vertexCount = 0;
  fillPadded(data, neighbors);
  const neighbor = new Uint8Array(6); // -X, +X, -Y, +Y, -Z, +Z (orden de FACES)
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

        // Vecinos (en los bordes, del chunk de al lado; debajo del mundo,
        // sólido: la cara de abajo de y = 0 no se ve).
        const pi = padIndex(x, y, z);
        for (let f = 0; f < 6; f++) neighbor[f] = padded[pi + FACE_OFFSET[f]];

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
            emitFace(buf, f, id, x, y, z, pi, topHeight);
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
  const colors = new Float32Array(vertexCount * 3);
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
    for (let k = 0; k < l.vertexCount; k++) {
      const light = l.light[k];
      colors[(v + k) * 3] = light;
      colors[(v + k) * 3 + 1] = light;
      colors[(v + k) * 3 + 2] = light;
    }
    const start = i;
    for (let q = 0; q < l.vertexCount; q += 4) {
      const b = v + q;
      if (l.flip[q >> 2]) {
        indices[i++] = b;
        indices[i++] = b + 1;
        indices[i++] = b + 3;
        indices[i++] = b;
        indices[i++] = b + 3;
        indices[i++] = b + 2;
      } else {
        indices[i++] = b;
        indices[i++] = b + 1;
        indices[i++] = b + 2;
        indices[i++] = b + 2;
        indices[i++] = b + 1;
        indices[i++] = b + 3;
      }
    }
    groups.push({ start, count: i - start, materialIndex: layer });
    v += l.vertexCount;
  }
  return { positions, normals, uvs, colors, indices, groups };
}
