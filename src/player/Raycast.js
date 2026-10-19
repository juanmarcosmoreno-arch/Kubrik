// Detección del bloque apuntado: recorrido de vóxeles con el algoritmo DDA
// (Amanatides y Woo). Avanza de bloque en bloque a lo largo del rayo, sin
// saltearse ninguno, hasta encontrar uno que se pueda apuntar o pasarse del
// alcance.

/**
 * @param {{getBlock: (x: number, y: number, z: number) => number}} world
 * @param {{x: number, y: number, z: number}} origin punto de partida (ojos)
 * @param {{x: number, y: number, z: number}} dir dirección (normalizada)
 * @param {number} maxDistance alcance en bloques
 * @param {(id: number) => boolean} isTarget qué bloques detienen el rayo
 * @returns {null | {x: number, y: number, z: number, id: number,
 *   normal: [number, number, number], place: [number, number, number],
 *   distance: number}} el bloque apuntado, la cara por la que entró el rayo
 *   (normal) y dónde iría un bloque nuevo (place). normal es [0, 0, 0] si el
 *   origen ya está dentro de un bloque apuntable.
 */
export function raycast(world, origin, dir, maxDistance, isTarget) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);
  // Cuánto avanza t para cruzar un bloque entero en cada eje.
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
  // Valor de t en el que se cruza el próximo borde de bloque en cada eje.
  let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  while (t <= maxDistance) {
    const id = world.getBlock(x, y, z);
    if (isTarget(id)) {
      return {
        x,
        y,
        z,
        id,
        normal: [nx, ny, nz],
        place: [x + nx, y + ny, z + nz],
        distance: t,
      };
    }
    // Avanzar al bloque vecino por el borde más cercano.
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
