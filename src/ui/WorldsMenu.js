// Mundos en la interfaz: botones de la pantalla de inicio (Continuar o Jugar,
// Nuevo mundo, Mis mundos), el panel para crear un mundo, la lista de mundos
// guardados (jugar o borrar) y el estado del guardado en el menú de pausa.

import { MAX_WORLD_NAME, cleanWorldName } from '../save/WorldSaves.js';

/** "hace 5 minutos", "ayer", "hace 3 días"... */
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function timeAgo(ms) {
  const s = (ms - Date.now()) / 1000;
  const steps = [
    [60, 'second'],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ];
  if (Math.abs(s) < 45) return 'recién';
  for (const [limit, unit, size = 1] of steps) {
    if (Math.abs(s) < limit) return relative.format(Math.round(s / size), unit);
  }
  return '';
}

export class WorldsMenu {
  /**
   * @param {import('../save/WorldSaves.js').WorldSaves} saves
   * @param {object} o
   * @param {() => boolean} o.canChangeWorld si se puede cambiar de mundo (no durante una partida)
   * @param {(id: number) => Promise<void>} o.onPlayWorld jugar un mundo guardado
   * @param {(o: {name: string|null, seedText: string}) => void} o.onNewWorld crear un mundo y jugarlo
   * @param {(id: number) => Promise<void>} o.onDeleteWorld borrar un mundo
   */
  constructor(saves, { canChangeWorld, onPlayWorld, onNewWorld, onDeleteWorld }) {
    this.saves = saves;
    this.canChangeWorld = canChangeWorld;
    this.onPlayWorld = onPlayWorld;
    this.onDeleteWorld = onDeleteWorld;
    const $ = (id) => document.getElementById(id);
    this.playBtn = $('btn-play');
    this.titleWorld = $('title-world');
    this.worldsBtn = $('btn-worlds');
    this.newBtn = $('btn-new-world');
    this.newPanel = $('new-world-panel');
    this.nameInput = $('nw-name');
    this.seedInput = $('nw-seed');
    this.listPanel = $('worlds-panel');
    this.list = $('worlds-list');
    this.listMsg = $('worlds-msg');
    this.saveStatus = $('save-status');
    this._busy = false;

    this.nameInput.maxLength = MAX_WORLD_NAME;
    this.newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openNew();
    });
    this.worldsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openList();
    });
    $('nw-back').addEventListener('click', () => this.closeAll());
    $('worlds-back').addEventListener('click', () => this.closeAll());
    const create = () => {
      this.closeAll();
      onNewWorld({ name: cleanWorldName(this.nameInput.value), seedText: this.seedInput.value.trim() });
    };
    $('nw-create').addEventListener('click', create);
    for (const input of [this.nameInput, this.seedInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') create();
      });
    }
    // Esc cierra los paneles (aunque el foco haya quedado afuera).
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (!this.newPanel.hidden || !this.listPanel.hidden)) this.closeAll();
    });
    this.render();
  }

  openNew() {
    this.nameInput.value = '';
    this.nameInput.placeholder = this.saves.defaultName();
    this.seedInput.value = new URLSearchParams(window.location.search).get('semilla') ?? '';
    this.newPanel.hidden = false;
    this.nameInput.focus();
  }

  openList() {
    this.listMsg.textContent = '';
    this.listPanel.hidden = false;
    this.renderList();
    this.list.querySelector('button')?.focus();
  }

  closeAll() {
    this.newPanel.hidden = true;
    this.listPanel.hidden = true;
  }

  /** Bloquea los botones mientras se carga un mundo. */
  setBusy(busy) {
    this._busy = busy;
    this.render();
  }

  /** Actualiza la pantalla de inicio, la lista y el estado en la pausa. */
  render() {
    const s = this.saves;
    const cur = s.current;
    // Inicio: "Continuar" si el mundo abierto ya está guardado.
    this.playBtn.textContent = cur.id !== null ? 'Continuar' : 'Jugar';
    this.playBtn.disabled = this._busy;
    // Durante una partida no se cambia de mundo (se le cambiaría a todos).
    const locked = !this.canChangeWorld();
    this.newBtn.disabled = this._busy || locked;
    this.newBtn.title = locked ? 'Salí de la partida para cambiar de mundo.' : '';
    const label = cur.id !== null ? `«${cur.name}»` : cur.foreign ? `${cur.name} (partida)` : '';
    this.titleWorld.textContent = label;
    this.titleWorld.hidden = !label;
    this.worldsBtn.hidden = !s.worlds.length;
    if (!this.listPanel.hidden) this.renderList();

    // Pausa: qué pasa con el guardado de este mundo.
    let text;
    if (s.available === false) text = 'Este navegador no deja guardar: el mundo se pierde al cerrar la página.';
    else if (cur.foreign) text = 'El mundo de la partida lo guarda quien la creó.';
    else if (s.status === 'saving') text = 'Guardando…';
    else if (s.status === 'error') text = 'No se pudo guardar el mundo.';
    else if (cur.id !== null && s.status === 'saved') text = `«${cur.name}» guardado.`;
    else text = 'Se guarda solo cada 30 segundos y al pausar.';
    this.saveStatus.textContent = text;
  }

  /** La lista de mundos guardados, con botones para jugar y borrar. */
  renderList() {
    const s = this.saves;
    this.list.textContent = '';
    if (!s.worlds.length) {
      const empty = document.createElement('li');
      empty.className = 'worlds-empty';
      empty.textContent = 'Todavía no hay mundos guardados.';
      this.list.appendChild(empty);
      return;
    }
    for (const w of s.worlds) {
      const isCurrent = w.id === s.current.id;
      const li = document.createElement('li');
      li.className = 'world-row';
      const info = document.createElement('div');
      info.className = 'world-info';
      const name = document.createElement('strong');
      name.textContent = cleanWorldName(w.name) ?? 'Mundo';
      const meta = document.createElement('span');
      meta.textContent = `Semilla: ${w.seedText} · ${timeAgo(w.playedAt)}${isCurrent ? ' · abierto' : ''}`;
      info.append(name, meta);

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'btn btn-small';
      play.textContent = isCurrent ? 'Continuar' : 'Jugar';
      play.disabled = this._busy || (!isCurrent && !this.canChangeWorld());
      if (play.disabled && !isCurrent) play.title = 'Salí de la partida para cambiar de mundo.';
      play.addEventListener('click', () => this._play(w.id));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-small btn-ghost';
      del.textContent = 'Borrar';
      del.disabled = this._busy || (isCurrent && !this.canChangeWorld());
      if (del.disabled && isCurrent) del.title = 'Salí de la partida para borrarlo.';
      // Primer clic: pide confirmación; segundo clic (en 4 s): borra.
      let armed = 0;
      del.addEventListener('click', async () => {
        if (!armed) {
          del.textContent = '¿Borrar?';
          del.classList.add('btn-danger');
          armed = setTimeout(() => {
            armed = 0;
            del.textContent = 'Borrar';
            del.classList.remove('btn-danger');
          }, 4000);
          return;
        }
        clearTimeout(armed);
        del.disabled = true;
        try {
          await this.onDeleteWorld(w.id);
          this.listMsg.textContent = '';
        } catch {
          this.listMsg.textContent = 'No se pudo borrar el mundo.';
          del.disabled = false;
        }
      });
      li.append(info, play, del);
      this.list.appendChild(li);
    }
  }

  async _play(id) {
    try {
      await this.onPlayWorld(id);
      this.closeAll();
    } catch (err) {
      this.listMsg.textContent = err?.message || 'No se pudo abrir el mundo.';
    }
  }
}
