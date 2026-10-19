// Íconos de bloques para la hotbar: un cubo en perspectiva isométrica
// dibujado en un canvas con las texturas del atlas (arriba, izquierda y
// derecha, con las caras de los costados un poco más oscuras).

import { TILE_SIZE, tilePixelOrigin } from './atlasLayout.js';
import { getBlock } from '../world/blocks.js';

const SIZE = 48; // ancho del ícono en píxeles
const K = SIZE / 2 / TILE_SIZE; // escala de la textura

const cache = new Map();

/**
 * Dibuja una cara: la textura `tile` del atlas transformada con la matriz
 * (a, b, c, d, e, f) y oscurecida según `shade` (0 = sin sombra).
 */
function drawFace(ctx, atlas, tile, matrix, shade) {
  const { x, y } = tilePixelOrigin(tile);
  ctx.save();
  ctx.setTransform(...matrix);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, x, y, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
  if (shade > 0) {
    // Solo sobre los píxeles ya pintados (respeta los huecos de hojas y vidrio).
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  }
  ctx.restore();
}

/**
 * Devuelve la URL (data:) del ícono de un bloque.
 * @param {HTMLCanvasElement} atlas canvas del atlas de texturas
 * @param {number} id ID del bloque
 */
export function getBlockIcon(atlas, id) {
  let url = cache.get(id);
  if (url) return url;
  const block = getBlock(id);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE + 4;
  const ctx = canvas.getContext('2d');
  if (block.tiles) {
    const h = SIZE / 4; // alto del rombo de arriba hasta su centro
    // Arriba: rombo. Izquierda y derecha: paralelogramos hacia abajo.
    drawFace(ctx, atlas, block.tiles.top, [K, K / 2, -K, K / 2, SIZE / 2, 2], 0);
    drawFace(ctx, atlas, block.tiles.side, [K, K / 2, 0, K, 0, 2 + h], 0.22);
    drawFace(ctx, atlas, block.tiles.side, [K, -K / 2, 0, K, SIZE / 2, 2 + 2 * h], 0.4);
  }
  url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
