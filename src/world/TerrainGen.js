// Generación del terreno.
//
// Etapa 1: un piso plano de prueba con un muestrario de bloques. En la
// etapa 2 este módulo pasa a generar el terreno procedural con ruido
// (alturas, capas, agua, árboles y minerales).

import { BLOCK } from './blocks.js';

/** Altura (en bloques) de la superficie del piso plano. */
export const FLAT_SURFACE_Y = 4;

/**
 * Llena el mundo con un piso plano de `size` x `size` bloques que empieza en
 * (0, 0). Capas de abajo hacia arriba: lecho primordial, piedra, tierra y
 * césped arriba de todo.
 */
export function generateFlatFloor(world, size = 32) {
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      world.setBlock(x, 0, z, BLOCK.BEDROCK);
      world.setBlock(x, 1, z, BLOCK.STONE);
      world.setBlock(x, 2, z, BLOCK.DIRT);
      world.setBlock(x, FLAT_SURFACE_Y - 1, z, BLOCK.GRASS);
    }
  }
}

/**
 * Árbol simple: tronco de `trunk` bloques y copa redondeada de follaje de
 * radio `radius`. Solo pone follaje donde hay aire.
 */
export function placeTree(world, x, y, z, trunk = 4, radius = 2) {
  for (let i = 0; i < trunk; i++) world.setBlock(x, y + i, z, BLOCK.LOG);
  const top = y + trunk;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -1; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dy * dy * 1.6 + dz * dz > radius * radius + 0.6) continue;
        if (world.getBlock(x + dx, top + dy, z + dz) === BLOCK.AIR) {
          world.setBlock(x + dx, top + dy, z + dz, BLOCK.LEAVES);
        }
      }
    }
  }
}

/**
 * Muestrario de la etapa 1: una fila con un bloque de cada tipo, un pequeño
 * estanque y un árbol, para ver todas las texturas del atlas.
 */
export function placeShowcase(world) {
  const y = FLAT_SURFACE_Y;
  const row = [
    BLOCK.GRASS,
    BLOCK.DIRT,
    BLOCK.STONE,
    BLOCK.BEDROCK,
    BLOCK.SAND,
    BLOCK.LOG,
    BLOCK.LEAVES,
    BLOCK.ORE_COPPER,
    BLOCK.ORE_AZURITE,
    BLOCK.ORE_SOLARITE,
    BLOCK.PLANKS,
    BLOCK.STONE_BRICK,
    BLOCK.GLASS,
  ];
  row.forEach((id, i) => world.setBlock(4 + i * 2, y, 10, id));

  // Estanque: el césped se reemplaza por agua y el borde por arena.
  for (let x = 19; x <= 25; x++) {
    for (let z = 15; z <= 20; z++) {
      const edge = x === 19 || x === 25 || z === 15 || z === 20;
      world.setBlock(x, y - 1, z, edge ? BLOCK.SAND : BLOCK.WATER);
    }
  }

  placeTree(world, 8, y, 18, 4, 2);
}
