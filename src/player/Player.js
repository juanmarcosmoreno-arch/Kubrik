// Jugador: posición, orientación y movimiento.
//
// Etapa 1: modo vuelo provisorio (sin gravedad). WASD mueve en horizontal,
// Espacio sube y Shift baja. Solo se evita meterse adentro de bloques
// sólidos empujando hacia arriba; las colisiones AABB completas, la gravedad
// y el salto llegan en la etapa 3.

import * as THREE from 'three';

const HALF_PI = Math.PI / 2 - 0.001;

export class Player {
  /**
   * @param {THREE.PerspectiveCamera} camera cámara en primera persona
   */
  constructor(camera) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ'; // primero giro horizontal, después vertical

    this.position = new THREE.Vector3(); // posición de los pies
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // giro horizontal (radianes)
    this.pitch = 0; // giro vertical (radianes)

    // Medidas del jugador (en bloques). Se usan en la etapa 3 para la AABB.
    this.height = 1.8;
    this.width = 0.6;
    this.eyeHeight = 1.62;

    this.flying = true;
    this.flySpeed = 10; // bloques por segundo
    this.acceleration = 12; // qué tan rápido alcanza la velocidad deseada

    this._wish = new THREE.Vector3();
  }

  /** Coloca al jugador en una posición (pies) mirando hacia yaw/pitch. */
  spawn(x, y, z, yaw = 0, pitch = 0) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.syncCamera();
  }

  /**
   * Actualiza el jugador.
   * @param {number} dt segundos desde el último frame
   * @param {import('./Controls.js').Controls} controls
   * @param {import('../world/World.js').World} world
   */
  update(dt, controls, world) {
    // --- Mirar con el mouse ---
    const { dx, dy } = controls.consumeMouse();
    this.yaw -= dx * controls.sensitivity;
    this.pitch -= dy * controls.sensitivity;
    this.pitch = Math.max(-HALF_PI, Math.min(HALF_PI, this.pitch));

    // --- Dirección deseada según WASD (relativa a hacia dónde mira) ---
    const forward = (controls.isDown('KeyW') ? 1 : 0) - (controls.isDown('KeyS') ? 1 : 0);
    const strafe = (controls.isDown('KeyD') ? 1 : 0) - (controls.isDown('KeyA') ? 1 : 0);
    const vertical =
      (controls.isDown('Space') ? 1 : 0) -
      (controls.isDown('ShiftLeft') || controls.isDown('ShiftRight') ? 1 : 0);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Adelante = -Z rotado por yaw; derecha = +X rotado por yaw.
    this._wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (this._wish.lengthSq() > 1) this._wish.normalize();
    this._wish.multiplyScalar(this.flySpeed);
    this._wish.y = vertical * this.flySpeed;

    // Aceleración suave hacia la velocidad deseada (independiente de los FPS).
    const k = 1 - Math.exp(-this.acceleration * dt);
    this.velocity.lerp(this._wish, k);

    this.position.addScaledVector(this.velocity, dt);
    this._resolveGround(world);
    this.syncCamera();
  }

  /**
   * Colisión mínima provisoria: si los pies quedaron dentro de un bloque
   * sólido, subir al jugador encima de ese bloque.
   */
  _resolveGround(world) {
    const bx = Math.floor(this.position.x);
    const by = Math.floor(this.position.y);
    const bz = Math.floor(this.position.z);
    if (world.isSolid(bx, by, bz)) {
      this.position.y = by + 1;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  /** Ubica la cámara en los ojos del jugador. */
  syncCamera() {
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
