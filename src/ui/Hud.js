// HUD: información superpuesta al juego (mira, FPS, avisos cortos y, con
// F3, coordenadas y datos del mundo). La hotbar tiene su propio módulo
// (ui/Hotbar.js) y se agrega a este mismo contenedor.

export class Hud {
  /**
   * @param {HTMLElement} root contenedor del HUD (#hud)
   */
  constructor(root) {
    this.root = root;

    // Mira en el centro de la pantalla.
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    root.appendChild(this.crosshair);

    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'hud-fps';
    this.fpsEl.textContent = '-- FPS';
    root.appendChild(this.fpsEl);

    // Datos de depuración (F3): coordenadas, chunk, hacia dónde se mira, hora...
    this.debugEl = document.createElement('div');
    this.debugEl.className = 'hud-debug';
    this.debugEl.hidden = true;
    root.appendChild(this.debugEl);

    // Aviso corto en el centro (por ejemplo, al cambiar de cámara).
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'hud-toast';
    root.appendChild(this.toastEl);
    this._toastTimer = 0;

    // Contador de FPS: cuenta frames y actualiza el texto cada medio segundo.
    this._frames = 0;
    this._elapsed = 0;
    this.fps = 0;
  }

  /** ¿Se ven los datos de F3? */
  get debugVisible() {
    return !this.debugEl.hidden;
  }

  /** Muestra u oculta los datos de F3. */
  toggleDebug() {
    this.debugEl.hidden = !this.debugEl.hidden;
  }

  /** Texto de los datos de F3 (una línea por renglón). */
  setDebug(lines) {
    const text = lines.join('\n');
    if (this.debugEl.textContent !== text) this.debugEl.textContent = text;
  }

  /** Muestra u oculta el HUD completo. */
  setVisible(visible) {
    this.root.hidden = !visible;
  }

  /** Muestra un aviso por un momento. */
  toast(text, seconds = 1.4) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    this._toastTimer = seconds;
  }

  /**
   * Se llama una vez por frame.
   * @param {number} dt segundos reales desde el frame anterior
   */
  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= Math.min(dt, 0.1);
      if (this._toastTimer <= 0) this.toastEl.classList.remove('visible');
    }
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
