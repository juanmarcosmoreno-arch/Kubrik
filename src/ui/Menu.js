// Menús en HTML: pantalla de inicio y menú de pausa.
//
// El HTML de cada pantalla está en index.html; esta clase solo las muestra u
// oculta y conecta los botones con el juego.

export class Menu {
  /**
   * @param {object} handlers
   * @param {() => void} handlers.onPlay "Jugar" en la pantalla de inicio
   * @param {() => void} handlers.onResume "Continuar" (o clic) en la pausa
   */
  constructor({ onPlay, onResume }) {
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

    // Megabrick es para computadora: en pantallas táctiles sin mouse se avisa.
    const touchOnly =
      window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    document.getElementById('device-note').hidden = !touchOnly;
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
