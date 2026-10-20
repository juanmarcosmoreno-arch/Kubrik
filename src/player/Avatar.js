// Personaje del jugador: Coco (coco.js) adaptado a lo que necesita el juego.
//
// Coco se arma mirando hacia +Z; el juego mira hacia -Z con yaw = 0, así que
// se lo gira media vuelta dentro de la raíz. La raíz va en los pies del
// jugador y gira con el cuerpo, que sigue a la mirada con suavidad.

import * as THREE from 'three';
import { createCharacter } from './coco.js';
import { DEFAULT_VARIANT, EXPRESSIONS, VARIANTS, isVariant } from './colors.js';

/** Tamaño del bloque en la mano (en bloques). */
const HELD_BLOCK_SIZE = 0.25;
/** Cuánto puede quedar el cuerpo girado respecto de la mirada (radianes). */
const MAX_BODY_TWIST = 0.5;

/** Diferencia de ángulos en (-PI, PI]. */
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export class Avatar {
  /**
   * @param {string} [variant] clave de VARIANTS (violeta, verde, azul, ...)
   */
  constructor(variant = DEFAULT_VARIANT) {
    this.variant = isVariant(variant) ? variant : DEFAULT_VARIANT;
    this.coco = createCharacter(THREE, { color: VARIANTS[this.variant].color });
    this.coco.root.rotation.y = Math.PI; // de +Z (Coco) a -Z (el juego)

    // Raíz en los pies.
    this.root = new THREE.Group();
    this.root.name = 'personaje';
    this.root.add(this.coco.root);

    this.bodyYaw = 0;
    this.time = 0;
    this.baseExpression = 'normal';
    this.heldBlock = null; // malla del bloque en la pinza
  }

  /**
   * Pone un bloque en la pinza derecha (o lo saca con geometry = null).
   * @param {THREE.BufferGeometry | null} geometry geometría del bloque (1x1x1)
   * @param {THREE.Material[]} [materials] materiales de bloques por capa
   */
  setHeldBlock(geometry, materials) {
    if (!geometry) {
      if (this.heldBlock) this.heldBlock.visible = false;
      return;
    }
    if (!this.heldBlock) {
      this.heldBlock = new THREE.Mesh(geometry, materials);
      this.heldBlock.scale.setScalar(HELD_BLOCK_SIZE);
      this.heldBlock.rotation.y = Math.PI / 4;
      this.coco.hand.add(this.heldBlock);
    }
    this.heldBlock.geometry = geometry;
    this.heldBlock.visible = true;
  }

  /** Golpe con la pinza al romper o poner un bloque. */
  swing() {
    this.coco.swing();
  }

  /** Cambia el color de Coco (el degradé cálido y las manchas se ajustan solos). */
  setVariant(variant) {
    if (!isVariant(variant) || variant === this.variant) return;
    this.variant = variant;
    this.coco.setColor(VARIANTS[variant].color);
  }

  /** Cambia la expresión (normal, feliz, sorprendido, determinado). */
  setExpression(name) {
    if (!EXPRESSIONS.includes(name) || name === this.baseExpression) return;
    this.baseExpression = name;
    this.coco.setExpression(name);
  }

  /**
   * Avanza la animación.
   * @param {number} dt segundos (0 en pausa: queda quieto)
   * @param {object} s estado del jugador
   * @param {number} s.yaw hacia dónde mira (radianes)
   * @param {number} [s.pitch] inclinación de la mirada (Coco no tiene cuello: no se usa)
   * @param {number} s.speed velocidad horizontal (bloques/s)
   * @param {boolean} [s.flying] si está volando (en el aire)
   */
  update(dt, { yaw, speed, flying = false }) {
    this.time += dt;
    // El cuerpo es la cabeza: sigue a la mirada enseguida al moverse y con
    // calma estando quieto, sin quedar nunca muy torcido.
    const follow = speed > 0.3 ? 12 : 5;
    this.bodyYaw += angleDiff(yaw, this.bodyYaw) * (1 - Math.exp(-follow * dt));
    const twist = angleDiff(yaw, this.bodyYaw);
    if (Math.abs(twist) > MAX_BODY_TWIST) this.bodyYaw = yaw - Math.sign(twist) * MAX_BODY_TWIST;
    this.root.rotation.y = this.bodyYaw;
    this.coco.update(dt, { speed, flying, t: this.time });
  }

  /** Libera geometrías, materiales y texturas (el bloque en la mano es compartido). */
  dispose() {
    if (this.heldBlock) this.heldBlock.removeFromParent();
    this.coco.dispose();
  }
}
