// Materiales compartidos por todas las mallas de bloques (uno por capa).

import * as THREE from 'three';
import { LAYER } from '../world/blocks.js';

/**
 * Crea los materiales de las tres capas de render a partir del atlas.
 * Se devuelven en un array indexado por LAYER.
 */
export function createBlockMaterials(atlasTexture) {
  const opaque = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    vertexColors: true,
  });

  // Hojas y vidrio: píxeles totalmente transparentes se descartan (alphaTest),
  // así no hace falta ordenar por profundidad.
  const cutout = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    vertexColors: true,
    alphaTest: 0.5,
  });

  // Agua: semitransparente, visible también desde abajo, sin escribir
  // profundidad para que se vea lo que hay detrás.
  const translucent = new THREE.MeshLambertMaterial({
    map: atlasTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const materials = [];
  materials[LAYER.OPAQUE] = opaque;
  materials[LAYER.CUTOUT] = cutout;
  materials[LAYER.TRANSLUCENT] = translucent;
  return materials;
}
