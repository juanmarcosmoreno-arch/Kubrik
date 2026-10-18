// HUD: información superpuesta al juego (FPS por ahora).
// En próximas etapas se suman la mira, la hotbar y las coordenadas (F3).

export class Hud {
  /**
   * @param {HTMLElement} root contenedor del HUD (#hud)
   */
  constructor(root) {
    this.root = root;

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'hud-fps';
    this.fpsEl.textContent = '-- FPS';
    root.appendChild(this.fpsEl);

    // Contador de FPS: cuenta frames y actualiza el texto cada medio segundo.
    this._frames = 0;
    this._elapsed = 0;
    this.fps = 0;
  }

  /** Muestra u oculta el HUD completo. */
  setVisible(visible) {
    this.root.hidden = !visible;
  }

  /**
   * Se llama una vez por frame.
   * @param {number} dt segundos reales desde el frame anterior
   */
  update(dt) {
    // Tras una pausa larga del loop (pestaña en segundo plano) el primer
    // frame trae un dt enorme que falsearía la medición: se descarta.
    if (dt > 0.25) {
      this._frames = 0;
      this._elapsed = 0;
      return;
    }
    this._frames++;
    this._elapsed += dt;
    if (this._elapsed >= 0.5) {
      this.fps = Math.round(this._frames / this._elapsed);
      this.fpsEl.textContent = `${this.fps} FPS`;
      this._frames = 0;
      this._elapsed = 0;
    }
  }
}
