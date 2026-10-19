// Menús en HTML: pantalla de inicio y menú de pausa.
//
// El HTML de cada pantalla está en index.html; esta clase solo las muestra u
// oculta y conecta los botones con el juego.

export class Menu {
  /**
   * @param {object} options
   * @param {() => void} options.onPlay "Jugar" en la pantalla de inicio
   * @param {() => void} options.onResume "Continuar" (o clic) en la pausa
   * @param {Record<string, {name: string, swatch: string}>} options.colors
   *   colores del personaje para elegir
   * @param {string} options.color color elegido al empezar
   * @param {(key: string) => void} options.onColor al elegir otro color
   */
  constructor({ onPlay, onResume, colors, color, onColor }) {
    this.title = document.getElementById('title-screen');
    this.pause = document.getElementById('pause-screen');
    this.titleMsg = document.getElementById('title-msg');
    this.pauseMsg = document.getElementById('pause-msg');

    document.getElementById('btn-play').addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay();
    });
    document.getElementById('btn-resume').addEventListener('click', (e) => {
      e.stopPropagation();
      onResume();
    });
    // En la pausa, un clic en cualquier parte también vuelve al juego.
    this.pause.addEventListener('click', () => onResume());

    this._buildSwatches(colors, color, onColor);

    // Megabrick es para computadora: en pantallas táctiles sin mouse se avisa.
    const touchOnly =
      window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    document.getElementById('device-note').hidden = !touchOnly;
  }

  /**
   * Botones de color del personaje: un grupo de opciones tipo radio. Con el
   * teclado, Tab entra al grupo y las flechas cambian de color.
   */
  _buildSwatches(colors, selected, onColor) {
    const box = document.getElementById('color-swatches');
    box.textContent = '';
    const keys = Object.keys(colors);
    this.swatches = [];
    const select = (index, focus) => {
      this.swatches.forEach((s, j) => {
        s.setAttribute('aria-checked', String(index === j));
        s.tabIndex = index === j ? 0 : -1;
      });
      if (focus) this.swatches[index].focus();
      onColor(keys[index]);
    };
    keys.forEach((key, i) => {
      const c = colors[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c.swatch;
      b.title = c.name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.name);
      b.setAttribute('aria-checked', String(key === selected));
      b.tabIndex = key === selected ? 0 : -1;
      b.addEventListener('click', () => select(i, false));
      this.swatches.push(b);
      box.appendChild(b);
    });
    box.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const i = this.swatches.indexOf(document.activeElement);
      if (!step || i < 0) return;
      e.preventDefault();
      select((i + step + keys.length) % keys.length, true);
    });
  }

  showTitle() {
    this.title.hidden = false;
    this.pause.hidden = true;
    this.setMessage('');
  }

  showPause() {
    this.title.hidden = true;
    this.pause.hidden = false;
    this.setMessage('');
  }

  hideAll() {
    this.title.hidden = true;
    this.pause.hidden = true;
  }

  /** Muestra un aviso corto en la pantalla visible. */
  setMessage(text) {
    this.titleMsg.textContent = text;
    this.pauseMsg.textContent = text;
  }
}
