// Texturas del personaje principal, dibujadas por código en canvas 2D.
//
// A diferencia del mundo (pixel art), el personaje tiene un estilo de
// juguete suave: la cara, la gorra, el panel del pecho y el logo de la
// mochila se dibujan con trazos vectoriales en alta resolución. No se usa
// ninguna imagen externa.

import * as THREE from 'three';

/**
 * Variantes de color (buzo, gorra y zapatillas).
 * - main / dark / light: tonos de la tela.
 * - ink: color del logo sobre blanco (gorra y pecho).
 * - logo: color del logo sobre la mochila negra.
 */
export const VARIANTS = Object.freeze({
  verde: { name: 'Verde', main: '#3fae2a', dark: '#2a7e1c', light: '#6cc94a', ink: '#3fae2a', logo: '#3fae2a', swatch: '#3fae2a' },
  azul: { name: 'Azul', main: '#2f7fe0', dark: '#1d58a6', light: '#62a4f2', ink: '#2f7fe0', logo: '#2f7fe0', swatch: '#2f7fe0' },
  rojo: { name: 'Rojo', main: '#da3a30', dark: '#9e231a', light: '#ef6a5e', ink: '#da3a30', logo: '#da3a30', swatch: '#da3a30' },
  amarillo: { name: 'Amarillo', main: '#f2b51c', dark: '#bf870b', light: '#f8d060', ink: '#dc9d0b', logo: '#f2b51c', swatch: '#f2b51c' },
  violeta: { name: 'Violeta', main: '#8a4fd6', dark: '#6033a3', light: '#ab7ee8', ink: '#8a4fd6', logo: '#8a4fd6', swatch: '#8a4fd6' },
  negro: { name: 'Negro', main: '#2e2f33', dark: '#1b1c1f', light: '#4c4e54', ink: '#2e2f33', logo: '#d9d9d9', swatch: '#2e2f33' },
});

export const DEFAULT_VARIANT = 'verde';

/** ¿Es una clave de variante válida? (sin aceptar claves heredadas). */
export function isVariant(key) {
  return typeof key === 'string' && Object.hasOwn(VARIANTS, key);
}

/** Expresiones de la cara (cada una tiene además su versión parpadeando). */
export const EXPRESSIONS = Object.freeze([
  'normal',
  'feliz',
  'sorprendido',
  'determinado',
  'divertido',
]);

/** Colores fijos (no cambian con la variante). */
export const COLORS = Object.freeze({
  skin: '#f3c48e',
  hair: '#6b3e1f',
  white: '#f3f0ea',
  pants: '#212226',
  pantsDark: '#303238',
  bag: '#1d1f21',
  bagPocket: '#2d3033',
});

const INK = '#1d1b1f';
const BROW = '#4a2a14';
const MOUTH = '#7a2026';
const TONGUE = '#ef7b86';
const BLUSH = 'rgba(244, 128, 118, 0.38)';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Aclara u oscurece un color hex (factor > 1 aclara). */
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/**
 * Logo "M" de bloques (el emblema del juego), con un borde inferior más
 * oscuro que le da relieve. (x, y) es la esquina superior izquierda.
 */
function drawLogo(ctx, x, y, size, color) {
  const grid = ['XX...XX', 'XXX.XXX', 'XXXXXXX', 'XX.X.XX', 'XX...XX', 'XX...XX'];
  const cell = size / grid[0].length;
  const r = cell * 0.18;
  // Cada celda se agranda un poco para que las esquinas redondeadas de las
  // vecinas no dejen puntitos sin pintar en las uniones.
  const e = r * 0.35;
  const paint = (dy, fill) => {
    ctx.fillStyle = fill;
    grid.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== 'X') continue;
        ctx.beginPath();
        ctx.roundRect(x + i * cell - e, y + j * cell + dy - e, cell + 2 * e, cell + 2 * e, r);
        ctx.fill();
      }
    });
  };
  paint(cell * 0.35, shade(color, 0.62)); // relieve
  paint(0, color);
}

// ---------------------------------------------------------------------------
// Cara (una textura por expresión, transparente salvo los rasgos)
// ---------------------------------------------------------------------------

/** Tamaño del canvas de la cara (la calcomanía mide 9.6 x 7.2 unidades). */
export const FACE_CANVAS = Object.freeze({ w: 512, h: 384 });

const EYE_L = 150;
const EYE_R = 362;
const EYE_Y = 150;

function eye(ctx, x, y, rx = 30, ry = 44) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Brillos.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.32, y - ry * 0.38, rx * 0.34, ry * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + rx * 0.3, y + ry * 0.3, rx * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

/** Ojo cerrado y feliz, en forma de "^". */
function happyEye(ctx, x, y) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + 22, 30, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

/** Ojo cerrado relajado (parpadeo). */
function closedEye(ctx, x, y) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - 10, 30, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

/** Ceja: `tilt` la inclina (positivo = baja hacia afuera), `lift` la sube. */
function brow(ctx, x, y, tilt = 0, lift = 0) {
  ctx.strokeStyle = BROW;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 34, y + tilt - lift);
  ctx.quadraticCurveTo(x, y - 12 - lift, x + 34, y - tilt - lift);
  ctx.stroke();
}

function blush(ctx) {
  ctx.fillStyle = BLUSH;
  for (const x of [80, 432]) {
    ctx.beginPath();
    ctx.ellipse(x, 228, 40, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function smile(ctx) {
  ctx.strokeStyle = MOUTH;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(256, 228, 52, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

/** Boca abierta y contenta (forma de "D" acostada), con dientes y lengua. */
function openSmile(ctx, tongueOut = false) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(196, 262);
  ctx.quadraticCurveTo(256, 268, 316, 262);
  ctx.quadraticCurveTo(312, 340, 256, 342);
  ctx.quadraticCurveTo(200, 340, 196, 262);
  ctx.closePath();
  ctx.fillStyle = MOUTH;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(190, 254, 132, 20); // dientes
  ctx.fillStyle = TONGUE;
  ctx.beginPath();
  ctx.ellipse(256, 340, 40, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (tongueOut) {
    ctx.fillStyle = TONGUE;
    ctx.beginPath();
    ctx.ellipse(276, 344, 22, 26, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 40, 60, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(276, 326);
    ctx.lineTo(278, 352);
    ctx.stroke();
  }
}

/**
 * Pintores de cada expresión. Reciben `eye`, la función que dibuja un ojo
 * abierto; para el parpadeo se pasa una que lo dibuja cerrado, así cada
 * expresión parpadea sin cambiar su boca ni sus cejas. Las cejas quedan por
 * debajo de la visera de la gorra (y > ~90 en el canvas).
 */
const FACE_PAINTERS = {
  normal(ctx, eye) {
    brow(ctx, EYE_L, 98);
    brow(ctx, EYE_R, 98);
    eye(ctx, EYE_L, EYE_Y);
    eye(ctx, EYE_R, EYE_Y);
    smile(ctx);
  },
  feliz(ctx) {
    brow(ctx, EYE_L, 96, 0, 6);
    brow(ctx, EYE_R, 96, 0, 6);
    happyEye(ctx, EYE_L, EYE_Y);
    happyEye(ctx, EYE_R, EYE_Y);
    openSmile(ctx);
  },
  sorprendido(ctx, eye) {
    brow(ctx, EYE_L, 90, 0, 10);
    brow(ctx, EYE_R, 90, 0, 10);
    eye(ctx, EYE_L, EYE_Y, 36, 50);
    eye(ctx, EYE_R, EYE_Y, 36, 50);
    // Boca en "O".
    ctx.fillStyle = MOUTH;
    ctx.beginPath();
    ctx.ellipse(256, 290, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TONGUE;
    ctx.beginPath();
    ctx.ellipse(256, 308, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  determinado(ctx, eye) {
    eye(ctx, EYE_L, EYE_Y + 6, 30, 38);
    eye(ctx, EYE_R, EYE_Y + 6, 30, 38);
    // Párpado de arriba recortando el ojo: mirada decidida.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(EYE_L - 44, EYE_Y - 60);
    ctx.lineTo(EYE_L + 44, EYE_Y - 60);
    ctx.lineTo(EYE_L + 44, EYE_Y - 4);
    ctx.lineTo(EYE_L - 44, EYE_Y - 26);
    ctx.closePath();
    ctx.moveTo(EYE_R - 44, EYE_Y - 60);
    ctx.lineTo(EYE_R + 44, EYE_Y - 60);
    ctx.lineTo(EYE_R + 44, EYE_Y - 26);
    ctx.lineTo(EYE_R - 44, EYE_Y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Cejas inclinadas hacia el centro.
    brow(ctx, EYE_L, 92, -18);
    brow(ctx, EYE_R, 92, 18);
    // Sonrisa de costado.
    ctx.strokeStyle = MOUTH;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(214, 276);
    ctx.quadraticCurveTo(262, 290, 304, 258);
    ctx.stroke();
  },
  divertido(ctx, eye) {
    brow(ctx, EYE_L, 100, 4);
    brow(ctx, EYE_R, 94, 0, 6);
    happyEye(ctx, EYE_L, EYE_Y); // guiño
    eye(ctx, EYE_R, EYE_Y);
    openSmile(ctx, true);
  },
};

const faceCache = new Map();

/**
 * Textura de la cara para una expresión.
 * @param {string} expression una de EXPRESSIONS
 * @param {boolean} [blinking] la misma expresión con los ojos cerrados
 */
export function getFaceTexture(expression, blinking = false) {
  const name = FACE_PAINTERS[expression] ? expression : 'normal';
  const key = `${name}|${blinking}`;
  let t = faceCache.get(key);
  if (t) return t;
  const c = makeCanvas(FACE_CANVAS.w, FACE_CANVAS.h);
  const ctx = c.getContext('2d');
  blush(ctx);
  FACE_PAINTERS[name](ctx, blinking ? closedEye : eye);
  t = toTexture(c);
  faceCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Texturas que dependen del color
// ---------------------------------------------------------------------------

/**
 * Gorra: se aplica sobre una media esfera. En el canvas, x recorre la vuelta
 * completa (el frente queda en x = 75% del ancho) e y va desde la punta de
 * arriba (y = 0) hasta el borde de abajo.
 */
function paintCap(v) {
  const W = 1024;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = v.main;
  ctx.fillRect(0, 0, W, H);
  const front = W * 0.75;
  // Panel blanco del frente (dos gajos).
  const half = W * 0.13;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e9e5de');
  g.addColorStop(1, COLORS.white);
  ctx.fillStyle = g;
  ctx.fillRect(front - half, 26, half * 2, H - 26);
  // Costuras de los gajos.
  ctx.strokeStyle = shade(v.main, 0.7);
  ctx.lineWidth = 4;
  for (const x of [front - half, front + half, W * 0.25]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(front, 26);
  ctx.lineTo(front, H);
  ctx.stroke();
  // Logo en el frente (la esfera lo afina hacia los costados: se ensancha).
  ctx.save();
  ctx.translate(front, 0);
  ctx.scale(1.25, 1);
  drawLogo(ctx, -56, 100, 112, v.ink);
  ctx.restore();
  // Ribete inferior.
  ctx.fillStyle = shade(v.main, 0.8);
  ctx.fillRect(0, H - 8, W, 8);
  return c;
}

/** Panel blanco del pecho con el logo. */
function paintChest(v) {
  const c = makeCanvas(256, 300);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, '#f7f4ef');
  g.addColorStop(1, '#e4dfd6');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(8, 0, 240, 300, [6, 6, 26, 26]);
  ctx.fill();
  drawLogo(ctx, 50, 128, 156, v.ink);
  return c;
}

/** Logo de la mochila (fondo transparente). */
function paintBagLogo(v) {
  const c = makeCanvas(256, 200);
  const ctx = c.getContext('2d');
  drawLogo(ctx, 28, 4, 200, v.logo);
  return c;
}

const variantCache = new Map();

/** Texturas de una variante: { cap, chest, bag } (se crean una sola vez). */
export function getVariantTextures(variantKey) {
  const key = isVariant(variantKey) ? variantKey : DEFAULT_VARIANT;
  let t = variantCache.get(key);
  if (t) return t;
  const v = VARIANTS[key];
  t = {
    cap: toTexture(paintCap(v)),
    chest: toTexture(paintChest(v)),
    bag: toTexture(paintBagLogo(v)),
  };
  variantCache.set(key, t);
  return t;
}
