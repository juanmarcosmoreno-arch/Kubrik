// Gestión del mundo: conjunto de chunks, lectura/escritura de bloques en
// coordenadas globales y mallas de Three.js de cada chunk.

import * as THREE from 'three';
import { BLOCK, LAYER, getBlock } from './blocks.js';
import { CHUNK_HEIGHT, CHUNK_SIZE, Chunk } from './Chunk.js';
import { buildChunkMesh } from './Mesher.js';

/** Clave de un chunk en el Map: "cx,cz". */
export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/** Convierte una coordenada de bloque a coordenada de chunk. */
export function toChunkCoord(v) {
  return Math.floor(v / CHUNK_SIZE);
}

/** Coordenada local (0..15) dentro del chunk, también para negativos. */
export function toLocalCoord(v) {
  return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

export class World {
  /**
   * @param {THREE.Material[]} materials materiales indexados por LAYER
   */
  constructor(materials) {
    this.materials = materials;
    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    // Grupo que contiene todas las mallas de chunks (se agrega a la escena).
    this.group = new THREE.Group();
    this.group.name = 'mundo';
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** Devuelve el chunk, creándolo vacío si no existe. */
  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** ID del bloque en coordenadas globales (aire si el chunk no existe). */
  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const chunk = this.getChunk(toChunkCoord(x), toChunkCoord(z));
    if (!chunk) return BLOCK.AIR;
    return chunk.data[Chunk.index(toLocalCoord(x), y, toLocalCoord(z))];
  }

  /**
   * ¿El bloque en coordenadas globales es sólido (colisiona)?
   * Debajo del mundo (y < 0) se considera sólido: nadie puede caer al vacío
   * ni ver el piso desde abajo (el mesher no genera esas caras).
   */
  isSolid(x, y, z) {
    if (y < 0) return true;
    return getBlock(this.getBlock(x, y, z)).solid;
  }

  /**
   * Cambia un bloque en coordenadas globales. Marca para rearmar el chunk y,
   * si el bloque está en un borde, también el chunk vecino (su cara expuesta
   * puede cambiar).
   */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const lx = toLocalCoord(x);
    const lz = toLocalCoord(z);
    const chunk = this.ensureChunk(cx, cz);
    if (!chunk.set(lx, y, lz, id)) return false;

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  /** Rearma la malla de un chunk (reemplaza y libera la anterior). */
  rebuildChunk(chunk) {
    const ox = chunk.worldX;
    const oz = chunk.worldZ;
    // Para los bordes, leer del mundo con coordenadas globales.
    const sampleOutside = (x, y, z) => this.getBlock(ox + x, y, oz + z);
    const layerData = buildChunkMesh(chunk, sampleOutside);

    this.disposeChunkMeshes(chunk);
    for (let layer = 0; layer < layerData.length; layer++) {
      const d = layerData[layer];
      if (!d) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(d.indices, 1));
      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, this.materials[layer]);
      mesh.position.set(ox, 0, oz);
      mesh.matrixAutoUpdate = false; // el chunk no se mueve
      mesh.updateMatrix();
      // Lo translúcido (agua) se dibuja después de lo opaco.
      mesh.renderOrder = layer === LAYER.TRANSLUCENT ? 1 : 0;
      mesh.name = `chunk ${chunk.cx},${chunk.cz} capa ${layer}`;
      chunk.meshes.push(mesh);
      this.group.add(mesh);
    }
    chunk.dirty = false;
  }

  /** Rearma todos los chunks marcados como "sucios". Devuelve cuántos. */
  rebuildDirty() {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.rebuildChunk(chunk);
        count++;
      }
    }
    return count;
  }

  /** Saca de la escena y libera la memoria de las mallas de un chunk. */
  disposeChunkMeshes(chunk) {
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.meshes.length = 0;
  }

  /** Quita un chunk del mundo liberando su malla. */
  removeChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.disposeChunkMeshes(chunk);
    this.chunks.delete(key);
  }

  /** Libera todo el mundo. */
  dispose() {
    for (const chunk of this.chunks.values()) this.disposeChunkMeshes(chunk);
    this.chunks.clear();
  }
}
