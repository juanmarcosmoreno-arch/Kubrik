// Generación procedural del atlas de texturas (pixel art 16x16).
//
// Todas las texturas se dibujan por código en un canvas 2D, píxel por píxel,
// con un generador pseudoaleatorio con semilla: el resultado es siempre el
// mismo y no hace falta ningún archivo de imagen externo.

import * as THREE from 'three';
import {
  ATLAS_SIZE,
  TILE_NAMES,
  TILE_PADDING,
  TILE_SIZE,
  tilePixelOrigin,
} from './atlasLayout.js';

const S = TILE_SIZE;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Generador pseudoaleatorio mulberry32: rápido y determinista. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash simple de un texto a entero de 32 bits (semilla por textura). */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * Lienzo de una textura de 16x16 sobre un ImageData. Ofrece helpers para
 * pintar píxeles con colores [r, g, b] o [r, g, b, a].
 */
class TilePainter {
  constructor(imageData, ox, oy, rnd) {
    this.img = imageData;
    this.ox = ox;
    this.oy = oy;
    this.rnd = rnd;
  }

  /** Pinta el píxel (x, y) de la textura. Ignora coordenadas fuera de rango. */
  set(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = ((this.oy + y) * this.img.width + (this.ox + x)) * 4;
    const d = this.img.data;
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
    d[i + 3] = clamp255(a);
  }

  /** Lee el color actual del píxel (x, y). */
  get(x, y) {
    const i = ((this.oy + y) * this.img.width + (this.ox + x)) * 4;
    const d = this.img.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  /** Color base con variación aleatoria de brillo (±amount). */
  vary([r, g, b, a = 255], amount) {
    const k = (this.rnd() * 2 - 1) * amount;
    return [r + k, g + k, b + k, a];
  }

  /** Rellena toda la textura con un color base y ruido de brillo. */
  noiseFill(color, amount) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, this.vary(color, amount));
  }

  /** Salpica píxeles sueltos de un color con cierta probabilidad. */
  speckle(color, chance, amount = 8) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) if (this.rnd() < chance) this.set(x, y, this.vary(color, amount));
  }

  /** Multiplica el brillo del píxel (para sombrear). */
  shade(x, y, factor) {
    const [r, g, b, a] = this.get(x, y);
    this.set(x, y, [r * factor, g * factor, b * factor, a]);
  }
}

// ---------------------------------------------------------------------------
// Paletas (colores originales de Megabrick)
// ---------------------------------------------------------------------------

const C = {
  grass: [96, 172, 64],
  grassDark: [70, 138, 46],
  grassLight: [128, 198, 84],
  dirt: [124, 90, 60],
  dirtDark: [94, 66, 42],
  dirtLight: [148, 110, 74],
  stone: [128, 129, 134],
  stoneDark: [98, 99, 106],
  stoneLight: [152, 153, 158],
  bedrock: [52, 50, 58],
  sand: [220, 204, 150],
  water: [52, 112, 204],
  bark: [104, 76, 46],
  barkDark: [76, 54, 32],
  wood: [184, 146, 94],
  leaves: [60, 134, 50],
  plank: [178, 134, 84],
  copper: [218, 122, 60],
  azurite: [64, 128, 234],
  solarite: [244, 204, 64],
};

// ---------------------------------------------------------------------------
// Pintores de cada textura
// ---------------------------------------------------------------------------

/** Racimos de mineral sobre piedra. */
function paintOre(p, color, highlight, clusters) {
  PAINTERS.stone(p);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(p.rnd() * (S - 4));
    const cy = 2 + Math.floor(p.rnd() * (S - 4));
    const n = 3 + Math.floor(p.rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = cx + Math.floor(p.rnd() * 3) - 1;
      const y = cy + Math.floor(p.rnd() * 3) - 1;
      p.set(x, y, p.vary(color, 14));
      // Sombra abajo a la derecha para dar volumen.
      if (p.rnd() < 0.5) p.set(x + 1, y + 1, p.vary(C.stoneDark, 6));
    }
    p.set(cx, cy, highlight);
  }
}

const PAINTERS = {
  grass_top(p) {
    p.noiseFill(C.grass, 10);
    p.speckle(C.grassDark, 0.18, 6);
    p.speckle(C.grassLight, 0.1, 6);
  },

  dirt(p) {
    p.noiseFill(C.dirt, 10);
    p.speckle(C.dirtDark, 0.16, 6);
    p.speckle(C.dirtLight, 0.08, 6);
    // Algunas piedritas.
    for (let i = 0; i < 3; i++) {
      p.set(Math.floor(p.rnd() * S), Math.floor(p.rnd() * S), p.vary(C.stoneLight, 10));
    }
  },

  grass_side(p) {
    PAINTERS.dirt(p);
    // Borde de pasto que "chorrea" de forma irregular por cada columna.
    for (let x = 0; x < S; x++) {
      const depth = 3 + Math.floor(p.rnd() * 3) + (p.rnd() < 0.15 ? 2 : 0);
      for (let y = 0; y < depth; y++) {
        const base = y === depth - 1 ? C.grassDark : C.grass;
        p.set(x, y, p.vary(base, 10));
      }
    }
  },

  stone(p) {
    p.noiseFill(C.stone, 9);
    p.speckle(C.stoneDark, 0.12, 5);
    p.speckle(C.stoneLight, 0.08, 5);
    // Grietas: trazos cortos y oscuros.
    for (let i = 0; i < 4; i++) {
      let x = Math.floor(p.rnd() * S);
      let y = Math.floor(p.rnd() * S);
      const len = 2 + Math.floor(p.rnd() * 3);
      for (let k = 0; k < len; k++) {
        p.set(x, y, p.vary(C.stoneDark, 4));
        x += p.rnd() < 0.5 ? 1 : 0;
        y += p.rnd() < 0.5 ? 1 : -1;
      }
    }
  },

  bedrock(p) {
    p.noiseFill(C.bedrock, 12);
    // Manchas de alto contraste: negras y grises.
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(p.rnd() * S);
      const cy = Math.floor(p.rnd() * S);
      const col = p.rnd() < 0.5 ? [22, 21, 26] : [96, 94, 104];
      for (let k = 0; k < 5; k++) {
        p.set(cx + Math.floor(p.rnd() * 3) - 1, cy + Math.floor(p.rnd() * 3) - 1, p.vary(col, 8));
      }
    }
  },

  sand(p) {
    p.noiseFill(C.sand, 7);
    p.speckle([196, 178, 124], 0.12, 5);
    p.speckle([236, 224, 178], 0.08, 4);
  },

  water(p) {
    p.noiseFill(C.water, 6);
    // Ondas: trazos horizontales más claros.
    for (let y = 1; y < S; y += 4) {
      const off = Math.floor(p.rnd() * S);
      const len = 4 + Math.floor(p.rnd() * 5);
      for (let k = 0; k < len; k++) p.set((off + k) % S, y + (k > len / 2 ? 1 : 0), p.vary([96, 158, 234], 6));
    }
  },

  log_side(p) {
    // Corteza con vetas verticales.
    for (let x = 0; x < S; x++) {
      const colBase = p.rnd() < 0.3 ? C.barkDark : C.bark;
      for (let y = 0; y < S; y++) p.set(x, y, p.vary(colBase, 8));
    }
    // Nudos y grietas horizontales cortas.
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(p.rnd() * S);
      const y = Math.floor(p.rnd() * S);
      p.set(x, y, p.vary([60, 42, 24], 5));
      p.set(x, y + 1, p.vary([60, 42, 24], 5));
    }
  },

  log_top(p) {
    // Anillos concéntricos con borde de corteza.
    const c = (S - 1) / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.max(Math.abs(x - c), Math.abs(y - c)) + Math.hypot(x - c, y - c) * 0.25;
        if (x === 0 || y === 0 || x === S - 1 || y === S - 1) {
          p.set(x, y, p.vary(C.bark, 8));
        } else {
          const ring = Math.floor(d) % 3 === 0;
          p.set(x, y, p.vary(ring ? [150, 112, 66] : C.wood, 6));
        }
      }
    }
  },

  leaves(p) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = p.rnd();
        if (r < 0.16) {
          p.set(x, y, [0, 0, 0, 0]); // hueco transparente
        } else if (r < 0.4) {
          p.set(x, y, p.vary([40, 100, 36], 8));
        } else if (r < 0.52) {
          p.set(x, y, p.vary([92, 168, 70], 8));
        } else {
          p.set(x, y, p.vary(C.leaves, 8));
        }
      }
    }
  },

  ore_copper(p) {
    paintOre(p, C.copper, [255, 182, 120], 4);
  },

  ore_azurite(p) {
    paintOre(p, C.azurite, [170, 210, 255], 4);
  },

  ore_solarite(p) {
    paintOre(p, C.solarite, [255, 250, 210], 3);
  },

  planks(p) {
    // Cuatro tablas horizontales con vetas, separadas por líneas oscuras.
    for (let y = 0; y < S; y++) {
      const board = Math.floor(y / 4);
      const tint = [0, 8, -6, 4][board];
      for (let x = 0; x < S; x++) {
        if (y % 4 === 3) {
          p.set(x, y, p.vary([112, 80, 46], 4));
        } else {
          const base = [C.plank[0] + tint, C.plank[1] + tint, C.plank[2] + tint];
          p.set(x, y, p.vary(base, 6));
        }
      }
      // Veta: un trazo un poco más oscuro.
      if (y % 4 === 1) {
        const off = Math.floor(p.rnd() * 8);
        for (let k = 0; k < 5; k++) p.shade((off + k) % S, y, 0.88);
      }
    }
    // Uniones de tablas (desfasadas por fila).
    for (let b = 0; b < 4; b++) {
      const x = b % 2 === 0 ? 3 : 11;
      for (let y = b * 4; y < b * 4 + 3; y++) p.set(x, y, p.vary([120, 86, 50], 4));
    }
  },

  stone_brick(p) {
    p.noiseFill([142, 143, 148], 7);
    // Juntas (mortero) cada 8 píxeles en filas alternadas.
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / 8);
      for (let x = 0; x < S; x++) {
        const isHJoint = y % 8 === 7;
        const isVJoint = (x + (row % 2 === 0 ? 0 : 8)) % 16 === 15;
        if (isHJoint || isVJoint) {
          p.set(x, y, p.vary([84, 85, 92], 4));
        } else if (y % 8 === 0 || (x + (row % 2 === 0 ? 0 : 8)) % 16 === 0) {
          // Bisel claro arriba/izquierda de cada ladrillo.
          p.set(x, y, p.vary([168, 169, 174], 4));
        }
      }
    }
  },

  glass(p) {
    // Interior totalmente transparente, marco claro y un par de brillos.
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        p.set(x, y, edge ? p.vary([214, 232, 240], 6) : [0, 0, 0, 0]);
      }
    }
    for (let k = 0; k < 4; k++) p.set(3 + k, 6 - k, [240, 250, 255, 255]);
    p.set(10, 11, [240, 250, 255, 255]);
    p.set(11, 10, [240, 250, 255, 255]);
  },
};

// ---------------------------------------------------------------------------
// Atlas
// ---------------------------------------------------------------------------

/**
 * Copia los píxeles del borde de una textura hacia su margen (TILE_PADDING),
 * incluidas las esquinas, para evitar que se mezclen colores de texturas
 * vecinas en los bordes de las caras.
 */
function extrudeEdges(img, ox, oy) {
  const d = img.data;
  const w = img.width;
  const P = TILE_PADDING;
  for (let y = -P; y < S + P; y++) {
    for (let x = -P; x < S + P; x++) {
      if (x >= 0 && x < S && y >= 0 && y < S) continue; // interior
      const sx = Math.min(S - 1, Math.max(0, x));
      const sy = Math.min(S - 1, Math.max(0, y));
      const src = ((oy + sy) * w + (ox + sx)) * 4;
      const dst = ((oy + y) * w + (ox + x)) * 4;
      d[dst] = d[src];
      d[dst + 1] = d[src + 1];
      d[dst + 2] = d[src + 2];
      d[dst + 3] = d[src + 3];
    }
  }
}

/** Dibuja todas las texturas en un canvas y lo devuelve. */
export function paintAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);

  for (const name of TILE_NAMES) {
    const painter = PAINTERS[name];
    if (!painter) throw new Error(`Falta el pintor de la textura: ${name}`);
    const { x, y } = tilePixelOrigin(name);
    painter(new TilePainter(img, x, y, mulberry32(hashString(name))));
    extrudeEdges(img, x, y);
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Crea el atlas como textura de Three.js con filtrado "nearest" para que se
 * vea pixelado y nítido. No se generan mipmaps para evitar que los colores de
 * texturas vecinas se mezclen a la distancia.
 */
export function createAtlasTexture() {
  const canvas = paintAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { canvas, texture };
}
