// Materiales compartidos por todas las mallas de bloques (uno por capa).

import * as THREE from 'three';
import { LAYER } from '../world/blocks.js';

/** Reemplaza el cálculo de niebla del shader por la distancia a la cámara. */
function radialFog(shader) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <fog_vertex>',
    '#ifdef USE_FOG\n\tvFogDepth = length( mvPosition.xyz );\n#endif',
  );
}

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

  // Niebla radial: Three.js calcula la niebla con la profundidad (distancia
  // al plano de la cámara), así que en los costados de la pantalla lo lejano
  // queda con menos niebla y se ve el borde del mundo. Con la distancia real
  // la niebla es pareja en todas las direcciones.
  for (const m of [opaque, cutout, translucent]) m.onBeforeCompile = radialFog;

  const materials = [];
  materials[LAYER.OPAQUE] = opaque;
  materials[LAYER.CUTOUT] = cutout;
  materials[LAYER.TRANSLUCENT] = translucent;
  return materials;
}
