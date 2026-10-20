// Colores y expresiones de Coco, el personaje. Son los mismos en el juego,
// en la pantalla de inicio y en el multijugador (se mandan por la red como
// clave: 'violeta', 'verde', ...).

/**
 * Colores del personaje.
 * - color: el que recibe Coco (coco.js tiene una paleta afinada para cada uno).
 * - swatch: cómo se ve en los botones de color y en la lista de jugadores.
 */
export const VARIANTS = Object.freeze({
  violeta: { name: 'Violeta', color: '#8a4fd6', swatch: '#a11cb8' },
  verde: { name: 'Verde', color: '#3fae2a', swatch: '#2fa52c' },
  azul: { name: 'Azul', color: '#2f7fe0', swatch: '#2c68e6' },
  rojo: { name: 'Rojo', color: '#da3a30', swatch: '#cf2440' },
  amarillo: { name: 'Amarillo', color: '#f2b51c', swatch: '#f4b81c' },
  negro: { name: 'Negro', color: '#2e2f33', swatch: '#2b2836' },
});

/** El violeta es el Coco original. */
export const DEFAULT_VARIANT = 'violeta';

/** ¿Es una clave de color válida? (sin aceptar claves heredadas). */
export function isVariant(key) {
  return typeof key === 'string' && Object.hasOwn(VARIANTS, key);
}

/** Expresiones de la cara (el parpadeo se suma solo). */
export const EXPRESSIONS = Object.freeze(['normal', 'feliz', 'sorprendido', 'determinado']);
