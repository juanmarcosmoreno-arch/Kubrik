// Definición de los tipos de bloque de Megabrick.
//
// Cada bloque es una entrada de una tabla indexada por su ID numérico (lo que
// se guarda en el Uint8Array de cada chunk). Las propiedades describen cómo se
// dibuja y cómo se comporta, así que sumar bloques nuevos (biomas, crafteo,
// etc.) es agregar una fila acá y, si hace falta, una textura en textures.js.

/** IDs numéricos de los bloques. 0 siempre es aire. */
export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1, // Césped
  DIRT: 2, // Tierra
  STONE: 3, // Piedra
  BEDROCK: 4, // Lecho primordial (indestructible)
  SAND: 5, // Arena
  WATER: 6, // Agua
  LOG: 7, // Tronco
  LEAVES: 8, // Follaje
  ORE_COPPER: 9, // Mineral de cobrizo
  ORE_AZURITE: 10, // Mineral de azurita
  ORE_SOLARITE: 11, // Mineral de solarita
  PLANKS: 12, // Tablones
  STONE_BRICK: 13, // Ladrillo de piedra
  GLASS: 14, // Vidrio
});

/**
 * Capas de render. Cada chunk arma una malla por capa:
 *  - OPAQUE: bloques sólidos comunes.
 *  - CUTOUT: con huecos totalmente transparentes (hojas, vidrio), usan alphaTest.
 *  - TRANSLUCENT: semitransparentes (agua), se dibujan con mezcla alfa.
 */
export const LAYER = Object.freeze({
  OPAQUE: 0,
  CUTOUT: 1,
  TRANSLUCENT: 2,
});

/**
 * Valores por defecto de cada bloque.
 * - tiles: nombre de la textura del atlas para {top, side, bottom}.
 * - solid: el jugador choca contra él.
 * - opaque: tapa por completo las caras vecinas (permite ocultarlas).
 * - layer: capa de render (ver LAYER).
 * - cullSame: si dos bloques iguales vecinos ocultan la cara compartida
 *   (el vidrio y el agua sí; el follaje no, para que se vea frondoso).
 * - breakable: se puede romper.
 * - liquid: es un líquido (para nadar en la etapa 3).
 */
const DEFAULTS = {
  solid: true,
  opaque: true,
  layer: LAYER.OPAQUE,
  cullSame: true,
  breakable: true,
  liquid: false,
};

function def(id, name, tiles, props = {}) {
  const t = typeof tiles === 'string' ? { top: tiles, side: tiles, bottom: tiles } : tiles;
  return Object.freeze({ id, name, tiles: Object.freeze(t), ...DEFAULTS, ...props });
}

/** Tabla de bloques indexada por ID. */
export const BLOCKS = [];

function register(block) {
  BLOCKS[block.id] = block;
}

register(
  Object.freeze({
    id: BLOCK.AIR,
    name: 'Aire',
    tiles: null,
    solid: false,
    opaque: false,
    layer: null,
    cullSame: true,
    breakable: false,
    liquid: false,
  }),
);
register(def(BLOCK.GRASS, 'Césped', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }));
register(def(BLOCK.DIRT, 'Tierra', 'dirt'));
register(def(BLOCK.STONE, 'Piedra', 'stone'));
register(def(BLOCK.BEDROCK, 'Lecho primordial', 'bedrock', { breakable: false }));
register(def(BLOCK.SAND, 'Arena', 'sand'));
register(
  def(BLOCK.WATER, 'Agua', 'water', {
    solid: false,
    opaque: false,
    layer: LAYER.TRANSLUCENT,
    breakable: false,
    liquid: true,
  }),
);
register(def(BLOCK.LOG, 'Tronco', { top: 'log_top', side: 'log_side', bottom: 'log_top' }));
register(
  def(BLOCK.LEAVES, 'Follaje', 'leaves', {
    opaque: false,
    layer: LAYER.CUTOUT,
    cullSame: false,
  }),
);
register(def(BLOCK.ORE_COPPER, 'Mineral de cobrizo', 'ore_copper'));
register(def(BLOCK.ORE_AZURITE, 'Mineral de azurita', 'ore_azurite'));
register(def(BLOCK.ORE_SOLARITE, 'Mineral de solarita', 'ore_solarite'));
register(def(BLOCK.PLANKS, 'Tablones', 'planks'));
register(def(BLOCK.STONE_BRICK, 'Ladrillo de piedra', 'stone_brick'));
register(
  def(BLOCK.GLASS, 'Vidrio', 'glass', {
    opaque: false,
    layer: LAYER.CUTOUT,
  }),
);

/** Devuelve la definición de un bloque (aire si el ID no existe). */
export function getBlock(id) {
  return BLOCKS[id] ?? BLOCKS[BLOCK.AIR];
}

/** Lista de nombres de textura que usan los bloques (para validar el atlas). */
export function usedTileNames() {
  const names = new Set();
  for (const b of BLOCKS) {
    if (!b?.tiles) continue;
    names.add(b.tiles.top);
    names.add(b.tiles.side);
    names.add(b.tiles.bottom);
  }
  return [...names];
}
