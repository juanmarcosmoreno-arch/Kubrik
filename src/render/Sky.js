// Cielo e iluminación.
//
// Etapa 1: cielo celeste fijo, luz ambiente y una luz direccional (el sol).
// En la etapa 2 se suma la niebla y en la etapa 6 el ciclo día/noche, que va
// a variar estos mismos colores e intensidades con la hora del día.

import * as THREE from 'three';

export const SKY_COLOR = 0x8ccdf2;

export class Sky {
  /**
   * @param {THREE.Scene} scene escena del juego
   */
  constructor(scene) {
    this.scene = scene;
    this.skyColor = new THREE.Color(SKY_COLOR);
    scene.background = this.skyColor;

    // Luz ambiente: ilumina todo por igual para que las caras en sombra no
    // queden negras.
    this.ambient = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(this.ambient);

    // Luz direccional (sol): da volumen, cada cara del cubo recibe un brillo
    // distinto según su orientación.
    this.sun = new THREE.DirectionalLight(0xfff3dc, 1.9);
    this.sunDirection = new THREE.Vector3(0.45, 1, 0.3).normalize();
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /**
   * Actualiza el cielo. La luz direccional sigue al jugador para que, cuando
   * haya sombras o el sol se mueva, siempre apunte a la zona visible.
   * @param {number} _dt segundos desde el último frame (para el ciclo día/noche)
   * @param {THREE.Vector3} center posición del jugador
   */
  update(_dt, center) {
    this.sun.position.copy(center).addScaledVector(this.sunDirection, 100);
    this.sun.target.position.copy(center);
  }
}
