// Colores del cielo compartidos entre la cúpula (Sky.js) y la niebla de los
// bloques (materials.js). Con el mismo cálculo en los dos lados, lo lejano se
// funde con el pedazo de cielo que tiene detrás, en cualquier dirección (si
// no, las montañas en la niebla se recortan como siluetas contra el degradé).

import * as THREE from 'three';

/** Uniforms compartidos: los actualiza Sky y los leen la cúpula y los bloques. */
export const skyUniforms = {
  skyTop: { value: new THREE.Color() },
  skyHorizon: { value: new THREE.Color() },
  skyGlow: { value: new THREE.Color() },
  skySunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** 1: la niebla toma el color del cielo; 0: el color de niebla común (bajo el agua). */
  skyFog: { value: 1 },
};

/** GLSL: color del cielo (en espacio lineal) en la dirección `d` (normalizada). */
export const SKY_COLOR_GLSL = /* glsl */ `
  uniform vec3 skyTop;
  uniform vec3 skyHorizon;
  uniform vec3 skyGlow;
  uniform vec3 skySunDir;
  vec3 skyColorAt(vec3 d) {
    vec3 color = mix(skyHorizon, skyTop, smoothstep(0.0, 0.6, d.y));
    // Resplandor alrededor del sol (fuerte al amanecer y al atardecer).
    float s = max(dot(d, skySunDir), 0.0);
    color += skyGlow * (pow(s, 6.0) * 0.35 + pow(s, 40.0) * 0.35) * smoothstep(-0.35, 0.05, d.y);
    return color;
  }
`;
