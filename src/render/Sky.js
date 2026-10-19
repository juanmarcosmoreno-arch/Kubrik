// Cielo e iluminación.
//
// Cielo celeste, luz ambiente, una luz direccional (el sol) y niebla del
// mismo color del cielo que oculta el borde del mundo cargado. En la etapa 6
// el ciclo día/noche va a variar estos colores e intensidades con la hora.

import * as THREE from 'three';

export const SKY_COLOR = 0x8ccdf2;
/** Color del agua vista desde adentro. */
const UNDERWATER_COLOR = 0x2c5f94;

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

    // Niebla lineal: empieza a notarse a mitad de camino y tapa todo justo
    // antes del borde del área cargada.
    this.fog = new THREE.Fog(this.skyColor.clone(), 20, 100);
    scene.fog = this.fog;
    this.underwater = false;
    this._fogRange = { near: 20, far: 100 };
  }

  /**
   * Ajusta la niebla para que tape todo justo antes del borde del área
   * cargada.
   * @param {number} edgeDistance distancia (bloques) al borde más cercano
   */
  setViewDistance(edgeDistance) {
    this._fogRange.far = Math.max(8, edgeDistance - 2);
    this._fogRange.near = this._fogRange.far * 0.45;
    this._applyFog();
  }

  /** Cambia entre la niebla normal y la de "bajo el agua" (azul y cercana). */
  setUnderwater(on) {
    if (on === this.underwater) return;
    this.underwater = on;
    this._applyFog();
  }

  _applyFog() {
    if (this.underwater) {
      this.fog.color.setHex(UNDERWATER_COLOR);
      this.fog.near = 1;
      this.fog.far = Math.min(20, this._fogRange.far);
      this.scene.background = this.fog.color;
    } else {
      this.fog.color.copy(this.skyColor);
      this.fog.near = this._fogRange.near;
      this.fog.far = this._fogRange.far;
      this.scene.background = this.skyColor;
    }
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
