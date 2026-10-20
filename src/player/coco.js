// =============================================================================
// Coco — el monstruito de gomita protagonista de Megabrick.
//
// Una bola brillante (cabeza y cuerpo a la vez), violeta-magenta adelante, que
// en la espalda, la coronilla y los costados se degrada a naranja y amarillo;
// llena de bultitos, gotitas amarillas en relieve y puntitos oscuros, con un
// ombligo. Ojos saltones en cuencas abultadas con párpados gruesos (cara de
// aburrido), boca ancha de labio grueso (con un agujero de verdad para ver
// dientes y lengua), antena en rulo con brotecito, brazos finitos que se
// ensanchan en una paleta con pinza (un dedo largo en punta, uno chiquito
// atrás y un pulgar que se cierra al golpear) y patas flacas con pies grandes
// de tres garras.
//
// Todo es procedural: geometrías y texturas (canvas 2D) se generan por código.
// No importa nada: THREE llega por parámetro (así el módulo se puede probar
// suelto, fuera del juego). El juego lo usa a través de Avatar.js.
//
// Ejes: mira hacia +Z, los pies apoyan en y = 0. 1 unidad = 1 bloque.
// La mano donde el juego cuelga el bloque es la pinza DERECHA de Coco, que
// es la del lado -X (mirando hacia +Z, su derecha queda en -X).
//
// Organización:
//   1. Utilidades               6. Pintura de la piel según el color
//   2. Paletas                  7. Geometrías de las partes
//   3. Forma de la bola         8. Expresiones
//   4. Tubos                    9. createCharacter (armado, animación y API)
//   5. Datos compartidos (manchas, relieve, ojo: se calculan una sola vez)
// =============================================================================

export const info = {
  id: 'coco',
  nombre: 'Coco',
  descripcion: 'Un bichito de gomita violeta, medio dormilón y medio gruñón, con antena de rulo y pinzas de cangrejo: cuando se pone las pilas, rompe todo.',
};

// =============================================================================
// 1. Utilidades
// =============================================================================
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep que también acepta bordes invertidos (a > b).
const suave = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Acercamiento exponencial independiente del framerate.
const amort = (actual, objetivo, rapidez, dt) => lerp(actual, objetivo, 1 - Math.exp(-rapidez * dt));
// Número finito o un valor por defecto (para que un NaN no rompa la animación).
const numero = (x, def = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : def);

// Generador pseudoaleatorio con semilla (mulberry32): Coco sale siempre igual.
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Dirección uniforme sobre la esfera unitaria.
function dirAzar(r) {
  const y = r() * 2 - 1;
  const ang = r() * TAU;
  const k = Math.sqrt(1 - y * y);
  return [k * Math.cos(ang), y, k * Math.sin(ang)];
}

// Ruido de valor 3D (degradés y manchones de la piel).
function hash3(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function ruido3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
const fbm3 = (x, y, z) =>
  ruido3(x, y, z) * 0.55 + ruido3(x * 2.1 + 7, y * 2.1, z * 2.1) * 0.3 + ruido3(x * 4.3, y * 4.3 + 3, z * 4.3) * 0.15;

// Colores como [r, g, b] 0..255 (espacio sRGB, para el canvas).
const hexRGB = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbCss = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
const mezclar = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const BLANCO = [255, 255, 255], NEGRO = [0, 0, 0];

// Canvas: en el navegador con document; si no hay, OffscreenCanvas.
function crearCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}
// Vector mínimo para las funciones puras de este archivo (no necesitan THREE).
const vec = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
    return this;
  },
});

// =============================================================================
// 2. Paletas: el color del jugador cambia el «violeta»; el degradé cálido y
// las manchas se ajustan para que siempre se vean.
//   base: piel principal · piel: párpados, labios y cuencas (si no, base)
//   oscuro: motitas · lila: gotas oscuras brillosas · gota: gotas amarillas
//   halo: aureola de las gotas · medio: color de paso del degradé (opcional)
//   tibio/calido: naranja y amarillo del degradé · verruga: bultos de la zona
//   cálida · punto: puntitos naranjas · puntoTibio: puntitos del color del
//   jugador sobre lo cálido (para reconocerlo de atrás)
// =============================================================================
const PALETAS = {
  // violeta original del juego, llevado al magenta-violeta intenso de la referencia
  '#8a4fd6': { base: '#a11cb8', oscuro: '#3e0758', lila: '#5c0f80', gota: '#ffd02e', halo: '#ff8a1c', medio: '#cc3a8c', tibio: '#ff7a1c', calido: '#ffc63a', verruga: '#ffd85a', punto: '#ff8a1c', puntoTibio: '#8a16ae' },
  '#3fae2a': { base: '#2fa52c', oscuro: '#0d3d12', lila: '#17601c', gota: '#ffe24a', halo: '#ffa020', tibio: '#f59a1c', calido: '#ffd23e', verruga: '#ffe070', punto: '#ff9a20', puntoTibio: '#23862a' },
  '#2f7fe0': { base: '#2c68e6', oscuro: '#0b2160', lila: '#173a96', gota: '#ffd23a', halo: '#ff9a2a', tibio: '#ff8a2a', calido: '#ffcd45', verruga: '#ffdc66', punto: '#ff9a2a', puntoTibio: '#2457cc' },
  '#da3a30': { base: '#cf2440', oscuro: '#4e0518', lila: '#7a0c26', gota: '#ffd23a', halo: '#ff8a1e', tibio: '#ff7a1e', calido: '#ffc43a', verruga: '#ffd866', punto: '#ff9a2a', puntoTibio: '#a8143a' },
  // amarillo: al revés que el original (gotas violetas) y un degradé de fuego
  '#f2b51c': { base: '#f4b81c', piel: '#f2b01a', oscuro: '#5a1a78', lila: '#c4361a', gota: '#9a3ad8', halo: '#f07a2a', tibio: '#f27418', calido: '#e0441c', verruga: '#ff8a2a', punto: '#d8401c', puntoTibio: '#ffd23a' },
  // negro: carbón con un toque violeta, motitas lilas claras y degradé de brasa
  '#2e2f33': { base: '#2b2836', piel: '#2f2b3b', oscuro: '#a070d8', lila: '#6a3a9a', gota: '#ffc534', halo: '#ff7a1a', medio: '#8a2a1a', tibio: '#e85a18', calido: '#ffb02a', verruga: '#ffcf4a', punto: '#ff8a2a', puntoTibio: '#3a3448' },
};

// Paleta para cualquier color (las 6 del juego están afinadas a mano).
function paletaDe(THREE, color) {
  const c = new THREE.Color(0x8a4fd6);
  if (color !== undefined && color !== null) c.set(color);
  const clave = '#' + c.getHexString();
  if (PALETAS[clave]) return { clave, ...PALETAS[clave] };
  const hsl = {};
  c.getHSL(hsl);
  const base = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.1), clamp(hsl.l, 0.16, 0.58));
  const amarillento = hsl.h > 0.09 && hsl.h < 0.2 && hsl.l > 0.35;
  const muyOscuro = hsl.l < 0.2;
  const hx = (col) => '#' + col.getHexString();
  const por = (k) => hx(base.clone().multiplyScalar(k));
  return {
    clave,
    base: hx(base),
    oscuro: muyOscuro ? '#a070d8' : por(0.38),
    lila: muyOscuro ? '#6a3a9a' : por(0.6),
    gota: amarillento ? '#9a3ad8' : '#ffd02e',
    halo: amarillento ? '#f07a2a' : '#ff8a1c',
    tibio: amarillento ? '#f27418' : '#ff7a1c',
    calido: amarillento ? '#e0441c' : '#ffc63a',
    verruga: amarillento ? '#ff8a2a' : '#ffd85a',
    punto: amarillento ? '#d8401c' : '#ff8a1c',
    puntoTibio: amarillento ? hx(base) : por(muyOscuro ? 1.8 : 0.82),
  };
}

// =============================================================================
// 3. Forma de la bola (funciones puras, en el espacio de la bola: centro 0,0,0)
// =============================================================================
const RX = 0.45, RY = 0.465, RZ = 0.44; // semiejes (apenas más alta que ancha)
const ENSANCHE = 0.1; // un poco más ancha abajo (tipo huevo)
const CENTRO_Y = 0.84; // altura del centro de la bola sobre los pies
const BOCA_Y = 0.15; // altura de la boca (desde el centro de la bola)
const OJO_Y = 0.292, OJO_X = 0.104, R_OJO = 0.09;
const OMB_Y = -0.05; // ombligo (un poco abajo del centro)

// Punto de la bola lisa para una dirección unitaria.
function forma(dx, dy, dz, out) {
  const w = 1 - ENSANCHE * dy;
  return out.set(dx * RX * w, dy * RY, dz * RZ * w);
}
// Cuánto «es cara» una dirección: ahí la piel es lisa (0 = no, 1 = sí).
function pesoCara(dx, dy, dz) {
  if (dz <= 0) return 0;
  const fx = (dx * RX) / 0.34, fy = (dy * RY - 0.14) / 0.36;
  return suave(1.25, 0.85, Math.hypot(fx, fy)) * suave(0, 0.3, dz);
}
// Ojos y franja de los labios: ahí no van manchas ni gotas.
function mascaraCara(x, y, z) {
  if (z <= 0.1) return 0;
  const px = x * RX, py = y * RY;
  const ojo = Math.min(Math.hypot(px - OJO_X, py - OJO_Y), Math.hypot(px + OJO_X, py - OJO_Y));
  const mOjo = suave(R_OJO * 1.7, R_OJO * 1.3, ojo);
  const mBoca = suave(0.34, 0.29, Math.abs(px)) * suave(BOCA_Y - 0.08, BOCA_Y - 0.045, py) * suave(BOCA_Y + 0.075, BOCA_Y + 0.045, py);
  return Math.max(mOjo, mBoca) * suave(0.1, 0.3, z);
}
// Zona que puede abrir la boca (y los ojos): ahí no puede haber gotas en relieve.
const zonaBoca = (x, y, z) => z > 0.1 && Math.abs(x * RX) < 0.37 && y * RY > -0.12 && y * RY < 0.48;
const enOmbligo = (x, y, z) => z > 0.3 && Math.hypot((x * RX) / 0.07, (y * RY - OMB_Y) / 0.09) < 1;

// Manchones del color del jugador en la parte alta de la espalda (para
// reconocerlo de atrás, que es como se lo ve en tercera persona).
function islas(x, y, z) {
  const n = ruido3(x * 4.2 + 2.1, y * 4.2 - 4.3, z * 4.2 + 9.7) * 0.8 + ruido3(x * 9, y * 9, z * 9) * 0.2;
  return suave(0.6, 0.66, n) * suave(0.1, -0.35, z) * suave(-0.5, -0.15, y) * suave(0.95, 0.7, y);
}
// Cuánto «calor» (naranja/amarillo) tiene la piel en una dirección: la espalda,
// la coronilla, los costados y abajo son cálidos; el frente y la cara, violetas.
// El pasaje es gradual y con vetas.
function calorDir(x, y, z) {
  let w = 0.72 - 1.12 * Math.max(z - 0.55 * y, -0.32); // el borde va en diagonal: arriba llega más adelante
  w += 0.6 * suave(-0.3, -0.9, y); // abajo
  w += 0.4 * suave(0.7, 1.0, y) * suave(0.7, -0.1, z); // coronilla, hacia atrás
  w += 0.35 * suave(0.5, 0.85, Math.abs(x)); // costados
  w -= 0.15 * suave(0.45, 0.95, y) * suave(0.3, 0.8, z); // cara violeta
  w += (fbm3(x * 3.4 + 3, y * 3.4, z * 3.4) - 0.5) * 1.5; // borde manchado
  w += (ruido3(x * 7 + 1, y * 7, z * 7) - 0.5) * 0.5; // manchitas
  w += (ruido3(x * 9 + 1, y * 2.2, z * 9) - 0.5) * 0.6 * suave(0.7, 0.0, Math.abs(z)); // vetas verticales en el costado
  w -= 1.0 * islas(x, y, z);
  return suave(0.1, 0.85, w) * (1 - 0.95 * mascaraCara(x, y, z));
}

// Bultos grandes de la superficie (desplazan la malla): la bola no es perfecta.
const BULTOS = (() => {
  const r = azar(11), lista = [];
  for (let k = 0; k < 120; k++) {
    const [x, y, z] = dirAzar(r);
    const sig = 0.05 + r() * 0.1;
    lista.push(x, y, z, 0.003 + r() * 0.009, 1 / (sig * sig));
  }
  return lista;
})();
function desplaz(x, y, z) {
  let d = 0;
  for (let k = 0; k < BULTOS.length; k += 5) {
    const c = 1 - (x * BULTOS[k] + y * BULTOS[k + 1] + z * BULTOS[k + 2]);
    if (c < 0.06) d += BULTOS[k + 3] * Math.exp(-c * BULTOS[k + 4]);
  }
  d *= 1 - 0.85 * pesoCara(x, y, z);
  if (z > 0) {
    // ombligo: hoyito ovalado
    const ex = (x * RX) / 0.03, ey = (y * RY - OMB_Y) / 0.048;
    d -= 0.02 * Math.exp(-(ex * ex + ey * ey));
  }
  return d;
}
function superficie(x, y, z, out) {
  forma(x, y, z, out);
  const d = desplaz(x, y, z);
  return out.set(out.x + x * d, out.y + y * d, out.z + z * d);
}
// Normal de la superficie con bultos (por diferencias finitas).
const _s1 = vec(), _s2 = vec(), _s3 = vec(), _s4 = vec();
function normalSup(x, y, z, out) {
  let bx, by, bz;
  if (Math.abs(y) > 0.9) [bx, by, bz] = [y, -x, 0]; // a × Z
  else [bx, by, bz] = [-z, 0, x]; // a × Y
  let l = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
  bx /= l; by /= l; bz /= l;
  const cx = y * bz - z * by, cy = z * bx - x * bz, cz = x * by - y * bx;
  const e = 0.01;
  const P = (ox, oy, oz, o) => {
    const k = 1 / Math.sqrt(ox * ox + oy * oy + oz * oz);
    return superficie(ox * k, oy * k, oz * k, o);
  };
  P(x + bx * e, y + by * e, z + bz * e, _s1);
  P(x - bx * e, y - by * e, z - bz * e, _s2);
  P(x + cx * e, y + cy * e, z + cz * e, _s3);
  P(x - cx * e, y - cy * e, z - cz * e, _s4);
  const ux = _s1.x - _s2.x, uy = _s1.y - _s2.y, uz = _s1.z - _s2.z;
  const vx = _s3.x - _s4.x, vy = _s3.y - _s4.y, vz = _s3.z - _s4.z;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  if (nx * x + ny * y + nz * z < 0) l = -l;
  return out.set(nx / l, ny / l, nz / l);
}
// Punto de la cara lisa a partir de coordenadas de frente (x, y).
function puntoFrente(x, y, o) {
  const dy = clamp(y / RY, -0.999, 0.999);
  const w = 1 - ENSANCHE * dy;
  const dx = x / (RX * w);
  const dz = Math.sqrt(Math.max(1 - dx * dx - dy * dy, 0.0004));
  return o.set(x, y, dz * RZ * w);
}
// Punto y normal de la cara lisa (ojos, boca, dientes).
const _fA = vec(), _fB = vec();
function superficieXY(x, y, outP, outN) {
  puntoFrente(x, y, outP);
  const e = 0.004;
  puntoFrente(x + e, y, _fA);
  puntoFrente(x - e, y, _fB);
  const tx = _fA.x - _fB.x, ty = _fA.y - _fB.y, tz = _fA.z - _fB.z;
  puntoFrente(x, y + e, _fA);
  puntoFrente(x, y - e, _fB);
  const sx = _fA.x - _fB.x, sy = _fA.y - _fB.y, sz = _fA.z - _fB.z;
  const nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  outN.set(nx / l, ny / l, nz / l);
  return outP;
}

// =============================================================================
// 4. Tubos con sección elíptica (antena, brazos, patas, labios, dedos…)
// =============================================================================
function crearTubo(THREE, nSeg, nRad, tapaIni, tapaFin) {
  const anillo = nRad + 1;
  let nv = (nSeg + 1) * anillo;
  const poloIni = tapaIni ? nv++ : -1;
  const poloFin = tapaFin ? nv++ : -1;
  const idx = [];
  for (let i = 0; i < nSeg; i++)
    for (let j = 0; j < nRad; j++) {
      const a = i * anillo + j, b = (i + 1) * anillo + j, c = b + 1, d = a + 1;
      idx.push(a, d, b, d, c, b);
    }
  if (tapaIni) for (let j = 0; j < nRad; j++) idx.push(j + 1, j, poloIni);
  if (tapaFin) {
    const base = nSeg * anillo;
    for (let j = 0; j < nRad; j++) idx.push(base + j, base + j + 1, poloFin);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
  geo.setIndex(idx);
  const cos = new Float32Array(anillo), sin = new Float32Array(anillo);
  for (let j = 0; j <= nRad; j++) {
    cos[j] = Math.cos((j / nRad) * TAU);
    sin[j] = Math.sin((j / nRad) * TAU);
  }
  geo.userData.tubo = { nSeg, nRad, poloIni, poloFin, cos, sin };
  return geo;
}
// Escribe el tubo a lo largo de pts (nSeg+1 puntos con x, y, z). radA: radio
// en la dirección de «ref» (proyectada), radB: radio perpendicular. Pueden ser
// funciones de t (0..1) o arreglos. ref: vector o arreglo de vectores.
// Es la parte que corre en cada cuadro para brazos y patas: cuentas simples.
function escribirTubo(geo, pts, radA, radB, ref, u0 = 0, u1 = 1, tapa = 1) {
  const { nSeg, nRad, poloIni, poloFin, cos, sin } = geo.userData.tubo;
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, uv = geo.attributes.uv.array;
  const anillo = nRad + 1;
  const fa = typeof radA === 'function', fb = typeof radB === 'function', varios = Array.isArray(ref);
  let Nx = 1, Ny = 0, Nz = 0, tieneN = false;
  let Tx = 0, Ty = 1, Tz = 0, aFin = 0, bFin = 0;
  for (let i = 0; i <= nSeg; i++) {
    const p = pts[i], pa = pts[i < nSeg ? i + 1 : nSeg], pb = pts[i > 0 ? i - 1 : 0];
    Tx = pa.x - pb.x;
    Ty = pa.y - pb.y;
    Tz = pa.z - pb.z;
    let l = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz) || 1;
    Tx /= l; Ty /= l; Tz /= l;
    const rf = varios ? ref[i] : ref;
    const d = Tx * rf.x + Ty * rf.y + Tz * rf.z;
    let rx = rf.x - Tx * d, ry = rf.y - Ty * d, rz = rf.z - Tz * d;
    l = rx * rx + ry * ry + rz * rz;
    if (l < 1e-6) {
      // la referencia quedó paralela al tubo: se sigue con la anterior
      if (!tieneN) [Nx, Ny, Nz] = Math.abs(Tx) < 0.9 ? [1, 0, 0] : [0, 0, 1];
      const e = Tx * Nx + Ty * Ny + Tz * Nz;
      rx = Nx - Tx * e; ry = Ny - Ty * e; rz = Nz - Tz * e;
      l = rx * rx + ry * ry + rz * rz;
    }
    l = Math.sqrt(l) || 1;
    Nx = rx / l; Ny = ry / l; Nz = rz / l;
    tieneN = true;
    const Bx = Ty * Nz - Tz * Ny, By = Tz * Nx - Tx * Nz, Bz = Tx * Ny - Ty * Nx;
    const t = i / nSeg;
    const a = Math.max(1e-4, fa ? radA(t) : radA[i]);
    const b = Math.max(1e-4, fb ? radB(t) : radB[i]);
    if (i === 0 && poloIni >= 0) {
      const r0 = Math.min(a, b) * tapa, k3 = poloIni * 3;
      pos[k3] = p.x - Tx * r0; pos[k3 + 1] = p.y - Ty * r0; pos[k3 + 2] = p.z - Tz * r0;
      nor[k3] = -Tx; nor[k3 + 1] = -Ty; nor[k3 + 2] = -Tz;
      uv[poloIni * 2] = u0;
      uv[poloIni * 2 + 1] = 0.5;
    }
    const ia = 1 / a, ib = 1 / b, u = u0 + (u1 - u0) * t;
    for (let j = 0; j <= nRad; j++) {
      const co = cos[j], si = sin[j];
      const k = i * anillo + j, k3 = k * 3;
      pos[k3] = p.x + Nx * co * a + Bx * si * b;
      pos[k3 + 1] = p.y + Ny * co * a + By * si * b;
      pos[k3 + 2] = p.z + Nz * co * a + Bz * si * b;
      const nx = Nx * co * ia + Bx * si * ib, ny = Ny * co * ia + By * si * ib, nz = Nz * co * ia + Bz * si * ib;
      const ln = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nor[k3] = nx * ln; nor[k3 + 1] = ny * ln; nor[k3 + 2] = nz * ln;
      uv[k * 2] = u;
      uv[k * 2 + 1] = j / nRad;
    }
    aFin = a;
    bFin = b;
  }
  if (poloFin >= 0) {
    const p = pts[nSeg], r0 = Math.min(aFin, bFin) * tapa, k3 = poloFin * 3;
    pos[k3] = p.x + Tx * r0; pos[k3 + 1] = p.y + Ty * r0; pos[k3 + 2] = p.z + Tz * r0;
    nor[k3] = Tx; nor[k3 + 1] = Ty; nor[k3 + 2] = Tz;
    uv[poloFin * 2] = u1;
    uv[poloFin * 2 + 1] = 0.5;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  geo.attributes.uv.needsUpdate = true;
  geo.boundingBox = null; // se recalcula solo si alguien lo pide
  return geo;
}
// Perfil de radios por tramos: perfil([r0, r1, …]) → función de t.
const perfil = (vals) => (t) => {
  const f = clamp(t) * (vals.length - 1);
  const i = Math.min(vals.length - 2, Math.floor(f));
  const k = f - i;
  return lerp(vals[i], vals[i + 1], k * k * (3 - 2 * k));
};
// Muestras parejas de una curva suave por puntos de control.
const muestrear = (THREE, ctrl, n) =>
  new THREE.CatmullRomCurve3(ctrl.map((c) => new THREE.Vector3(c[0], c[1], c[2])), false, 'centripetal').getSpacedPoints(n);
const ADELANTE = { x: 0, y: 0, z: 1 }, ARRIBA = { x: 0, y: 1, z: 0 }, COSTADO = { x: 1, y: 0, z: 0 };
// Tubo fijo (se escribe una sola vez).
function tuboFijo(THREE, ctrl, nSeg, nRad, radA, radB, ref, u0, u1, tapaIni = false, tapaFin = true, tapa = 1) {
  const geo = escribirTubo(crearTubo(THREE, nSeg, nRad, tapaIni, tapaFin), muestrear(THREE, ctrl, nSeg), radA, radB, ref, u0, u1, tapa);
  geo.computeBoundingSphere();
  return geo;
}
// Junta varias geometrías indexadas en una sola (posición, normal y uv).
function juntar(THREE, geos) {
  let nv = 0, ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[oi + k] = gi[k] + ov;
    ov += g.attributes.position.count;
    oi += gi.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

// =============================================================================
// 5. Datos compartidos: no dependen del color ni de cada Coco, se calculan con el
// primero y se reusan (degradés, manchas, relieve, ojo, forma de la bola).
// =============================================================================
const TW = 1024, TH = 512; // piel de la bola (equirectangular, como los UV de SphereGeometry)
const GW = 256, GH = 128; // grilla de los degradés (se agranda con suavizado)
const BW = 512, BH = 256; // brillo propio de la bola
const MW = 512, MH = 128; // piel de brazos, patas y antena (u = a lo largo, v = alrededor)
const CACHE = { datos: null, pintados: new Map(), cuerpo: null };
let instancias = 0; // cada Coco tiene su propio azar de animación (no parpadean todos juntos)

// Dirección para un punto (u, v) del mapa de la esfera (v = 0 arriba).
function dirUV(u, v, out) {
  const ph = u * TAU, th = v * Math.PI;
  return out.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
}
// Llama a fn(x, y, rx, ry) con el centro y los radios en píxeles de una
// mancha (dirección x, y, z; radio angular r; alargue e), repitiendo en la costura.
function enMapa(f, W, H, escala, fn) {
  const th = Math.acos(clamp(f.y, -1, 1));
  let ph = Math.atan2(f.z, -f.x);
  if (ph < 0) ph += TAU;
  const cx = (ph / TAU) * W, cy = (th / Math.PI) * H;
  const sinT = Math.max(Math.sin(th), 0.12);
  const rx = ((f.r * escala) / sinT / TAU) * W, ry = ((f.r * (f.e || 1) * escala) / Math.PI) * H;
  for (const off of [-W, 0, W]) if (cx + off + rx > 0 && cx + off - rx < W) fn(cx + off, cy, rx, ry);
}
// Igual, pero deja el contexto transformado: el círculo unidad = la mancha.
function enMapaLocal(ctx, f, W, H, fn) {
  enMapa(f, W, H, 1, (x, y, rx, ry) => {
    if (x + rx * 3 < 0 || x - rx * 3 > W) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    fn(ctx);
    ctx.restore();
  });
}
// Gota con la punta para arriba (coordenadas unidad).
function caminoGota(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -1.15);
  ctx.quadraticCurveTo(0.72, -0.25, 0.8, 0.25);
  ctx.arc(0, 0.25, 0.8, 0, Math.PI, false);
  ctx.quadraticCurveTo(-0.72, -0.25, 0, -1.15);
  ctx.closePath();
}
const elipse = (ctx, x, y, rx, ry) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, TAU);
  ctx.fill();
};

function datosCompartidos() {
  if (CACHE.datos) return CACHE.datos;
  const p = vec();
  // degradé cálido (calor), manchones claros/oscuros del violeta (tono) y
  // naranja ↔ amarillo dentro de lo cálido (amar)
  const calor = new Float32Array(GW * GH), tono = new Float32Array(GW * GH), amar = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      dirUV((i + 0.5) / GW, (j + 0.5) / GH, p);
      const k = j * GW + i;
      const w = calorDir(p.x, p.y, p.z);
      calor[k] = w;
      tono[k] = clamp((fbm3(p.x * 3.6 + 9, p.y * 3.6, p.z * 3.6) - 0.5) * 2.6, -1, 1) * (1 - 0.7 * mascaraCara(p.x, p.y, p.z));
      amar[k] = clamp(suave(0.38, 0.64, fbm3(p.x * 3.1, p.y * 3.1 + 7, p.z * 3.1)) * 0.9 + w * 0.25 - 0.1);
    }
  const manchas = generarManchas();
  CACHE.datos = {
    calor, tono, amar, manchas,
    gotas3D: ubicarGotas(manchas),
    relieve: hacerRelieve(manchas),
    miembro: datosMiembro(),
    ojo: pintarOjo(),
  };
  return CACHE.datos;
}

// Manchas de la bola (como en la referencia): gotas amarillas alargadas con
// punta y aureola naranja, gotas violetas oscuras, bultos amarillos en lo
// cálido, puntitos naranjas, motitas oscuras y verrugas (solo relieve).
function generarManchas() {
  const r = azar(777);
  const lista = [], grandes = [];
  const agregar = (tipo, n, cond, rMin, rMax, eMin, eMax, sep = 0) => {
    for (let intentos = n * 90; n > 0 && intentos > 0; intentos--) {
      const [x, y, z] = dirAzar(r);
      if (Math.abs(y) > 0.93 || enOmbligo(x, y, z)) continue;
      const w = calorDir(x, y, z), fm = mascaraCara(x, y, z);
      if (!cond(x, y, z, w, fm)) continue;
      const rad = lerp(rMin, rMax, Math.pow(r(), 1.6));
      const f = { x, y, z, r: rad, e: lerp(eMin, eMax, r()), tipo, w };
      // las grandes no se pisan entre sí; las chicas no caen arriba de una grande
      // (una motita oscura sobre una gota amarilla parece un ojo)
      if (grandes.some((g) => Math.acos(clamp(g.x * x + g.y * y + g.z * z, -1, 1)) < (sep ? (g.r + rad) * sep : g.r * g.e * 1.15 + rad))) continue;
      lista.push(f);
      if (sep) grandes.push(f);
      n--;
    }
  };
  agregar('gota', 64, (x, y, z, w, fm) => w < 0.55 && fm < 0.05 && y < 0.62 && z > -0.35, 0.022, 0.062, 1.05, 1.65, 1.25);
  agregar('lila', 40, (x, y, z, w, fm) => fm < 0.05 && y < 0.62, 0.024, 0.056, 1.1, 1.5, 1.2);
  agregar('bulto', 130, (x, y, z, w, fm) => w > 0.38 && fm < 0.05, 0.018, 0.06, 1, 1.15, 1.12);
  agregar('puntoTibio', 70, (x, y, z, w, fm) => w > 0.5 && fm < 0.05, 0.012, 0.03, 1, 1.2, 1.05);
  agregar('punto', 190, (x, y, z, w, fm) => fm < 0.35, 0.008, 0.019, 1, 1.35);
  agregar('mota', 340, (x, y, z, w, fm) => fm < 0.7, 0.005, 0.013, 1, 1.2);
  agregar('verruga', 520, (x, y, z, w, fm) => fm < 0.25, 0.01, 0.03, 1, 1.1);
  return lista;
}

// Las gotas y bultos más grandes van también en relieve 3D (una InstancedMesh):
// se guardan sus matrices (columnas: costado, arriba, normal, posición).
function ubicarGotas(manchas) {
  const lista = manchas.filter(
    (f) => ((f.tipo === 'gota' && f.r > 0.04) || (f.tipo === 'bulto' && f.r > 0.038) || (f.tipo === 'lila' && f.r > 0.036)) && !zonaBoca(f.x, f.y, f.z) && Math.abs(f.y) < 0.9,
  );
  const matrices = new Float32Array(lista.length * 16);
  const P = vec(), N = vec();
  lista.forEach((f, i) => {
    superficie(f.x, f.y, f.z, P);
    normalSup(f.x, f.y, f.z, N);
    // «abajo» sobre la superficie y el costado
    let dx = N.x * N.y, dy = -1 + N.y * N.y, dz = N.z * N.y;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const cx = N.y * dz - N.z * dy, cy = N.z * dx - N.x * dz, cz = N.x * dy - N.y * dx;
    const esGota = f.tipo === 'gota';
    const a = f.r * 0.45 * (esGota ? 0.78 : 0.95), b = f.r * f.e * 0.45 * (esGota ? 0.85 : 0.95);
    const h = (f.tipo === 'bulto' ? 0.55 : 0.62) * a;
    let px = P.x - N.x * h * 0.3, py = P.y - N.y * h * 0.3, pz = P.z - N.z * h * 0.3;
    if (esGota) {
      // la panza de la gota abajo: la punta queda pintada arriba
      px += dx * b * 0.2;
      py += dy * b * 0.2;
      pz += dz * b * 0.2;
    }
    matrices.set([cx * a, cy * a, cz * a, 0, -dx * b, -dy * b, -dz * b, 0, N.x * h, N.y * h, N.z * h, 0, px, py, pz, 1], i * 16);
  });
  return { lista, matrices };
}

// Bultito con perfil suave (1 - d²)², elíptico; alto > 0 sube, < 0 hunde.
function bultoEn(alt, W, H, cx, cy, rx, ry, alto) {
  rx = Math.max(rx, 0.7);
  ry = Math.max(ry, 0.7);
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  const A = alto * 0.4;
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) alt[y * W + x] += A * (1 - d2) * (1 - d2);
    }
  }
}
// Alturas → mapa de normales (canvas). corrX: corrección del estiramiento
// horizontal por fila (la esfera equirectangular); envolver: repetir en Y.
function alturasANormales(alt, W, H, fuerza, corrX, envolverY) {
  const cv = crearCanvas(W, H), ctx = cv.getContext('2d');
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const kx = corrX ? 1 / Math.max(Math.sin(((y + 0.5) / H) * Math.PI), 0.2) : 1;
    const ya = envolverY ? (y - 1 + H) % H : Math.max(0, y - 1);
    const yb = envolverY ? (y + 1) % H : Math.min(H - 1, y + 1);
    const fila = y * W, arriba = ya * W, abajo = yb * W;
    for (let x = 0; x < W; x++) {
      const xi = x === 0 ? W - 1 : x - 1, xd = x === W - 1 ? 0 : x + 1;
      const nx = -(alt[fila + xd] - alt[fila + xi]) * fuerza * kx;
      const ny = (alt[abajo + x] - alt[arriba + x]) * fuerza;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      const k = (fila + x) * 4;
      out.data[k] = (nx / l) * 127.5 + 127.5;
      out.data[k + 1] = (ny / l) * 127.5 + 127.5;
      out.data[k + 2] = (1 / l) * 127.5 + 127.5;
      out.data[k + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}
// Relieve fino de la bola: las manchas, granitos sueltos y el ombligo.
function hacerRelieve(manchas) {
  const W = TW, H = TH, alt = new Float32Array(W * H);
  const ALTO = { gota: 0.75, lila: 0.7, bulto: 0.8, puntoTibio: -0.35, punto: 0.3, mota: -0.45, verruga: 0.5 };
  for (const f of manchas) {
    const grande = f.tipo === 'gota' || f.tipo === 'lila' || f.tipo === 'bulto';
    enMapa(f, W, H, grande ? 1.2 : 1.05, (x, y, rx, ry) => bultoEn(alt, W, H, x, y, rx, ry, ALTO[f.tipo]));
  }
  // granitos sueltos (piel de caramelo); en la cara, menos
  const r = azar(5);
  for (let k = 0; k < 3400; k++) {
    const [x, y, z] = dirAzar(r);
    const cara = pesoCara(x, y, z);
    const rad = (0.007 + r() * 0.016) * (1 - cara * 0.5);
    const alto = (r() < 0.8 ? 0.45 : -0.35) * (1 - cara * 0.6);
    enMapa({ x, y, z, r: rad, e: 1 }, W, H, 1, (px, py, rx, ry) => bultoEn(alt, W, H, px, py, rx, ry, alto));
  }
  // ombligo: hoyito
  const oy = OMB_Y / RY;
  enMapa({ x: 0, y: oy, z: Math.sqrt(1 - oy * oy), r: 0.075, e: 1.6 }, W, H, 1, (x, y, rx, ry) => bultoEn(alt, W, H, x, y, rx, ry, -1.6));
  return alturasANormales(alt, W, H, 4.5, true, false);
}

// Brazos, patas y antena: degradé a lo largo (las puntas, cálidas), manchas y relieve.
function datosMiembro() {
  const calor = new Float32Array(128 * 32);
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 128; i++) {
      const u = i / 127, ang = (j / 32) * TAU;
      const n = fbm3(u * 7, Math.cos(ang) * 1.3 + 4, Math.sin(ang) * 1.3);
      calor[j * 128 + i] = suave(0.6, 0.97, u + (n - 0.5) * 0.4);
    }
  const manchas = [];
  const r = azar(23);
  for (let k = 0; k < 150; k++) {
    const u = r(), v = r(), q = r();
    if (q < 0.24) manchas.push({ u, v, a: 2.2 + r() * 3, b: 2.6 + r() * 3.2, tipo: 'gota' });
    else if (q < 0.4) manchas.push({ u, v, a: 2 + r() * 2.5, b: 2 + r() * 2.5, tipo: 'lila' });
    else manchas.push({ u, v, a: 1.2 + r() * 2.2, b: 1.2 + r() * 2.2, tipo: u > 0.75 ? 'puntoTibio' : 'mota' });
  }
  for (let k = 0; k < 220; k++) manchas.push({ u: r(), v: r(), a: 0.8 + r() * 0.8, b: 0.8 + r() * 0.8, tipo: r() < 0.5 ? 'punto' : 'mota' });
  // sin motitas arriba de las gotas (parecerían ojos)
  const gotas = manchas.filter((m) => m.tipo === 'gota' || m.tipo === 'lila');
  for (let k = manchas.length - 1; k >= 0; k--) {
    const m = manchas[k];
    if (m.tipo === 'gota' || m.tipo === 'lila') continue;
    if (gotas.some((g) => Math.hypot((g.u - m.u) * MW, Math.min(Math.abs(g.v - m.v), 1 - Math.abs(g.v - m.v)) * MH) < Math.max(g.a, g.b) * 1.6 + m.a)) manchas.splice(k, 1);
  }
  // relieve: las manchas y verruguitas
  const alt = new Float32Array(MW * MH);
  for (const m of manchas) {
    const alto = m.tipo === 'gota' || m.tipo === 'lila' ? 0.8 : -0.3;
    for (const off of [-MH, 0, MH]) bultoEn(alt, MW, MH, m.u * MW, m.v * MH + off, m.a * 1.2, m.b * 1.2, alto);
  }
  for (let k = 0; k < 700; k++) {
    const x = r() * MW, y = r() * MH, rr = 1.2 + r() * 2.5, alto = r() < 0.8 ? 0.5 : -0.3;
    for (const off of [-MH, 0, MH]) bultoEn(alt, MW, MH, x, y + off, rr, rr, alto);
  }
  return { calor, manchas, relieve: alturasANormales(alt, MW, MH, 3, false, true) };
}

// Ojo: globo crema, iris marrón con rayitas y pupila negra (mira hacia +Z = u 0.25).
// Sin brillitos pintados: los pone el barniz (clearcoat) con la luz de verdad.
function pintarOjo() {
  const W = 256, H = 128;
  const cv = crearCanvas(W, H), ctx = cv.getContext('2d');
  ctx.fillStyle = '#f8f1dc';
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.25, cy = H / 2;
  const rad = (ang) => (ang / Math.PI) * H; // radio angular → píxeles
  const g0 = ctx.createRadialGradient(cx, cy, rad(0.6), cx, cy, rad(1.4));
  g0.addColorStop(0, 'rgba(240,200,170,0)');
  g0.addColorStop(1, 'rgba(230,185,160,0.35)');
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(cx, cy, rad(0.18), cx, cy, rad(0.47));
  g.addColorStop(0, '#5a300c');
  g.addColorStop(0.35, '#9a5e1c');
  g.addColorStop(0.75, '#7a4512');
  g.addColorStop(1, '#3a1c06');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rad(0.47), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,24,6,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rad(0.27), cy + Math.sin(a) * rad(0.27));
    ctx.lineTo(cx + Math.cos(a) * rad(0.44), cy + Math.sin(a) * rad(0.44));
    ctx.stroke();
  }
  ctx.fillStyle = '#0a0503';
  ctx.beginPath();
  ctx.arc(cx, cy, rad(0.25), 0, TAU);
  ctx.fill();
  return cv;
}

// =============================================================================
// 6. Pintura según el color (se guarda por color: los Cocos del mismo color
// comparten los canvas y cambiar de color y volver es instantáneo)
// =============================================================================
function pintarCuerpo(D, pal) {
  const base = hexRGB(pal.base), tibio = hexRGB(pal.tibio), calido = hexRGB(pal.calido);
  const medio = pal.medio ? hexRGB(pal.medio) : null;
  const profundo = mezclar(base, NEGRO, 0.38), claro = mezclar(base, BLANCO, 0.16);
  const cvG = crearCanvas(GW, GH), ctxG = cvG.getContext('2d');
  const cv = crearCanvas(TW, TH), ctx = cv.getContext('2d');
  const cvB = crearCanvas(BW, BH), ctxB = cvB.getContext('2d');
  const img = ctxG.createImageData(GW, GH), imgB = ctxG.createImageData(GW, GH);
  for (let k = 0; k < GW * GH; k++) {
    const w = D.calor[k], s = D.tono[k], am = D.amar[k];
    let c = s < 0 ? mezclar(base, profundo, -s * 0.75) : mezclar(base, claro, s * 0.5);
    const cal = mezclar(tibio, calido, am);
    if (medio) {
      c = mezclar(c, medio, suave(0.04, 0.4, w));
      c = mezclar(c, tibio, suave(0.25, 0.7, w));
      c = mezclar(c, cal, suave(0.55, 1, w));
    } else {
      c = mezclar(c, tibio, suave(0.06, 0.6, w));
      c = mezclar(c, cal, suave(0.5, 1, w));
    }
    img.data[k * 4] = c[0];
    img.data[k * 4 + 1] = c[1];
    img.data[k * 4 + 2] = c[2];
    img.data[k * 4 + 3] = 255;
    // brillo propio (luz que atraviesa la gomita): solo en lo cálido
    const gl = suave(0.3, 1, w) * (0.55 + 0.45 * am);
    imgB.data[k * 4] = cal[0] * gl;
    imgB.data[k * 4 + 1] = cal[1] * gl;
    imgB.data[k * 4 + 2] = cal[2] * gl;
    imgB.data[k * 4 + 3] = 255;
  }
  ctxG.putImageData(imgB, 0, 0);
  ctxB.imageSmoothingEnabled = true;
  ctxB.drawImage(cvG, 0, 0, BW, BH);
  ctxG.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cvG, 0, 0, TW, TH);

  const gota = hexRGB(pal.gota), halo = hexRGB(pal.halo), lila = hexRGB(pal.lila), oscuro = hexRGB(pal.oscuro);
  const verruga = hexRGB(pal.verruga), punto = hexRGB(pal.punto), puntoTibio = hexRGB(pal.puntoTibio);
  const gotaClara = mezclar(gota, BLANCO, 0.55), gotaBorde = mezclar(gota, halo, 0.55);
  const lilaClara = mezclar(lila, BLANCO, 0.3), lilaBorde = mezclar(lila, NEGRO, 0.35);
  const puntoCalido = mezclar(tibio, NEGRO, 0.18);
  for (const f of D.manchas) {
    enMapaLocal(ctx, f, TW, TH, (c) => {
      let g;
      switch (f.tipo) {
        case 'gota':
          g = c.createRadialGradient(0, 0.25, 0, 0, 0.25, 1.9);
          g.addColorStop(0, rgbCss(halo, 0.55));
          g.addColorStop(1, rgbCss(halo, 0));
          c.fillStyle = g;
          c.beginPath();
          c.arc(0, 0.25, 1.9, 0, TAU);
          c.fill();
          g = c.createRadialGradient(-0.25, 0, 0.05, 0, 0.2, 1.05);
          g.addColorStop(0, rgbCss(gotaClara));
          g.addColorStop(0.5, rgbCss(gota));
          g.addColorStop(1, rgbCss(gotaBorde));
          c.fillStyle = g;
          if (f.e > 1.3) caminoGota(c);
          else {
            c.beginPath();
            c.arc(0, 0.1, 0.95, 0, TAU);
          }
          c.fill();
          break;
        case 'bulto':
          g = c.createRadialGradient(-0.2, -0.2, 0.05, 0, 0, 1.1);
          g.addColorStop(0, rgbCss(mezclar(verruga, BLANCO, 0.45)));
          g.addColorStop(0.45, rgbCss(verruga));
          g.addColorStop(0.85, rgbCss(gotaBorde, 0.85));
          g.addColorStop(1, rgbCss(gotaBorde, 0));
          c.fillStyle = g;
          c.beginPath();
          c.arc(0, 0, 1.1, 0, TAU);
          c.fill();
          break;
        case 'lila':
          g = c.createRadialGradient(-0.25, -0.25, 0.05, 0, 0, 1.05);
          g.addColorStop(0, rgbCss(lilaClara));
          g.addColorStop(0.4, rgbCss(lila));
          g.addColorStop(1, rgbCss(lilaBorde));
          c.fillStyle = g;
          c.beginPath();
          c.arc(0, 0, 1.05, 0, TAU);
          c.fill();
          break;
        case 'puntoTibio':
          c.fillStyle = rgbCss(puntoTibio, 0.95);
          c.beginPath();
          c.arc(0, 0, 1, 0, TAU);
          c.fill();
          break;
        case 'punto':
          c.fillStyle = rgbCss(f.w > 0.5 ? puntoCalido : punto, 0.95);
          c.beginPath();
          c.arc(0, 0, 1, 0, TAU);
          c.fill();
          break;
        case 'mota':
          c.fillStyle = rgbCss(oscuro, 0.92);
          c.beginPath();
          c.arc(0, 0, 1, 0, TAU);
          c.fill();
          break;
        default: // verruga: apenas un brillito
          g = c.createRadialGradient(-0.3, -0.3, 0, 0, 0, 1);
          g.addColorStop(0, 'rgba(255,255,255,0.16)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.beginPath();
          c.arc(0, 0, 1, 0, TAU);
          c.fill();
      }
    });
    // en el brillo propio: las gotas brillan, lo oscuro no
    if (f.tipo === 'gota' || f.tipo === 'bulto') ctxB.fillStyle = rgbCss(f.tipo === 'gota' ? gota : verruga, 0.7);
    else if (f.tipo === 'lila' || f.tipo === 'mota' || f.tipo === 'puntoTibio') ctxB.fillStyle = '#000';
    else continue;
    enMapa(f, BW, BH, 1, (x, y, rx, ry) => elipse(ctxB, x, y, rx, ry));
  }
  // ombligo: hoyito oscuro y suave
  const oy = OMB_Y / RY;
  const hoyo = mezclar(base, NEGRO, 0.72);
  enMapaLocal(ctx, { x: 0, y: oy, z: Math.sqrt(1 - oy * oy), r: 0.06, e: 1.6 }, TW, TH, (c) => {
    const g = c.createRadialGradient(0, 0.1, 0, 0, 0, 1.25);
    g.addColorStop(0, rgbCss(hoyo, 0.95));
    g.addColorStop(0.55, rgbCss(hoyo, 0.55));
    g.addColorStop(1, rgbCss(hoyo, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 1.25, 0, TAU);
    c.fill();
  });
  return { piel: cv, brillo: cvB };
}

function pintarMiembros(D, pal) {
  const M = D.miembro;
  const base = hexRGB(pal.base), tibio = hexRGB(pal.tibio), calido = hexRGB(pal.calido);
  const claro = mezclar(base, BLANCO, 0.12);
  const cvG = crearCanvas(128, 32), ctxG = cvG.getContext('2d');
  const cvB = crearCanvas(128, 32), ctxB = cvB.getContext('2d');
  const cv = crearCanvas(MW, MH), ctx = cv.getContext('2d');
  const img = ctxG.createImageData(128, 32), imgB = ctxB.createImageData(128, 32);
  for (let k = 0; k < 128 * 32; k++) {
    const w = M.calor[k];
    let c = mezclar(base, claro, suave(0.1, 0.5, w));
    c = mezclar(c, tibio, suave(0.25, 0.65, w));
    c = mezclar(c, calido, suave(0.65, 1, w));
    img.data[k * 4] = c[0];
    img.data[k * 4 + 1] = c[1];
    img.data[k * 4 + 2] = c[2];
    img.data[k * 4 + 3] = 255;
    const g = suave(0.3, 1, w); // brillo propio en las puntas cálidas
    imgB.data[k * 4] = c[0] * g;
    imgB.data[k * 4 + 1] = c[1] * g;
    imgB.data[k * 4 + 2] = c[2] * g;
    imgB.data[k * 4 + 3] = 255;
  }
  ctxG.putImageData(img, 0, 0);
  ctxB.putImageData(imgB, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cvG, 0, 0, MW, MH);
  const col = {
    gota: hexRGB(pal.gota), lila: hexRGB(pal.lila), mota: hexRGB(pal.oscuro),
    punto: hexRGB(pal.punto), puntoTibio: mezclar(tibio, NEGRO, 0.25),
  };
  const halo = hexRGB(pal.halo);
  for (const m of M.manchas) {
    const x = m.u * MW, y = m.v * MH;
    for (const off of [-MH, 0, MH]) {
      if (m.tipo === 'gota') {
        ctx.fillStyle = rgbCss(halo, 0.3);
        elipse(ctx, x, y + off, m.a * 1.6, m.b * 1.6);
        ctx.fillStyle = rgbCss(col.gota);
        elipse(ctx, x, y + off, m.a, m.b);
        ctx.fillStyle = 'rgba(255,250,215,0.5)';
        elipse(ctx, x - m.a * 0.3, y + off - m.b * 0.3, m.a * 0.4, m.b * 0.4);
      } else {
        ctx.fillStyle = rgbCss(col[m.tipo], 0.9);
        elipse(ctx, x, y + off, m.a, m.b);
      }
    }
  }
  return { piel: cv, brillo: cvB };
}

// =============================================================================
// 7. Geometrías de las partes
// =============================================================================
// Párpado: casquete con borde enrollado (torno), solo la mitad de adelante.
function geoParpado(THREE) {
  const R = R_OJO + 0.005, th = 0.017;
  const pts = [];
  for (let k = 0; k <= 6; k++) {
    const ang = Math.PI + (k / 6) * Math.PI; // borde enrollado
    pts.push(new THREE.Vector2(R + th / 2 + Math.cos(ang) * (th / 2), Math.sin(ang) * (th / 2)));
  }
  for (let k = 1; k <= 10; k++) {
    const ang = (k / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(ang) * (R + th)), Math.sin(ang) * (R + th)));
  }
  return new THREE.LatheGeometry(pts, 22, -0.62 * Math.PI, 1.24 * Math.PI);
}

// Gotita en relieve: media esfera con el polo hacia +Z (la escala la da cada instancia).
function geoGota(THREE) {
  const g = new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

// Antena: tallo que sube apenas hacia +X y un rulo de helecho que cae hacia -X
// enrollándose para adentro. El rulo avanza en Z a medida que se cierra (una
// espiral cónica): así se lee como espiral desde el frente y de costado.
const ANT_SEG = 96, ANT_RAD = 8;
function geoAntena(THREE) {
  const S = 1.12;
  const ctrl = [
    [0, -0.04, 0], [0, 0.03, 0], [0.014, 0.1, 0], [0.016, 0.17, 0.002], [0.004, 0.235, 0.006],
    [-0.03, 0.285, 0.012], [-0.075, 0.305, 0.02], [-0.118, 0.285, 0.028], [-0.135, 0.24, 0.036],
    [-0.115, 0.2, 0.044], [-0.078, 0.192, 0.05], [-0.055, 0.218, 0.056], [-0.062, 0.25, 0.06], [-0.088, 0.258, 0.063], [-0.1, 0.24, 0.065],
  ].map(([x, y, z]) => [x * S, y * S, z * S]);
  const radio = perfil([0.024, 0.017, 0.0145, 0.013, 0.012, 0.011, 0.0095]);
  const geo = tuboFijo(THREE, ctrl, ANT_SEG, ANT_RAD, radio, radio, ADELANTE, 0.02, 0.6, false, true, 1);
  // la antena se dobla alrededor de su base: la esfera que la contiene es fija
  let max = 0;
  const p = geo.attributes.position.array;
  for (let k = 0; k < p.length; k += 3) max = Math.max(max, Math.hypot(p[k], p[k + 1], p[k + 2]));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), max + 0.01);
  const pesos = new Float32Array(ANT_SEG + 1);
  for (let i = 0; i <= ANT_SEG; i++) pesos[i] = Math.pow(i / ANT_SEG, 1.3);
  return { geo, reposo: p.slice(), reposoN: geo.attributes.normal.array.slice(), pesos };
}
// Brotecito en la base de la antena.
function geoBrote(THREE) {
  const r = perfil([0.016, 0.012, 0.008, 0.0035]);
  return tuboFijo(THREE, [[-0.004, -0.014, 0], [-0.026, 0.018, 0.006], [-0.046, 0.036, 0.012], [-0.056, 0.058, 0.014], [-0.048, 0.072, 0.012]], 14, 6, r, r, ADELANTE, 0.1, 0.32);
}

// Mano de un lado (s = +1 izquierda, -1 derecha), en el espacio de la muñeca:
// Y sube por el brazo (los dedos apuntan a -Y), +Z adelante, s·X hacia afuera.
// Una paleta ancha y chata (sigue al antebrazo, con el borde de afuera
// abultado) que se afina en un dedo largo en punta; un dedito atrás del lado
// de afuera y un pulgar (móvil) del lado de adentro: la pinza en V.
function geoMano(THREE, s) {
  const paleta = tuboFijo(THREE,
    [[0, 0.035, 0], [s * 0.012, -0.03, 0.001], [s * 0.02, -0.09, 0.003], [s * 0.016, -0.15, 0.005], [s * 0.006, -0.21, 0.008], [-s * 0.01, -0.29, 0.012]], 30, 12,
    perfil([0.026, 0.033, 0.035, 0.032, 0.025, 0.017, 0.009, 0.002]),
    perfil([0.05, 0.068, 0.08, 0.078, 0.06, 0.034, 0.017, 0.002]),
    ADELANTE, 0.42, 0.7, true, true, 0.6);
  const atras = tuboFijo(THREE, [[s * 0.05, -0.11, -0.012], [s * 0.066, -0.145, -0.02], [s * 0.07, -0.18, -0.026]], 8, 8,
    perfil([0.016, 0.011, 0.002]), perfil([0.02, 0.013, 0.002]), ADELANTE, 0.55, 0.7);
  const pivote = { x: -s * 0.05, y: -0.12, z: 0.004 };
  const pulgar = tuboFijo(THREE, [[s * 0.012, 0.012, 0], [-s * 0.016, -0.03, 0.004], [-s * 0.032, -0.072, 0.008], [-s * 0.032, -0.112, 0.011]], 12, 8,
    perfil([0.024, 0.018, 0.01, 0.002]), perfil([0.036, 0.025, 0.013, 0.002]), ADELANTE, 0.55, 0.72);
  return { fija: juntar(THREE, [paleta, atras]), pulgar, pivote };
}

// Pie: planta grande y chata (talón redondo atrás), tres dedos gordos en
// abanico y una garra crema en cada uno. El origen es el tobillo.
function geoPie(THREE) {
  const partes = [
    tuboFijo(THREE, [[0, -0.03, -0.1], [0, -0.036, -0.055], [0, -0.04, 0.0], [0, -0.042, 0.05], [0, -0.042, 0.09]], 14, 12,
      perfil([0.026, 0.044, 0.048, 0.046, 0.04]), perfil([0.036, 0.07, 0.09, 0.1, 0.094]), ARRIBA, 0.25, 0.48, true, true, 0.8),
    // empeine: el pie es gordito arriba, sube redondo hasta el tobillo
    tuboFijo(THREE, [[0, 0.0, -0.025], [0, -0.012, 0.02], [0, -0.026, 0.07]], 10, 12,
      perfil([0.026, 0.04, 0.03]), perfil([0.036, 0.062, 0.058]), ARRIBA, 0.22, 0.4, true, true, 0.8),
  ];
  const garras = [];
  for (const k of [-1, 0, 1]) {
    const ab = k * 0.3; // abanico
    const dx = (d) => k * 0.05 + Math.sin(ab) * d, dz = (d) => 0.07 + Math.cos(ab) * d;
    partes.push(tuboFijo(THREE, [[dx(0), -0.044, dz(0)], [dx(0.04), -0.047, dz(0.04)], [dx(0.075), -0.05, dz(0.075)]], 8, 8,
      perfil([0.04, 0.039, 0.034]), perfil([0.042, 0.041, 0.037]), ARRIBA, 0.48, 0.68, false, true, 0.5));
    garras.push(tuboFijo(THREE, [[dx(0.066), -0.05, dz(0.066)], [dx(0.1), -0.052, dz(0.1)], [dx(0.128), -0.064, dz(0.128)], [dx(0.142), -0.084, dz(0.142)]], 10, 8,
      perfil([0.031, 0.024, 0.014, 0.002]), perfil([0.033, 0.026, 0.015, 0.002]), ARRIBA, 0, 1));
  }
  return { piel: juntar(THREE, partes), garras: juntar(THREE, garras) };
}

// =============================================================================
// 8. Expresiones
// =============================================================================
// párpados: altura del borde (en radios del ojo; 1 = arriba, -1 = abajo)
// ceño: inclinación de los párpados de arriba (+ = enojado)
// boca: ancho (medio), sonrisa (comisuras), abre (alto en el centro),
//       arco (labio de arriba en arco), redondo (forma del agujero),
//       torcida, grosor del labio, dientes (largo por ranura), colmillo, lengua
const EXPR = {
  normal: {
    parpS: 0.28, parpI: -0.8, ceno: 0.06, mirarY: -0.02,
    ancho: 0.26, sonrisa: -0.3, abre: 0, arco: 0, redondo: 0.8, torcida: -0.008, grosor: 0.031,
    dS: [0, 0, 0, 0, 0, 0], dI: [0, 0, 0, 0, 0, 0], colmillo: 0.6, lengua: 0,
  },
  feliz: {
    parpS: 0.95, parpI: -0.48, ceno: -0.14, mirarY: 0.04,
    ancho: 0.29, sonrisa: 1, abre: 0.17, arco: -0.15, redondo: 0.75, torcida: 0, grosor: 0.021,
    dS: [0.03, 0.04, 0.045, 0.045, 0.04, 0.03], dI: [0.018, 0.024, 0.026, 0.026, 0.024, 0.018], colmillo: 0, lengua: 1,
  },
  determinado: {
    parpS: 0.3, parpI: -0.4, ceno: 0.36, mirarY: -0.1,
    ancho: 0.24, sonrisa: -0.6, abre: 0.045, arco: 0, redondo: 0.55, torcida: 0.01, grosor: 0.025,
    dS: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], dI: [0.03, 0.03, 0.03, 0.03, 0.03, 0.03], colmillo: 1, lengua: 0,
  },
  sorprendido: {
    parpS: 1.25, parpI: -1.12, ceno: -0.3, mirarY: 0.05,
    ancho: 0.185, sonrisa: 0, abre: 0.26, arco: 0.6, redondo: 0.5, torcida: 0, grosor: 0.022,
    dS: [0, 0.05, 0.07, 0.07, 0.05, 0], dI: [0, 0, 0.058, 0.058, 0, 0], colmillo: 0, lengua: 0.7,
  },
};
const CAMPOS = ['parpS', 'parpI', 'ceno', 'mirarY', 'ancho', 'sonrisa', 'abre', 'arco', 'redondo', 'torcida', 'grosor', 'colmillo', 'lengua'];
// cómo camina con cada cara: rebote, hamaca de brazos e inclinación
const ANIMO = {
  normal: { rebote: 0.8, brazos: 0.8, inclina: 0 },
  feliz: { rebote: 1.5, brazos: 1.3, inclina: -0.03 },
  determinado: { rebote: 0.9, brazos: 1.0, inclina: 0.08 },
  sorprendido: { rebote: 1.2, brazos: 1.2, inclina: -0.05 },
};
const RANURAS = [-0.68, -0.41, -0.137, 0.137, 0.41, 0.68]; // dientes, a lo ancho de la boca
const GOLPE_DUR = 0.26; // segundos

// =============================================================================
// 9. El personaje
// =============================================================================
export function createCharacter(THREE, { color = '#8a4fd6' } = {}) {
  const D = datosCompartidos();
  const V3 = THREE.Vector3;
  const basura = []; // geometrías, materiales y texturas a liberar en dispose()
  const guardar = (x) => (basura.push(x), x);
  const textura = (img, srgb) => {
    const t = new THREE.CanvasTexture(img);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return guardar(t);
  };
  // Vectores de trabajo (para no crear basura en cada cuadro).
  const _a = new V3(), _b = new V3(), _c = new V3(), _p = new V3(), _n = new V3();
  const _X = new V3(), _Y = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const vARRIBA = new V3(0, 1, 0), vADELANTE = new V3(0, 0, 1);

  // ---------------------------------------------------------------------------
  // Pintura y texturas
  // ---------------------------------------------------------------------------
  let pal = paletaDe(THREE, color);
  const pinturaDe = (p) => {
    let pin = CACHE.pintados.get(p.clave);
    if (!pin) {
      pin = { cuerpo: pintarCuerpo(D, p), miembro: pintarMiembros(D, p) };
      CACHE.pintados.set(p.clave, pin);
      if (CACHE.pintados.size > 12) CACHE.pintados.delete(CACHE.pintados.keys().next().value);
    }
    return pin;
  };
  const pin0 = pinturaDe(pal);
  const texPiel = textura(pin0.cuerpo.piel, true);
  texPiel.wrapS = THREE.RepeatWrapping;
  const texBrillo = textura(pin0.cuerpo.brillo, true);
  texBrillo.wrapS = THREE.RepeatWrapping;
  const texRelieve = textura(D.relieve, false);
  texRelieve.wrapS = THREE.RepeatWrapping;
  const texMiembro = textura(pin0.miembro.piel, true);
  texMiembro.wrapT = THREE.RepeatWrapping;
  const texMiembroBrillo = textura(pin0.miembro.brillo, true);
  texMiembroBrillo.wrapT = THREE.RepeatWrapping;
  const texRelieveM = textura(D.miembro.relieve, false);
  texRelieveM.wrapT = THREE.RepeatWrapping;
  const texOjo = textura(D.ojo, true);

  // Máscara de la boca (agujero en la piel, con alphaTest): coordenadas de
  // frente x ∈ [-0.4, 0.4], y ∈ [-0.35, 0.45] desde el centro de la bola.
  const MASC_W = 0.4, MASC_Y = 0.05, MASC_H = 0.4, MASC_PX = 256;
  const cvMasc = crearCanvas(MASC_PX, MASC_PX), ctxMasc = cvMasc.getContext('2d');
  const texMasc = guardar(new THREE.CanvasTexture(cvMasc));
  texMasc.channel = 1; // usa el atributo uv1 (proyección de frente)
  texMasc.generateMipmaps = false;
  texMasc.minFilter = THREE.LinearFilter;
  const mascX = (x) => (x / (2 * MASC_W) + 0.5) * MASC_PX;
  const mascY = (y) => (0.5 - (y - MASC_Y) / (2 * MASC_H)) * MASC_PX;

  // ---------------------------------------------------------------------------
  // Materiales (brillo de caramelo: barniz, rugosidad baja)
  // ---------------------------------------------------------------------------
  // Borde cálido «a contraluz» (fresnel sumado a la emisión), como la
  // aureola amarilla de la referencia. Su fuerza depende de la luz del día.
  const bordes = [];
  const conBorde = (mat, fuerza) => {
    const u = { value: new THREE.Color(), fuerza };
    bordes.push(u);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBorde = u;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBorde;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n\t{ float fr = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );\n\t  totalEmissiveRadiance += uBorde * pow( fr, 2.5 ); }',
        );
    };
    mat.customProgramCacheKey = () => 'coco-borde';
    return mat;
  };
  const matCuerpo = guardar(conBorde(new THREE.MeshPhysicalMaterial({
    map: texPiel, normalMap: texRelieve, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12,
    sheen: 0.45, sheenRoughness: 0.35, sheenColor: new THREE.Color(pal.tibio),
    emissive: 0xffffff, emissiveMap: texBrillo, emissiveIntensity: 0.4,
    alphaMap: texMasc, alphaTest: 0.5,
  }), 0.55));
  const matMiembro = guardar(conBorde(new THREE.MeshPhysicalMaterial({
    map: texMiembro, normalMap: texRelieveM, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12,
    sheen: 0.3, sheenRoughness: 0.35, sheenColor: new THREE.Color(pal.tibio),
    emissive: 0xffffff, emissiveMap: texMiembroBrillo, emissiveIntensity: 0.3,
  }), 0.3));
  const matPiel = guardar(conBorde(new THREE.MeshPhysicalMaterial({ color: pal.piel || pal.base, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08 }), 0.25));
  const matGotas = guardar(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const matOjo = guardar(new THREE.MeshPhysicalMaterial({ map: texOjo, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }));
  const matHueso = guardar(new THREE.MeshPhysicalMaterial({ color: '#f3e3bd', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
  const matForro = guardar(new THREE.MeshStandardMaterial({ color: '#4a0818', roughness: 0.85, side: THREE.BackSide }));
  const matLengua = guardar(new THREE.MeshPhysicalMaterial({ color: '#d9455e', roughness: 0.35, clearcoat: 0.6 }));
  // Sombra de la bola con el agujero de la boca recortado (si el juego usa sombras).
  const matSombra = guardar(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: texMasc, alphaTest: 0.5 }));

  // Luz del día (0 de noche, 1 de día): apaga el brillo propio y el borde
  // cálido de noche. Se lee de scene.environmentIntensity, que el cielo del
  // juego mueve entre 0,12 (noche) y 0,55 (día); sin entorno, es de día.
  let dia = -1;
  function ponerDia(d) {
    dia = d;
    const k = lerp(0.15, 1, d);
    matCuerpo.emissiveIntensity = 0.4 * k;
    matMiembro.emissiveIntensity = 0.3 * k;
    const borde = new THREE.Color(pal.halo);
    for (const u of bordes) u.value.copy(borde).multiplyScalar(u.fuerza * lerp(0.2, 1, d));
  }

  // ---------------------------------------------------------------------------
  // Armado
  // ---------------------------------------------------------------------------
  const root = new THREE.Group();
  root.name = 'coco';
  const cuerpoG = new THREE.Group(); // la bola: rebota, se inclina y se estira
  cuerpoG.name = 'cuerpo';
  cuerpoG.position.y = CENTRO_Y;
  root.add(cuerpoG);

  // --- La bola (la forma con bultos se calcula una vez y se copia) ---
  const geoCuerpo = guardar(new THREE.SphereGeometry(1, 72, 56));
  if (!CACHE.cuerpo) {
    const pos = geoCuerpo.attributes.position, n = pos.count;
    const uv1 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      _a.fromBufferAttribute(pos, i).normalize();
      superficie(_a.x, _a.y, _a.z, _b);
      pos.setXYZ(i, _b.x, _b.y, _b.z);
      // uv1 = proyección de frente (para la máscara de la boca); atrás, fuera del rango
      if (_b.z > 0.02) {
        uv1[i * 2] = _b.x / (2 * MASC_W) + 0.5;
        uv1[i * 2 + 1] = (_b.y - MASC_Y) / (2 * MASC_H) + 0.5;
      } else {
        uv1[i * 2] = _b.x >= 0 ? 1.2 : -0.2;
        uv1[i * 2 + 1] = 1.2;
      }
    }
    geoCuerpo.computeVertexNormals();
    // soldar normales en la costura y los polos (vértices repetidos)
    const nor = geoCuerpo.attributes.normal, grupos = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      _a.set(0, 0, 0);
      for (const i of g) _a.add(_b.fromBufferAttribute(nor, i));
      _a.normalize();
      for (const i of g) nor.setXYZ(i, _a.x, _a.y, _a.z);
    }
    CACHE.cuerpo = { pos: pos.array.slice(), nor: nor.array.slice(), uv1 };
  }
  geoCuerpo.attributes.position.array.set(CACHE.cuerpo.pos);
  geoCuerpo.attributes.normal.array.set(CACHE.cuerpo.nor);
  geoCuerpo.setAttribute('uv1', new THREE.BufferAttribute(CACHE.cuerpo.uv1.slice(), 2));
  geoCuerpo.computeBoundingSphere();
  const cuerpo = new THREE.Mesh(geoCuerpo, matCuerpo);
  cuerpo.name = 'bola';
  cuerpo.customDepthMaterial = matSombra;
  cuerpoG.add(cuerpo);

  // --- Forro de adentro (lo que se ve por el agujero de la boca) ---
  const forro = new THREE.Mesh(guardar(new THREE.SphereGeometry(1, 28, 18)), matForro);
  forro.scale.set(RX * 0.93, RY * 0.93, RZ * 0.93);
  cuerpoG.add(forro);

  // --- Gotitas y bultos en relieve (una sola malla instanciada) ---
  const mallaGotas = new THREE.InstancedMesh(guardar(geoGota(THREE)), matGotas, D.gotas3D.lista.length);
  mallaGotas.name = 'gotitas';
  mallaGotas.instanceMatrix.array.set(D.gotas3D.matrices);
  mallaGotas.instanceMatrix.needsUpdate = true;
  cuerpoG.add(mallaGotas);
  function pintarGotas() {
    const c = new THREE.Color();
    const tipoColor = { gota: pal.gota, lila: pal.lila, bulto: pal.verruga };
    D.gotas3D.lista.forEach((f, i) => mallaGotas.setColorAt(i, c.set(tipoColor[f.tipo])));
    mallaGotas.instanceColor.needsUpdate = true;
  }

  // --- Ojos: cuenca abultada + globo + párpados gruesos ---
  const geoParp = guardar(geoParpado(THREE));
  const geoGlobo = guardar(new THREE.SphereGeometry(R_OJO, 28, 18));
  const geoCuenca = guardar(new THREE.SphereGeometry(1, 24, 14));
  const ojos = [];
  for (const s of [1, -1]) {
    superficieXY(s * OJO_X, OJO_Y, _p, _n);
    const cuenca = new THREE.Mesh(geoCuenca, matPiel);
    cuenca.position.copy(_p).addScaledVector(_n, 0.004);
    cuenca.quaternion.setFromUnitVectors(vADELANTE, _n);
    cuenca.scale.set(0.118, 0.112, 0.06);
    cuerpoG.add(cuenca);
    const grupo = new THREE.Group();
    grupo.position.copy(_p).addScaledVector(_n, 0.03);
    grupo.quaternion.setFromUnitVectors(vADELANTE, _a.set(s * 0.12, 0.1, 1).normalize());
    cuerpoG.add(grupo);
    const globo = new THREE.Mesh(geoGlobo, matOjo);
    grupo.add(globo);
    const pivS = new THREE.Group();
    grupo.add(pivS);
    const parpS = new THREE.Mesh(geoParp, matPiel);
    pivS.add(parpS);
    const pivI = new THREE.Group();
    pivI.rotation.z = Math.PI;
    grupo.add(pivI);
    const parpI = new THREE.Mesh(geoParp, matPiel);
    pivI.add(parpI);
    ojos.push({ s, grupo, globo, pivS, parpS, pivI, parpI, qInv: grupo.quaternion.clone().invert() });
  }

  // --- Boca: labios (tubos que cambian con la expresión), dientes, colmillos y lengua ---
  const LAB_SEG = 26;
  const geoLabioS = guardar(crearTubo(THREE, LAB_SEG, 8, true, true));
  const geoLabioI = guardar(crearTubo(THREE, LAB_SEG, 8, true, true));
  cuerpoG.add(new THREE.Mesh(geoLabioS, matPiel), new THREE.Mesh(geoLabioI, matPiel));
  const ptsLS = Array.from({ length: LAB_SEG + 1 }, () => new V3()), refLS = Array.from({ length: LAB_SEG + 1 }, () => new V3());
  const ptsLI = Array.from({ length: LAB_SEG + 1 }, () => new V3()), refLI = Array.from({ length: LAB_SEG + 1 }, () => new V3());
  const radLS = new Float32Array(LAB_SEG + 1), radLSa = new Float32Array(LAB_SEG + 1);
  const radLI = new Float32Array(LAB_SEG + 1), radLIa = new Float32Array(LAB_SEG + 1);
  const dientes = new THREE.InstancedMesh(guardar(new THREE.CapsuleGeometry(0.5, 0.5, 3, 8)), matHueso, 12);
  dientes.frustumCulled = false;
  cuerpoG.add(dientes);
  // colmillo: diente ancho con la punta redondeada (base en y = 0)
  const geoColmillo = guardar(new THREE.LatheGeometry(
    [[0.5, 0], [0.53, 0.2], [0.5, 0.45], [0.4, 0.7], [0.24, 0.9], [0.09, 0.99], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), 12));
  const colmillos = new THREE.InstancedMesh(geoColmillo, matHueso, 2);
  colmillos.frustumCulled = false;
  cuerpoG.add(colmillos);
  const lengua = new THREE.Mesh(guardar(new THREE.SphereGeometry(1, 18, 10)), matLengua);
  cuerpoG.add(lengua);

  // --- Antena en rulo + brotecito ---
  const antena = new THREE.Group();
  antena.name = 'antena';
  antena.position.set(0, RY - 0.03, -0.01);
  antena.rotation.y = -0.45; // el rulo mira entre el frente y el costado derecho, como en la referencia
  cuerpoG.add(antena);
  const ant = geoAntena(THREE);
  guardar(ant.geo);
  antena.add(new THREE.Mesh(ant.geo, matMiembro));
  antena.add(new THREE.Mesh(guardar(geoBrote(THREE)), matMiembro));

  // --- Brazos (tubos que se rehacen al moverse) con paleta y pinza ---
  const BRAZO_SEG = 22;
  const brazos = [];
  for (const s of [1, -1]) {
    const geo = guardar(crearTubo(THREE, BRAZO_SEG, 10, false, false));
    const hombro = new V3(s * 0.405, -0.03, 0.04);
    geo.boundingSphere = new THREE.Sphere(hombro.clone(), 0.85);
    const malla = new THREE.Mesh(geo, matMiembro);
    malla.name = s > 0 ? 'brazoIzq' : 'brazoDer';
    cuerpoG.add(malla);
    const mano = new THREE.Group();
    cuerpoG.add(mano);
    const gm = geoMano(THREE, s);
    mano.add(new THREE.Mesh(guardar(gm.fija), matMiembro));
    const pivB = new THREE.Group(); // el pulgar (se abre y se cierra)
    pivB.position.set(gm.pivote.x, gm.pivote.y, gm.pivote.z);
    pivB.add(new THREE.Mesh(guardar(gm.pulgar), matMiembro));
    mano.add(pivB);
    brazos.push({
      s, geo, mano, pivB, hombro,
      salida: new V3(s, -0.75, 0.14).normalize(),
      pts: Array.from({ length: BRAZO_SEG + 1 }, () => new V3()),
      ref: new V3(),
    });
  }
  // Ancla del bloque: en la pinza derecha (lado -X), agarrado en la V entre el dedo largo y el pulgar.
  const hand = new THREE.Object3D();
  hand.name = 'mano';
  hand.position.set(0.035, -0.32, 0.03);
  brazos[1].mano.add(hand);
  // brazo: finito en el hombro, se ensancha (y se aplana) hacia la muñeca
  const raiz = (t) => 0.011 * (1 - suave(0, 0.22, t));
  const radBrazoA = (t) => 0.022 + 0.008 * suave(0.45, 1, t) + raiz(t); // espesor (adelante-atrás)
  const radBrazoB = (t) => 0.022 + 0.034 * suave(0.3, 1, t) + raiz(t); // ancho

  // --- Patas (tubos que se rehacen al moverse) y pies con tres garras ---
  const PATA_SEG = 16;
  const PIE_H = 0.097; // altura del tobillo cuando el pie apoya
  const patas = [];
  for (const s of [1, -1]) {
    const geo = guardar(crearTubo(THREE, PATA_SEG, 8, false, false));
    geo.boundingSphere = new THREE.Sphere(new V3(s * 0.14, 0.32, 0), 0.5);
    root.add(new THREE.Mesh(geo, matMiembro));
    const pie = new THREE.Group();
    pie.name = s > 0 ? 'pieIzq' : 'pieDer';
    pie.scale.setScalar(1.12);
    root.add(pie);
    const gp = geoPie(THREE);
    pie.add(new THREE.Mesh(guardar(gp.piel), matMiembro));
    pie.add(new THREE.Mesh(guardar(gp.garras), matHueso));
    patas.push({ s, geo, pie, cadera: new V3(s * 0.13, -0.37, 0.0), pts: Array.from({ length: PATA_SEG + 1 }, () => new V3()) });
  }
  const radPata = (t) => lerp(0.044, 0.032, suave(0, 0.5, t)) + 0.008 * suave(0.75, 1, t);

  // ---------------------------------------------------------------------------
  // Cara: boca y párpados
  // ---------------------------------------------------------------------------
  let expresion = 'normal';
  const cara = { ...EXPR.normal, dS: [...EXPR.normal.dS], dI: [...EXPR.normal.dI] }; // valores actuales
  const ultimaBoca = new Float32Array(24).fill(-1); // para saber si hay que rehacer la boca
  const yArriba = (s) => BOCA_Y + cara.sonrisa * 0.05 * s * s + cara.arco * 0.035 * Math.max(0, 1 - s * s) + cara.torcida * s;
  const yAbajo = (s) => yArriba(s) - cara.abre * Math.pow(Math.max(0, 1 - s * s), cara.redondo);

  function ponerDiente(i, x, yBorde, largo, ancho, haciaAbajo) {
    if (largo < 0.003) {
      dientes.setMatrixAt(i, _m.makeScale(0, 0, 0));
      return;
    }
    const total = largo + 0.01;
    const yc = haciaAbajo ? yBorde + 0.01 - total / 2 : yBorde - 0.01 + total / 2;
    superficieXY(x, yc, _p, _n);
    _p.addScaledVector(_n, -0.016);
    _X.crossVectors(vARRIBA, _n).normalize();
    _Y.crossVectors(_n, _X);
    _m.makeBasis(_X, _Y, _n).scale(_a.set(ancho, total / 1.5, ancho * 0.55));
    _m.setPosition(_p);
    dientes.setMatrixAt(i, _m);
  }

  function construirBoca() {
    // 1) agujero en la piel
    ctxMasc.fillStyle = '#fff';
    ctxMasc.fillRect(0, 0, MASC_PX, MASC_PX);
    if (cara.abre > 0.004) {
      ctxMasc.fillStyle = '#000';
      ctxMasc.beginPath();
      for (let i = 0; i <= 30; i++) {
        const s = -1 + (2 * i) / 30;
        ctxMasc.lineTo(mascX(s * cara.ancho), mascY(yArriba(s) - 0.004));
      }
      for (let i = 30; i >= 0; i--) {
        const s = -1 + (2 * i) / 30;
        ctxMasc.lineTo(mascX(s * cara.ancho), mascY(yAbajo(s) + 0.004));
      }
      ctxMasc.closePath();
      ctxMasc.fill();
    }
    texMasc.needsUpdate = true;
    // 2) labios
    for (let i = 0; i <= LAB_SEG; i++) {
      const s = -1.02 + (2.04 * i) / LAB_SEG;
      const sc = clamp(s, -1, 1);
      const f = Math.sqrt(Math.max(0, 1 - sc * sc));
      const rS = cara.grosor * (0.42 + 0.58 * f);
      superficieXY(s * cara.ancho, yArriba(sc) + rS * 0.25, ptsLS[i], refLS[i]);
      ptsLS[i].addScaledVector(refLS[i], rS * 0.3);
      radLS[i] = rS;
      radLSa[i] = rS * 0.85;
      const rI = cara.grosor * 0.62 * (0.45 + 0.55 * f);
      superficieXY(s * cara.ancho, yAbajo(sc) - rI * 0.15, ptsLI[i], refLI[i]);
      ptsLI[i].addScaledVector(refLI[i], rI * 0.2);
      radLI[i] = rI;
      radLIa[i] = rI * 0.8;
    }
    escribirTubo(geoLabioS, ptsLS, radLSa, radLS, refLS, 0, 1, 0.7).computeBoundingSphere();
    escribirTubo(geoLabioI, ptsLI, radLIa, radLI, refLI, 0, 1, 0.7).computeBoundingSphere();
    // 3) dientes (adentro de la piel: solo se ven por el agujero)
    const anchoD = cara.ancho * 0.25;
    for (let k = 0; k < 6; k++) {
      const s = RANURAS[k], x = s * cara.ancho;
      const hueco = yArriba(s) - yAbajo(s);
      ponerDiente(k, x, yArriba(s), Math.min(cara.dS[k], hueco * 0.62), anchoD, true);
      ponerDiente(k + 6, x, yAbajo(s), Math.min(cara.dI[k], hueco * 0.5), anchoD, false);
    }
    dientes.instanceMatrix.needsUpdate = true;
    // 4) colmillos (afuera, asoman desde las comisuras de abajo)
    for (let k = 0; k < 2; k++) {
      const lado = k === 0 ? -1 : 1;
      const c = Math.sqrt(Math.max(0, cara.colmillo)) * (lado > 0 ? 1 : 0.88);
      if (c < 0.02) {
        _m.makeScale(0, 0, 0);
      } else {
        const s = lado * 0.74;
        superficieXY(s * cara.ancho, yAbajo(s) - 0.012, _p, _n);
        _p.addScaledVector(_n, 0.02);
        _X.crossVectors(vARRIBA, _n).normalize();
        _Y.crossVectors(_n, _X);
        _q.setFromAxisAngle(_n, -lado * 0.18);
        _X.applyQuaternion(_q);
        _Y.applyQuaternion(_q);
        _m.makeBasis(_X, _Y, _n).scale(_a.set(0.056 * c, 0.08 * c, 0.04 * c));
        _m.setPosition(_p);
      }
      colmillos.setMatrixAt(k, _m);
    }
    colmillos.instanceMatrix.needsUpdate = true;
    // 5) lengua
    superficieXY(0, yAbajo(0) + 0.012 + cara.abre * 0.2, _p, _n);
    lengua.position.copy(_p).addScaledVector(_n, -(0.035 + cara.abre * 0.25));
    const lv = cara.lengua * suave(0.01, 0.06, cara.abre);
    lengua.scale.set(Math.max(1e-3, cara.ancho * 0.6 * lv), Math.max(1e-3, (0.02 + cara.abre * 0.25) * lv), Math.max(1e-3, (0.06 + cara.abre * 0.2) * lv));
    lengua.visible = lv > 0.01;
  }
  function bocaCambio() {
    let k = 0, cambio = false;
    const chequear = (v) => {
      if (Math.abs(ultimaBoca[k] - v) > 2e-4) cambio = true;
      ultimaBoca[k++] = v;
    };
    for (const c of ['ancho', 'sonrisa', 'abre', 'arco', 'redondo', 'torcida', 'grosor', 'colmillo', 'lengua']) chequear(cara[c]);
    for (let i = 0; i < 6; i++) {
      chequear(cara.dS[i]);
      chequear(cara.dI[i]);
    }
    return cambio;
  }
  // ángulo de un párpado para que su borde quede a la altura y (en radios)
  const anguloParpado = (y) => Math.asin(clamp(y, -0.99, 0.99)) + Math.sign(y) * Math.max(0, Math.abs(y) - 0.99);

  // ---------------------------------------------------------------------------
  // Estado de animación
  // ---------------------------------------------------------------------------
  let reloj = 0, fase = 0, mov = 0, corre = 0, vuelo = 0;
  let golpeT = 0; // tiempo que le queda al golpe
  let otroGolpe = false; // llegó otro golpe mientras golpeaba
  let tExpr = 99; // segundos desde el último cambio de expresión
  let parpadeoT = 0, proxParpadeo = 1.5, dobleParpadeo = false;
  let mirarX = 0, mirarY = 0, objMirarX = 0, objMirarY = 0, proxMirada = 1;
  let suspiroT = -1, proxSuspiro = 6;
  let pinzaT = -1, proxPinza = 3.5;
  let muecaT = -1, proxMueca = 4;
  let grune = false; // la mueca actual es un gruñido (con dientes)
  const pesoExpr = { normal: 1, feliz: 0, determinado: 0, sorprendido: 0 };
  const animo = { ...ANIMO.normal };
  let antX = 0, antVX = 0, antZ = 0, antVZ = 0, antHechaX = 99, antHechaZ = 99;
  let prevPitch = 0, prevPitchV = 0, prevRoll = 0, prevRollV = 0, prevY = 0, prevYV = 0, primerCuadro = true;
  // nivel de detalle: la distancia a la cámara y si se dibujó hace poco
  // (lo anota la bola al dibujarse); lejos, los tubos se rehacen menos seguido
  let cuadro = 0, distCam = 0, vistoHace = 0, forzarTubos = true;
  const azarAnim = azar(99 + instancias++ * 7919);
  if (instancias > 1) {
    // desfasar los primeros eventos de cada Coco (el primero queda como siempre)
    proxParpadeo += azarAnim() * 2.5;
    proxMirada += azarAnim() * 2;
    proxSuspiro += azarAnim() * 6;
    proxPinza += azarAnim() * 4;
    proxMueca += azarAnim() * 4;
  }
  cuerpo.onBeforeRender = (renderer, scene, camera) => {
    vistoHace = 0;
    const e = camera.matrixWorld.elements, m = cuerpo.matrixWorld.elements;
    distCam = Math.sqrt((e[12] - m[12]) ** 2 + (e[13] - m[13]) ** 2 + (e[14] - m[14]) ** 2);
    const ei = scene && scene.environment ? numero(scene.environmentIntensity, 1) : 1;
    const d = clamp((ei - 0.12) / 0.3);
    if (Math.abs(d - dia) > 0.004) ponerDia(d);
  };

  const _w = new V3(), _up = new V3(), _z = new V3(), _P1 = new V3(), _P2 = new V3();
  // Curva de Bézier cúbica en un arreglo de puntos.
  function bezier(out, p0, p1, p2, p3) {
    const n = out.length - 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out[i].set(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y, a * p0.z + b * p1.z + c * p2.z + d * p3.z);
    }
  }
  // Dobla la antena alrededor de su base: cuanto más arriba, más rota.
  function doblarAntena(ax, az) {
    if (Math.abs(ax - antHechaX) + Math.abs(az - antHechaZ) < 2e-4) return;
    antHechaX = ax;
    antHechaZ = az;
    const pos = ant.geo.attributes.position.array, nor = ant.geo.attributes.normal.array;
    const R = ant.reposo, RN = ant.reposoN, anillo = ANT_RAD + 1;
    const girar = (k, w) => {
      // rotación X (ax·w) y después Z (az·w), como Euler 'XYZ' con y = 0
      const a = Math.cos(ax * w), b = Math.sin(ax * w), e = Math.cos(az * w), f = Math.sin(az * w);
      const af = a * f, ae = a * e, bf = b * f, be = b * e;
      for (let j = 0; j < anillo; j++, k++) {
        const k3 = k * 3;
        let x = R[k3], y = R[k3 + 1], z = R[k3 + 2];
        pos[k3] = e * x - f * y;
        pos[k3 + 1] = af * x + ae * y - b * z;
        pos[k3 + 2] = bf * x + be * y + a * z;
        x = RN[k3]; y = RN[k3 + 1]; z = RN[k3 + 2];
        nor[k3] = e * x - f * y;
        nor[k3 + 1] = af * x + ae * y - b * z;
        nor[k3 + 2] = bf * x + be * y + a * z;
      }
    };
    for (let i = 0; i <= ANT_SEG; i++) girar(i * anillo, ant.pesos[i]);
    // la punta (el polo del final) gira como el último anillo; se agrega aparte
    const k = ant.geo.userData.tubo.poloFin, a = Math.cos(ax), b = Math.sin(ax), e = Math.cos(az), f = Math.sin(az);
    for (const [src, dst] of [[R, pos], [RN, nor]]) {
      const x = src[k * 3], y = src[k * 3 + 1], z = src[k * 3 + 2];
      dst[k * 3] = e * x - f * y;
      dst[k * 3 + 1] = a * f * x + a * e * y - b * z;
      dst[k * 3 + 2] = b * f * x + b * e * y + a * z;
    }
    ant.geo.attributes.position.needsUpdate = true;
    ant.geo.attributes.normal.needsUpdate = true;
    ant.geo.boundingBox = null;
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function setColor(hex) {
    pal = paletaDe(THREE, hex);
    const pin = pinturaDe(pal);
    texPiel.image = pin.cuerpo.piel;
    texPiel.needsUpdate = true;
    texBrillo.image = pin.cuerpo.brillo;
    texBrillo.needsUpdate = true;
    texMiembro.image = pin.miembro.piel;
    texMiembro.needsUpdate = true;
    texMiembroBrillo.image = pin.miembro.brillo;
    texMiembroBrillo.needsUpdate = true;
    pintarGotas();
    matPiel.color.set(pal.piel || pal.base);
    matCuerpo.sheenColor.set(pal.tibio);
    matMiembro.sheenColor.set(pal.tibio);
    ponerDia(dia < 0 ? 1 : dia);
  }

  function setExpression(nombre) {
    const n = EXPR[nombre] ? nombre : 'normal';
    if (n !== expresion) tExpr = 0;
    expresion = n;
  }

  function swing() {
    // Si ya está golpeando, el siguiente espera a que termine este: así la
    // pinza siempre arranca desde abajo y no salta a mitad de camino.
    if (golpeT > 0) otroGolpe = true;
    else golpeT = GOLPE_DUR;
  }

  // Pesos del golpe: alza (levanta la pinza por arriba) → pega (la baja de
  // golpe adelante y al costado, como picando un bloque) → vuelve.
  const G = { alza: 0, pega: 0, arco: 0 };
  function pesosGolpe() {
    G.alza = G.pega = G.arco = 0;
    if (golpeT <= 0) return;
    const u = 1 - golpeT / GOLPE_DUR;
    if (u < 0.34) G.alza = suave(0, 0.34, u);
    else if (u < 0.52) {
      const k = suave(0.34, 0.52, u);
      G.alza = 1 - k;
      G.pega = k;
      G.arco = Math.sin(k * Math.PI);
    } else if (u < 0.74) G.pega = 1;
    else G.pega = 1 - suave(0.74, 1, u);
  }

  function update(dt, estado) {
    estado = estado || {};
    dt = clamp(numero(dt), 0, 0.1);
    const speed = Math.max(0, numero(estado.speed));
    const flying = !!estado.flying;
    reloj = numero(estado.t, reloj + dt);
    const t = reloj;

    // --- nivel de detalle: lejos de la cámara (o si hace rato que no se
    // dibuja), brazos, patas y antena se animan cada 2, 4 u 8 cuadros. Manos,
    // pies y tubos se mueven juntos, así que nunca se despegan.
    cuadro++;
    vistoHace++;
    const paso = vistoHace > 120 ? 8 : distCam > 30 ? 4 : distCam > 15 ? 2 : 1;
    const tubos = forzarTubos || cuadro % paso === 0;
    forzarTubos = false;

    // --- mezclas de estado ---
    mov = amort(mov, clamp(speed / 4.3), 8, dt);
    corre = amort(corre, clamp((speed - 4.5) / 1.1), 6, dt);
    vuelo = amort(vuelo, flying ? 1 : 0, 5, dt);
    const suelo = 1 - vuelo;
    if (speed > 0.05) fase += dt * (1.2 + Math.min(speed, 12) * 0.4) * TAU;
    if (fase > 2000 * Math.PI) fase -= 2000 * Math.PI; // que no crezca para siempre
    const andar = mov * suelo;
    const quieto = (1 - mov) * suelo;
    tExpr += dt;

    // --- golpe ---
    golpeT = Math.max(0, golpeT - dt);
    if (golpeT <= 0 && otroGolpe) {
      golpeT = GOLPE_DUR;
      otroGolpe = false;
    }
    pesosGolpe();
    const esfuerzo = G.pega * 0.15 + G.alza * 0.05;

    // --- eventos de reposo: suspiro, clic de pinzas, mueca ---
    if (quieto > 0.9 && expresion === 'normal') {
      proxSuspiro -= dt;
      if (proxSuspiro < 0 && suspiroT < 0) {
        suspiroT = 0;
        proxSuspiro = 7 + azarAnim() * 6;
      }
    }
    let suspiro = 0;
    if (suspiroT >= 0) {
      suspiroT += dt;
      // inhala (sube) y después exhala con todo el peso
      suspiro = suspiroT < 0.7 ? suave(0, 0.7, suspiroT) : 1 - suave(0.7, 1.9, suspiroT);
      if (suspiroT > 1.9) suspiroT = -1;
    }
    proxPinza -= dt;
    if (proxPinza < 0 && pinzaT < 0 && quieto > 0.5) {
      pinzaT = 0;
      proxPinza = 3 + azarAnim() * 5;
    }
    let clic = 0;
    if (pinzaT >= 0) {
      pinzaT += dt;
      clic = Math.max(0, Math.sin(pinzaT * Math.PI * 4)) * (1 - suave(0.35, 0.5, pinzaT));
      if (pinzaT > 0.5) pinzaT = -1;
    }
    proxMueca -= dt;
    if (proxMueca < 0 && muecaT < 0) {
      muecaT = 0;
      grune = azarAnim() < 0.5; // la mitad de las veces, en vez de torcer la boca, gruñe mostrando los dientes
      proxMueca = 3 + azarAnim() * 5;
    }
    let mueca = 0, mastica = 0;
    if (muecaT >= 0) {
      muecaT += dt;
      mueca = Math.sin(clamp(muecaT / 0.9) * Math.PI);
      mastica = Math.abs(Math.sin(muecaT * Math.PI * 3.3)); // «mmm-mmm»
      if (muecaT > 0.9) muecaT = -1;
    }
    // revoleo de ojos al principio del suspiro («uff…»)
    const revoleo = suspiroT >= 0 ? suave(0, 0.25, suspiroT) * (1 - suave(0.75, 1.15, suspiroT)) : 0;

    // --- pesos de cada expresión (para las poses de cuerpo y brazos) ---
    // Las poses fuertes son una reacción al cambio de cara y después se calman:
    // feliz baila ~2 s y queda con un vaivén; sorprendido levanta los brazos
    // ~1 s y los deja medio abiertos; determinado se pone en guardia (suave).
    for (const k in pesoExpr) pesoExpr[k] = amort(pesoExpr[k], expresion === k ? 1 : 0, 6, dt);
    const ritmo = t * Math.PI * 4; // baile a 2 golpes por segundo
    const baila = pesoExpr.feliz * quieto * lerp(0.22, 1, 1 - suave(1.8, 2.6, tExpr));
    const guardia = pesoExpr.determinado * quieto * 0.6;
    const susto = pesoExpr.sorprendido * lerp(0.45, 1, 1 - suave(0.9, 1.5, tExpr));

    // --- cara: acercar los valores a la expresión elegida ---
    const obj = EXPR[expresion];
    for (const c of CAMPOS) cara[c] = amort(cara[c], obj[c], 12, dt);
    for (const c in animo) animo[c] = amort(animo[c], ANIMO[expresion][c], 4, dt);
    for (let i = 0; i < 6; i++) {
      cara.dS[i] = amort(cara.dS[i], obj.dS[i], 12, dt);
      cara.dI[i] = amort(cara.dI[i], obj.dI[i], 12, dt);
    }
    // mueca del gruñón: tuerce la boca, o la abre apenas mostrando los dientes
    // (se aplica solo para armar la boca; después se restauran los valores)
    const muecaBoca = expresion === 'normal' ? mueca : 0;
    const guardado = [cara.torcida, cara.sonrisa, cara.abre, ...cara.dS, ...cara.dI];
    if (muecaBoca > 0) {
      if (grune) {
        cara.abre += muecaBoca * (0.012 + 0.03 * mastica);
        cara.sonrisa -= muecaBoca * 0.35;
        for (let i = 1; i < 5; i++) {
          cara.dS[i] = Math.max(cara.dS[i], 0.03 * muecaBoca);
          cara.dI[i] = Math.max(cara.dI[i], 0.022 * muecaBoca);
        }
      } else {
        cara.torcida += muecaBoca * 0.02;
        cara.sonrisa -= muecaBoca * 0.25;
      }
    }
    // (lejos, la boca se rehace solo en los cuadros con detalle)
    if ((paso < 4 || tubos) && bocaCambio()) construirBoca();
    [cara.torcida, cara.sonrisa, cara.abre] = guardado;
    for (let i = 0; i < 6; i++) {
      cara.dS[i] = guardado[3 + i];
      cara.dI[i] = guardado[9 + i];
    }

    // --- parpadeo ---
    proxParpadeo -= dt;
    if (proxParpadeo < 0 && parpadeoT <= 0) {
      parpadeoT = 0.001;
      if (dobleParpadeo) {
        dobleParpadeo = false;
        proxParpadeo = 1.8 + azarAnim() * 3.2;
      } else {
        dobleParpadeo = azarAnim() < 0.22;
        proxParpadeo = dobleParpadeo ? 0.22 : 1.8 + azarAnim() * 3.2;
      }
    }
    let cierre = 0;
    if (parpadeoT > 0) {
      parpadeoT += dt;
      cierre = Math.sin(clamp(parpadeoT / 0.15) * Math.PI);
      if (parpadeoT > 0.15) parpadeoT = 0;
    }
    // --- mirada ---
    proxMirada -= dt;
    if (proxMirada < 0) {
      proxMirada = 0.8 + azarAnim() * 2.6;
      const inquieto = expresion === 'sorprendido' ? 0.6 : 1;
      objMirarX = (azarAnim() - 0.5) * 0.5 * inquieto * (1 - mov * 0.7);
      objMirarY = (azarAnim() - 0.5) * 0.22;
    }
    mirarX = amort(mirarX, objMirarX * (1 - revoleo) + revoleo * 0.14 * Math.sin(suspiroT * 5), 25, dt);
    mirarY = amort(mirarY, objMirarY * (1 - mov * 0.5) * (1 - revoleo) + cara.mirarY - G.pega * 0.15 + revoleo * 0.36, 25, dt);
    for (const o of ojos) {
      _z.set(mirarX, mirarY, 1).normalize();
      _q.setFromUnitVectors(vADELANTE, _z);
      o.globo.quaternion.copy(o.qInv).multiply(_q);
      const pesado = suspiro > 0 ? (suspiroT > 0.7 ? suspiro * 0.25 : -suspiro * 0.15) : 0;
      let yS = cara.parpS - pesado - esfuerzo + revoleo * 0.1;
      let yI = cara.parpI + esfuerzo * 0.6;
      yS = lerp(yS, -0.22, cierre);
      yI = lerp(yI, -0.3, cierre);
      o.parpS.rotation.x = -anguloParpado(yS);
      o.parpI.rotation.x = anguloParpado(yI);
      o.pivS.rotation.z = cara.ceno * o.s;
      o.pivI.rotation.z = Math.PI - cara.ceno * 0.3 * o.s;
    }

    // --- cuerpo ---
    const c2 = Math.cos(2 * fase), s1 = Math.sin(fase);
    const resp = Math.sin(t * 2.0);
    let y = CENTRO_Y + resp * 0.006 * quieto + suspiro * 0.02;
    y += andar * ((0.035 + 0.04 * corre) * animo.rebote * (0.5 + 0.5 * c2) - 0.02);
    const flota = Math.sin(t * 2.6);
    y += vuelo * (0.08 + flota * 0.03);
    let pitch = andar * (0.06 + 0.12 * corre + 0.025 * c2 + animo.inclina) + vuelo * (0.1 + 0.12 * clamp(speed / 5));
    let roll = andar * 0.075 * s1 + quieto * 0.022 * Math.sin(t * 0.7) + vuelo * 0.05 * Math.sin(t * 1.3);
    let yaw = andar * 0.07 * s1;
    pitch += G.pega * 0.1 - G.alza * 0.05 - suspiro * 0.03;
    yaw += G.pega * 0.06 - G.alza * 0.08;
    // feliz y quieto: baila en el lugar (rebota y se hamaca)
    const golpeBaile = 0.5 + 0.5 * Math.cos(ritmo);
    y += baila * 0.028 * golpeBaile;
    roll += baila * 0.07 * Math.sin(ritmo / 2);
    yaw += baila * 0.1 * Math.sin(ritmo / 2);
    // determinado y quieto: en guardia, agachadito e inclinado
    y -= guardia * 0.02;
    pitch += guardia * 0.07;
    // sorprendido: se estira y tiembla un poquito
    roll += susto * 0.02 * Math.sin(t * 23);
    const estira = quieto * resp * 0.014 + andar * 0.032 * animo.rebote * c2 + suspiro * 0.03 - G.pega * 0.03 + vuelo * flota * 0.015 +
      baila * 0.035 * (golpeBaile - 0.5) - guardia * 0.025 + susto * 0.035;
    cuerpoG.position.set(0, y, 0);
    cuerpoG.rotation.set(pitch, yaw, roll, 'YXZ');
    cuerpoG.scale.set(1 - estira * 0.5, 1 + estira, 1 - estira * 0.5);
    cuerpoG.updateMatrix();

    // --- antena: resorte que reacciona a los movimientos de la bola ---
    if (primerCuadro) {
      prevPitch = pitch;
      prevRoll = roll;
      prevY = y;
      primerCuadro = false;
    }
    if (dt > 0) {
      const vP = (pitch - prevPitch) / dt, vR = (roll - prevRoll) / dt, vY = (y - prevY) / dt;
      const aP = clamp((vP - prevPitchV) / dt, -60, 60), aR = clamp((vR - prevRollV) / dt, -60, 60), aY = clamp((vY - prevYV) / dt, -60, 60);
      prevPitch = pitch;
      prevRoll = roll;
      prevY = y;
      prevPitchV = vP;
      prevRollV = vR;
      prevYV = vY;
      const objX = -0.12 * andar - 0.12 * corre * suelo - 0.3 * vuelo * clamp(speed / 4) + 0.05 * Math.sin(t * 1.3) * quieto - suspiro * 0.15;
      const objZ = 0.05 * Math.sin(t * 0.9 + 1) * quieto;
      const K = 140, C = 7;
      antVX += (K * (objX - antX) - C * antVX - aP * 0.9 - aY * 0.25) * dt;
      antVZ += (K * (objZ - antZ) - C * antVZ - aR * 0.9) * dt;
      antX = clamp(antX + antVX * dt, -0.9, 0.9);
      antZ = clamp(antZ + antVZ * dt, -0.9, 0.9);
    }
    if (tubos) doblarAntena(antX, antZ);
    if (!tubos) return;

    // --- brazos ---
    for (const b of brazos) {
      const s = b.s;
      const sw = Math.sin(fase + (s > 0 ? 0 : Math.PI));
      // reposo: cuelgan a los costados, con la pinza apenas hacia adentro
      _w.set(s * 0.6, -0.27 + resp * 0.006 * quieto, 0.03);
      let rx = 0, rz = -s * 0.05;
      _w.x += s * 0.012 * Math.sin(t * 1.1 + s) * quieto;
      _w.y += suspiro * 0.03;
      // caminar / correr: se hamacan al revés que las patas
      const amp = (0.15 + 0.1 * corre) * animo.brazos;
      _w.z += -amp * sw * andar;
      _w.y += andar * (0.03 * Math.max(0, -sw) + 0.11 * corre);
      _w.x -= s * andar * 0.04 * corre;
      rx += andar * (0.45 * sw - 0.2 * corre);
      rz += s * andar * 0.1 * corre;
      // volar: brazos abiertos para arriba, aleteando
      const aleteo = Math.sin(t * 4.5 + (s > 0 ? 0 : 0.4));
      _w.lerp(_a.set(s * 0.6, 0.14 + aleteo * 0.05, -0.02), vuelo);
      rz = lerp(rz, s * (2.0 + aleteo * 0.25), vuelo);
      rx = lerp(rx, -0.2, vuelo);
      const fs = s > 0 ? 0 : Math.PI;
      // feliz: los brazos bailan alternados
      _w.y += baila * 0.08 * Math.sin(ritmo / 2 + fs);
      _w.z += baila * 0.05 * Math.cos(ritmo / 2 + fs);
      rz += baila * s * 0.25 * (0.5 + 0.5 * Math.sin(ritmo / 2 + fs));
      // determinado: pinzas en guardia, un poco adelante
      _w.y += guardia * 0.1;
      _w.z += guardia * 0.14;
      _w.x -= guardia * s * 0.06;
      rx -= guardia * 0.7;
      // sorprendido: brazos arriba (o medio abiertos), agitándose
      const agita = Math.sin(t * 13 + s * 1.3);
      _w.lerp(_a.set(s * 0.56, 0.17 + agita * 0.045, 0.05), susto);
      rz = lerp(rz, s * (2.3 + agita * 0.22), susto);
      rx = lerp(rx, -0.25, susto);
      let abre = 0.1 + clic * 0.45 + vuelo * 0.25 + susto * 0.45 + guardia * (0.2 + 0.2 * Math.sin(t * 7 + s));
      // golpe con la pinza derecha (lado -X): la levanta por arriba y pica
      // adelante y al costado (así el bloque se ve también desde atrás)
      if (s < 0 && (G.alza > 0 || G.pega > 0)) {
        const r = 1 - G.alza - G.pega;
        _w.set(
          _w.x * r + s * 0.5 * G.alza + s * 0.56 * G.pega,
          _w.y * r + 0.2 * G.alza + 0.14 * G.pega + 0.06 * G.arco,
          _w.z * r - 0.02 * G.alza + 0.3 * G.pega,
        );
        rx = rx * r - 2.5 * G.alza - 1.25 * G.pega;
        rz = rz * r + s * 0.2 * G.alza + s * 0.3 * G.pega;
        abre = abre * r + 0.75 * G.alza - 0.15 * G.pega;
      } else if (s > 0) {
        _w.z -= G.pega * 0.06; // el otro brazo acompaña para atrás
      }
      b.mano.position.copy(_w);
      b.mano.rotation.set(rx, 0, rz);
      b.mano.updateMatrix();
      b.pivB.rotation.z = -s * abre;
      // tubo del brazo: del hombro a la muñeca
      _up.set(0, 1, 0).applyQuaternion(b.mano.quaternion);
      b.ref.set(0, 0, 1).applyQuaternion(b.mano.quaternion);
      _P1.copy(b.hombro).addScaledVector(b.salida, 0.17);
      _P2.copy(_w).addScaledVector(_up, 0.15);
      bezier(b.pts, b.hombro, _P1, _P2, _w);
      escribirTubo(b.geo, b.pts, radBrazoA, radBrazoB, b.ref, 0, 0.5);
    }

    // --- patas y pies ---
    for (const p of patas) {
      const s = p.s;
      const ph = fase + (s > 0 ? 0 : Math.PI);
      const sw = Math.sin(ph), cw = Math.cos(ph);
      const zancada = 0.15 + 0.07 * corre;
      const alza = Math.pow(Math.max(0, cw), 1.2) * (0.08 + 0.06 * corre);
      _a.set(s * 0.155, PIE_H, 0.0);
      _a.z += zancada * sw * andar;
      _a.y += alza * andar;
      let fx = -0.5 * sw * Math.sqrt(Math.max(0, cw)) * andar;
      let fy = s * 0.22;
      // feliz: zapatea al ritmo
      const zapateo = Math.max(0, Math.sin(ritmo / 2 + (s > 0 ? 0 : Math.PI)));
      _a.y += baila * 0.025 * zapateo;
      fx -= baila * 0.3 * zapateo;
      // volar: los pies cuelgan con las garras para abajo y pedalean
      const pedaleo = Math.sin(t * 3 + (s > 0 ? 0 : Math.PI));
      _a.lerp(_b.set(s * 0.13, PIE_H + 0.03 + pedaleo * 0.025, -0.07 + pedaleo * 0.04), vuelo);
      fx = lerp(fx, 0.75 + pedaleo * 0.15, vuelo);
      fy = lerp(fy, s * 0.12, vuelo);
      // si el pie se inclina, el tobillo sube lo justo para que la punta
      // (o el talón) no se entierre
      _a.y += (fx > 0 ? Math.sin(fx) * 0.2 : Math.sin(-fx) * 0.12) * suelo;
      p.pie.position.copy(_a);
      p.pie.rotation.set(fx, fy, 0, 'YXZ');
      p.pie.updateMatrix();
      // tubo de la pata: de la cadera (en la bola) al tobillo
      _c.copy(p.cadera).applyMatrix4(cuerpoG.matrix);
      _up.set(0, 1, 0).applyQuaternion(p.pie.quaternion);
      _P1.copy(_c).add(_b.set(s * 0.01, -0.1, 0.03));
      _P2.copy(_a).addScaledVector(_up, 0.1);
      bezier(p.pts, _c, _P1, _P2, _a);
      escribirTubo(p.geo, p.pts, radPata, radPata, COSTADO, 0, 0.38);
    }
  }

  function dispose() {
    root.removeFromParent();
    mallaGotas.dispose();
    dientes.dispose();
    colmillos.dispose();
    for (const x of basura) x.dispose?.();
    basura.length = 0;
  }

  // Estado inicial
  setColor(color);
  construirBoca();
  update(0, { speed: 0, t: 0 });

  return { root, hand, update, setColor, swing, setExpression, dispose };
}
