// Gestión del mundo: chunks cargados alrededor del jugador, lectura y
// escritura de bloques en coordenadas globales y mallas de cada chunk.
//
// El mundo es "infinito": cada frame se generan y mallan los chunks que
// faltan cerca del jugador (los más cercanos primero, con un tope de tiempo
// por frame para no trabar el juego) y se liberan los que quedaron lejos.

import * as THREE from 'three';
import { BLOCK, getBlock } from './blocks.js';
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

/** Tiempo máximo por frame (ms) para generar y mallar chunks. */
const DEFAULT_BUDGET_MS = 6;

export class World {
  /**
   * @param {THREE.Material[]} materials materiales indexados por LAYER
   * @param {import('./TerrainGen.js').TerrainGenerator} generator
   * @param {{renderDistance?: number}} [options]
   */
  constructor(materials, generator, { renderDistance = 6 } = {}) {
    this.materials = materials;
    this.generator = generator;
    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    // Grupo que contiene todas las mallas de chunks (se agrega a la escena).
    this.group = new THREE.Group();
    this.group.name = 'mundo';
    this._center = null; // chunk donde está el jugador
    this.setRenderDistance(renderDistance);
  }

  /**
   * Distancia de render en chunks. Se mallan los chunks hasta esa distancia;
   * se generan datos un anillo más allá (para saber qué caras de los bordes
   * se ven) y se liberan los que quedan bastante más lejos.
   */
  setRenderDistance(chunks) {
    this.renderDistance = Math.max(2, Math.min(16, Math.round(chunks)));
    const load = this.renderDistance + 1;
    // Desplazamientos (en chunks) dentro del radio de carga, del más cercano
    // al más lejano: ese es el orden de prioridad.
    this._offsets = [];
    for (let dz = -load; dz <= load; dz++) {
      for (let dx = -load; dx <= load; dx++) {
        const d = Math.hypot(dx, dz);
        if (d <= load) this._offsets.push({ dx, dz, d });
      }
    }
    this._offsets.sort((a, b) => a.d - b.d);
    this._center = null; // recalcular descargas en el próximo update

    // Distancia mínima (en bloques) entre el jugador y el borde del área
    // mallada, en el peor caso (jugador en una esquina de su chunk): es el
    // hueco entre su chunk y el chunk no mallado más cercano. La niebla tiene
    // que terminar antes de eso para que nunca se vea el borde.
    let edge = Infinity;
    const r = this.renderDistance;
    for (let dz = -r - 2; dz <= r + 2; dz++) {
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        if (Math.hypot(dx, dz) <= r) continue;
        const gapX = Math.max(0, Math.abs(dx) - 1) * CHUNK_SIZE;
        const gapZ = Math.max(0, Math.abs(dz) - 1) * CHUNK_SIZE;
        edge = Math.min(edge, Math.hypot(gapX, gapZ));
      }
    }
    this.edgeDistance = edge;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** ID del bloque en coordenadas globales (aire si el chunk no está cargado). */
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
   * Cambia un bloque en coordenadas globales (solo en chunks cargados).
   * Marca para rearmar el chunk y, si el bloque está en un borde, también el
   * chunk vecino (su cara expuesta puede cambiar).
   */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const lx = toLocalCoord(x);
    const lz = toLocalCoord(z);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.set(lx, y, lz, id)) return false;

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

  /** Genera los datos de un chunk con el generador de terreno. */
  _generate(cx, cz) {
    const { data, maxY } = this.generator.generateChunk(cx, cz);
    const chunk = new Chunk(cx, cz, data, maxY);
    this.chunks.set(chunkKey(cx, cz), chunk);
    return chunk;
  }

  /** ¿Están cargados los 4 vecinos? (hace falta para mallar los bordes) */
  _neighborsReady(cx, cz) {
    return (
      this.chunks.has(chunkKey(cx - 1, cz)) &&
      this.chunks.has(chunkKey(cx + 1, cz)) &&
      this.chunks.has(chunkKey(cx, cz - 1)) &&
      this.chunks.has(chunkKey(cx, cz + 1))
    );
  }

  /** Rearma la malla de un chunk (reemplaza y libera la anterior). */
  rebuildChunk(chunk) {
    const { cx, cz } = chunk;
    const neighbors = {
      nx: this.getChunk(cx - 1, cz)?.data,
      px: this.getChunk(cx + 1, cz)?.data,
      nz: this.getChunk(cx, cz - 1)?.data,
      pz: this.getChunk(cx, cz + 1)?.data,
    };
    const d = buildChunkMesh(chunk.data, neighbors, chunk.maxY);
    this.disposeChunkMesh(chunk);
    chunk.dirty = false;
    if (!d) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(d.indices, 1));
    for (const g of d.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    geometry.computeBoundingSphere();

    // Una sola malla por chunk; cada grupo usa el material de su capa
    // (Three.js dibuja lo translúcido después de lo opaco).
    const mesh = new THREE.Mesh(geometry, this.materials);
    mesh.position.set(chunk.worldX, 0, chunk.worldZ);
    mesh.matrixAutoUpdate = false; // el chunk no se mueve
    mesh.updateMatrix();
    mesh.name = `chunk ${cx},${cz}`;
    chunk.mesh = mesh;
    this.group.add(mesh);
  }

  /**
   * Genera y malla lo que falta alrededor de una posición, de lo más cercano
   * a lo más lejano, sin pasarse del tiempo disponible en este frame.
   * @param {number} x posición del jugador (bloques)
   * @param {number} z
   * @param {number} [budgetMs] tiempo máximo a usar (siempre hace al menos 1 tarea)
   * @returns {number} cantidad de chunks generados o mallados
   */
  update(x, z, budgetMs = DEFAULT_BUDGET_MS) {
    const cx = toChunkCoord(Math.floor(x));
    const cz = toChunkCoord(Math.floor(z));
    if (!this._center || this._center.cx !== cx || this._center.cz !== cz) {
      this._center = { cx, cz };
      this._unloadFar();
    }

    const start = performance.now();
    let done = 0;
    for (const o of this._offsets) {
      if (done > 0 && performance.now() - start > budgetMs) break;
      const ccx = cx + o.dx;
      const ccz = cz + o.dz;
      const chunk = this.getChunk(ccx, ccz);
      if (!chunk) {
        this._generate(ccx, ccz);
        done++;
      } else if (chunk.dirty && o.d <= this.renderDistance && this._neighborsReady(ccx, ccz)) {
        this.rebuildChunk(chunk);
        done++;
      }
    }
    return done;
  }

  /**
   * Carga de una vez (sin tope de tiempo) los chunks alrededor de un punto.
   * Se usa al empezar, para no aparecer en el vacío.
   */
  preload(x, z, radius = 2) {
    const cx = toChunkCoord(Math.floor(x));
    const cz = toChunkCoord(Math.floor(z));
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        if (!this.getChunk(cx + dx, cz + dz)) this._generate(cx + dx, cz + dz);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunk = this.getChunk(cx + dx, cz + dz);
        if (chunk.dirty) this.rebuildChunk(chunk);
      }
    }
  }

  /**
   * Libera lo que quedó lejos: primero la malla (a más de render + 1.5
   * chunks) y después los datos (a más de render + 2.5). El margen evita
   * cargar y descargar el mismo chunk al ir y venir por un borde.
   */
  _unloadFar() {
    const { cx, cz } = this._center;
    const meshLimit = this.renderDistance + 1.5;
    const dataLimit = this.renderDistance + 2.5;
    for (const chunk of [...this.chunks.values()]) {
      const d = Math.hypot(chunk.cx - cx, chunk.cz - cz);
      if (d > dataLimit) {
        this.removeChunk(chunk.cx, chunk.cz);
      } else if (d > meshLimit && chunk.mesh) {
        this.disposeChunkMesh(chunk);
        chunk.dirty = true; // al volver a acercarse se malla de nuevo
      }
    }
  }

  /** Saca de la escena y libera la memoria de la malla de un chunk. */
  disposeChunkMesh(chunk) {
    if (!chunk.mesh) return;
    this.group.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    chunk.mesh = null;
  }

  /** Quita un chunk del mundo liberando su malla. */
  removeChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.disposeChunkMesh(chunk);
    this.chunks.delete(key);
  }

  /** Cantidad de chunks con datos y con malla (para depurar). */
  get stats() {
    let meshed = 0;
    for (const c of this.chunks.values()) if (c.mesh) meshed++;
    return { loaded: this.chunks.size, meshed };
  }

  /** Libera todo el mundo. */
  dispose() {
    for (const chunk of this.chunks.values()) this.disposeChunkMesh(chunk);
    this.chunks.clear();
  }
}
