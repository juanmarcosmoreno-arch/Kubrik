// Construcción de la malla de un chunk.
//
// Recorre todos los bloques y agrega SOLO las caras que dan a un bloque que
// no las tapa (aire, agua, vidrio, etc.). Las caras ocultas entre dos bloques
// sólidos nunca se generan, lo que reduce muchísimo la cantidad de triángulos.
//
// El resultado son arrays tipados por capa de render (opaca, recortada y
// translúcida), sin dependencias de Three.js: así este módulo puede correr en
// un Web Worker más adelante (etapa 7).

import { BLOCK, BLOCKS, LAYER } from './blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE, Chunk } from './Chunk.js';
import { tileUV } from '../render/atlasLayout.js';

// Altura de la superficie del agua cuando no tiene agua arriba (un poco más
// baja que un bloque entero, para que se note el nivel).
const WATER_SURFACE = 0.875;

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

/** Acumulador de vértices de una capa. */
class LayerBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.vertexCount = 0;
  }

  /** Convierte lo acumulado a arrays tipados (o null si está vacía). */
  finish() {
    if (this.vertexCount === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices:
        this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices),
    };
  }
}

/**
 * ¿Hay que dibujar la cara de `self` que da hacia el bloque `neighbor`?
 * - Contra aire: siempre.
 * - Contra un bloque opaco: nunca (queda tapada).
 * - Contra uno no opaco (agua, vidrio, hojas): sí, salvo que sean del mismo
 *   tipo y ese tipo oculte caras entre iguales (cullSame).
 */
function isFaceVisible(self, neighborId) {
  const neighbor = BLOCKS[neighborId];
  if (!neighbor || neighbor.layer === null) return true; // aire o desconocido
  if (neighbor.opaque) return false;
  if (neighborId === self.id) return !self.cullSame;
  return true;
}

/**
 * Arma los datos de malla de un chunk.
 *
 * @param {Chunk} chunk el chunk a mallar
 * @param {(x:number, y:number, z:number) => number} sampleOutside función que
 *   devuelve el ID de bloque para coordenadas LOCALES fuera del chunk (para
 *   mirar los chunks vecinos en los bordes).
 * @returns {Array<null | {positions, normals, uvs, colors, indices}>} datos
 *   por capa, indexados por LAYER.
 */
export function buildChunkMesh(chunk, sampleOutside) {
  const layers = [new LayerBuilder(), new LayerBuilder(), new LayerBuilder()];
  const data = chunk.data;

  // Lectura de un vecino: rápido si está adentro del chunk, si no se delega.
  const sample = (x, y, z) => {
    // Debajo del mundo se considera sólido: la cara de abajo de la capa
    // y=0 nunca se ve, así que no se genera. Arriba del mundo hay aire.
    if (y < 0) return BLOCK.BEDROCK;
    if (y >= CHUNK_HEIGHT) return BLOCK.AIR;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return data[Chunk.index(x, y, z)];
    }
    return sampleOutside(x, y, z);
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = data[Chunk.index(x, y, z)];
        if (id === 0) continue;
        const block = BLOCKS[id];
        if (!block || block.layer === null) continue;

        const builder = layers[block.layer];
        // El agua sin agua arriba se dibuja un poco más baja.
        const topHeight = block.liquid && sample(x, y + 1, z) !== id ? WATER_SURFACE : 1;

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const neighborId = sample(x + dx, y + dy, z + dz);
          // Si la superficie del agua está bajada, la tapa se dibuja siempre
          // (aunque arriba haya un bloque) para que no quede un hueco.
          const loweredTop = dy === 1 && topHeight < 1;
          if (!loweredTop && !isFaceVisible(block, neighborId)) continue;

          const [u0, v0, u1, v1] = tileUV(block.tiles[face.tile]);
          const base = builder.vertexCount;
          for (const { pos, uv } of face.corners) {
            const py = pos[1] === 1 ? topHeight : 0;
            builder.positions.push(x + pos[0], y + py, z + pos[2]);
            builder.normals.push(dx, dy, dz);
            // En caras laterales de agua baja, recortar la textura igual que
            // la geometría para que no se estire.
            const vv = face.tile === 'side' && uv[1] === 1 ? topHeight : uv[1];
            builder.uvs.push(u0 + (u1 - u0) * uv[0], v0 + (v1 - v0) * vv);
            // Color de vértice: por ahora blanco (la oclusión ambiental por
            // vértice de la etapa 6 va a oscurecer acá las esquinas).
            builder.colors.push(1, 1, 1);
          }
          builder.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
          builder.vertexCount += 4;
        }
      }
    }
  }

  return layers.map((l) => l.finish());
}

export { LAYER };
