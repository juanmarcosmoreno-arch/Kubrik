// Entrada del jugador: teclado, mouse y pointer lock.
//
// Se usan los códigos físicos de tecla (event.code: "KeyW", "Space", etc.)
// para que WASD funcione igual en cualquier distribución de teclado.

export class Controls {
  /**
   * @param {HTMLElement} element elemento que captura el mouse (el canvas)
   */
  constructor(element) {
    this.element = element;
    this.keys = new Set(); // teclas apretadas ahora
    this.justPressed = new Set(); // teclas que se apretaron en este frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.sensitivity = 0.0022; // radianes por píxel de movimiento del mouse

    /** Callback cuando se captura o se suelta el mouse: (locked) => void. */
    this.onLockChange = null;
    /** Callback cuando falla capturar el mouse (por ejemplo, demasiado rápido tras Esc). */
    this.onLockError = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);
    this._onBlur = this._onBlur.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    element.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    window.addEventListener('blur', this._onBlur);
  }

  /** Captura el mouse. Debe llamarse desde un evento del usuario (clic). */
  lock() {
    if (this.locked) return;
    try {
      // En navegadores nuevos devuelve una promesa que puede rechazarse
      // (por ejemplo, si se pide de nuevo justo después de apretar Esc).
      const result = this.element.requestPointerLock();
      if (result && typeof result.catch === 'function') {
        result.catch((err) => this._onLockError(err));
      }
    } catch (err) {
      this._onLockError(err);
    }
  }

  /** Suelta el mouse. */
  unlock() {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  /** ¿La tecla (event.code) está apretada? */
  isDown(code) {
    return this.keys.has(code);
  }

  /** ¿Se apretó la tecla en este frame? (para acciones de un solo toque) */
  wasPressed(code) {
    return this.justPressed.has(code);
  }

  /** Devuelve y reinicia el movimiento del mouse acumulado desde el último frame. */
  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Devuelve y reinicia el giro de la rueda acumulado (en "pasos"). */
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Se llama al final de cada frame para limpiar las teclas "recién apretadas". */
  endFrame() {
    this.justPressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    this.element.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    window.removeEventListener('blur', this._onBlur);
  }

  // --- Manejadores de eventos ---------------------------------------------

  _onKeyDown(e) {
    if (!this.locked) return;
    // Evitar que Espacio o las flechas desplacen la página mientras se juega,
    // y que Ctrl (correr) + una tecla dispare atajos del navegador (Ctrl+D
    // marcadores, Ctrl+S guardar, etc.). Ctrl+W no se puede bloquear: el
    // juego pide confirmación antes de cerrar (ver main.js).
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.ctrlKey) e.preventDefault();
    if (!e.repeat) this.justPressed.add(e.code);
    this.keys.add(e.code);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
  }

  _onWheel(e) {
    if (!this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) this._releaseAll();
    this.onLockChange?.(this.locked);
  }

  _onLockError(err) {
    this.onLockError?.(err);
  }

  _onBlur() {
    // Si la ventana pierde el foco, soltar todas las teclas para que el
    // jugador no siga caminando solo.
    this._releaseAll();
  }

  _releaseAll() {
    this.keys.clear();
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
