// Datos de un chunk: una columna de 16 x 128 x 16 bloques.
//
// Los bloques se guardan como IDs en un Uint8Array (0 = aire). El índice
// lineal es x + z*16 + y*256: las capas horizontales quedan contiguas, lo
// que hace rápido recorrer el chunk de abajo hacia arriba.

import { BLOCK } from './blocks.js';

export const CHUNK_SIZE = 16; // ancho y largo (X y Z)
export const CHUNK_HEIGHT = 128; // alto (Y)
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

export class Chunk {
  /**
   * @param {number} cx coordenada X del chunk (en chunks, no en bloques)
   * @param {number} cz coordenada Z del chunk
   * @param {Uint8Array} [data] datos ya generados (opcional)
   */
  constructor(cx, cz, data) {
    this.cx = cx;
    this.cz = cz;
    this.data = data ?? new Uint8Array(CHUNK_VOLUME);
    if (this.data.length !== CHUNK_VOLUME) {
      throw new Error(`Datos de chunk con tamaño inválido: ${this.data.length}`);
    }
    // true cuando los bloques cambiaron y hay que rearmar la malla.
    this.dirty = true;
    // Mallas de Three.js por capa de render (las administra World).
    this.meshes = [];
  }

  /** Índice lineal dentro de `data` para coordenadas locales. */
  static index(x, y, z) {
    return x + (z << 4) + (y << 8);
  }

  /** ¿Las coordenadas locales están dentro del chunk? */
  static inBounds(x, y, z) {
    return (
      x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT
    );
  }

  /** ID del bloque en coordenadas locales (aire si está fuera de rango). */
  get(x, y, z) {
    if (!Chunk.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[Chunk.index(x, y, z)];
  }

  /** Cambia el bloque en coordenadas locales y marca el chunk como "sucio". */
  set(x, y, z, id) {
    if (!Chunk.inBounds(x, y, z)) return false;
    const i = Chunk.index(x, y, z);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.dirty = true;
    return true;
  }

  /** Coordenada X (en bloques) de la esquina del chunk. */
  get worldX() {
    return this.cx * CHUNK_SIZE;
  }

  /** Coordenada Z (en bloques) de la esquina del chunk. */
  get worldZ() {
    return this.cz * CHUNK_SIZE;
  }
}
