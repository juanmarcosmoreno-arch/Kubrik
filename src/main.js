// Megabrick — punto de entrada: arma el juego y corre el loop principal.

import './style.css';
import * as THREE from 'three';
import { createAtlasTexture } from './render/textures.js';
import { createBlockMaterials } from './render/materials.js';
import { Sky } from './render/Sky.js';
import { World } from './world/World.js';
import { TerrainGenerator, parseSeed } from './world/TerrainGen.js';
import { Player } from './player/Player.js';
import { Controls } from './player/Controls.js';
import { Avatar } from './player/Avatar.js';
import { VIEW, ViewCamera } from './player/ViewCamera.js';
import { CharacterPreview } from './render/CharacterPreview.js';
import { DEFAULT_VARIANT, VARIANTS, isVariant } from './render/avatarTextures.js';
import { loadPreference, savePreference } from './save/Preferences.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Hud } from './ui/Hud.js';
import { Menu } from './ui/Menu.js';
import { DEFAULT_HOTBAR, Hotbar, HOTBAR_SIZE } from './ui/Hotbar.js';
import { BlockOutline } from './render/BlockOutline.js';
import { HeldItem } from './render/HeldItem.js';
import { getBlockGeometry } from './render/blockGeometry.js';
import { BlockInteraction } from './player/Interaction.js';
import { Multiplayer } from './net/Multiplayer.js';
import { MultiplayerMenu } from './ui/MultiplayerMenu.js';
import { WorldSaves } from './save/WorldSaves.js';
import { WorldsMenu } from './ui/WorldsMenu.js';

// Paso de tiempo máximo por frame: si el navegador se traba, el juego no
// "salta" de golpe.
const MAX_DT = 0.1;
// Color de fondo de la pantalla de inicio (el mismo negro del logo).
const TITLE_BG = 0x0a0a0a;
// Campo de visión vertical (grados) y cuánto se abre al correr.
const BASE_FOV = 75;
const SPRINT_FOV_FACTOR = 1.12;

/**
 * Opciones que se pueden elegir en la URL (el menú de opciones llega en la
 * etapa 6):
 *   ?semilla=texto-o-número   abre un mundo nuevo con esa semilla (en vez
 *                             del último mundo guardado)
 *   ?distancia=6              distancia de render en chunks (2 a 16)
 */
function readUrlOptions() {
  const params = new URLSearchParams(window.location.search);
  const seedText = params.get('semilla')?.trim() || 'megabrick';
  const distance = Number.parseInt(params.get('distancia') ?? '', 10);
  return {
    seedText,
    seedGiven: Boolean(params.get('semilla')?.trim()),
    seed: parseSeed(seedText),
    renderDistance: Number.isFinite(distance) ? Math.max(2, Math.min(16, distance)) : 6,
  };
}

/** Estados posibles del juego. */
const STATE = Object.freeze({
  TITLE: 'title', // pantalla de inicio
  PLAYING: 'playing', // jugando (mouse capturado)
  PAUSED: 'paused', // menú de pausa
});

class Game {
  constructor(container) {
    this.container = container;

    // --- Render ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

    // --- Texturas y materiales ---
    this.atlas = createAtlasTexture();
    this.materials = createBlockMaterials(this.atlas.texture);

    // --- Mundo ---
    this.options = readUrlOptions();
    this.generator = new TerrainGenerator(this.options.seed);
    this.world = new World(this.materials, this.generator, {
      renderDistance: this.options.renderDistance,
    });
    this.scene.add(this.world.group);

    this.sky = new Sky(this.scene);
    this.applyRenderDistance();

    // --- Jugador ---
    this.player = new Player();
    // Aparece en tierra firme cerca del origen, mirando al horizonte.
    const spawn = this.generator.findSpawn();
    this.player.spawn(spawn.x, spawn.y, spawn.z, 0, -0.1);
    // Los chunks de alrededor se cargan ya; el resto, de a poco por frame
    // (mientras se ve la pantalla de inicio ya se va cargando).
    this.world.preload(spawn.x, spawn.z, 2);
    this.view = new ViewCamera(this.camera);

    // --- Personaje (se ve en tercera persona y en la pantalla de inicio) ---
    let color = loadPreference('color', DEFAULT_VARIANT);
    if (!isVariant(color)) color = DEFAULT_VARIANT;
    this.avatar = new Avatar(color);
    this.avatar.root.visible = false;
    this.scene.add(this.avatar.root);
    this.preview = new CharacterPreview(color);
    // Reflejos suaves para el plástico del personaje: un ambiente de
    // "habitación" generado por código (solo afecta materiales estándar).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    for (const scene of [this.scene, this.preview.scene]) {
      scene.environment = env;
      scene.environmentIntensity = 0.55;
    }
    this.stageEl = document.getElementById('character-stage');
    // La cámara va en la escena para poder colgarle el bloque en la mano.
    this.scene.add(this.camera);
    this.heldItem = new HeldItem(this.camera, this.materials);
    this.controls = new Controls(this.renderer.domElement);
    this.controls.onLockChange = (locked) => this.onLockChange(locked);
    this.controls.onLockError = () =>
      this.menu.setMessage('No se pudo capturar el mouse. Esperá un segundo y probá de nuevo.');

    // --- Interfaz ---
    this.hud = new Hud(document.getElementById('hud'));
    this.hotbar = new Hotbar(this.hud.root, this.atlas.canvas);
    this.hotbar.onChange = (id) => this.onHeldBlockChange(id);
    this.onHeldBlockChange(this.hotbar.selectedBlock);

    // --- Romper y poner bloques ---
    this.outline = new BlockOutline(this.scene);
    this.interaction = new BlockInteraction({
      world: this.world,
      player: this.player,
      hotbar: this.hotbar,
      outline: this.outline,
      onAction: () => {
        this.heldItem.swing();
        this.avatar.swing();
        this.multiplayer.countAction();
      },
    });
    this.menu = new Menu({
      onPlay: () => this.controls.lock(),
      onResume: () => this.controls.lock(),
      colors: VARIANTS,
      color,
      onColor: (key) => this.setAvatarColor(key),
    });

    // --- Multijugador ---
    this.multiplayer = new Multiplayer(this);
    this.multiplayerMenu = new MultiplayerMenu(this.multiplayer, {
      onPlay: () => this.controls.lock(),
      hudRoot: this.hud.root,
      onPauseMessage: (text) => this.menu.setMessage(text, true),
    });
    this.multiplayerMenu.onBeforeJoin = () => this.beforeJoin();

    // --- Mundos guardados ---
    this.saves = new WorldSaves(this);
    this.worldsMenu = new WorldsMenu(this.saves, {
      canChangeWorld: () => !this.multiplayer.active && !this.multiplayer.connecting,
      onPlayWorld: (id) => this.openWorld(id, { play: true }),
      onNewWorld: (o) => this.newWorld(o),
      onDeleteWorld: (id) => this.deleteWorld(id),
    });
    this.saves.onChange = () => this.worldsMenu.render();
    this.saves.onNotice = (text) => this.hud.toast(text, 4);
    // La lista de mundos depende de si hay partida (no se cambia de mundo
    // mientras se comparte).
    const renderMultiplayer = this.multiplayer.onChange;
    this.multiplayer.onChange = () => {
      renderMultiplayer();
      this.worldsMenu.render();
    };
    document.getElementById('btn-save-exit').addEventListener('click', (e) => {
      e.stopPropagation(); // en la pausa, un clic en el fondo vuelve al juego
      this.saveAndExit();
    });
    this.multiplayer.onNotice = (text, isWarning) => {
      this.hud.toast(text, 3);
      this.multiplayerMenu.notice(text, isWarning);
      // En el inicio no se ve el HUD y en la pausa queda tapado: los avisos
      // importantes van también al menú.
      if (isWarning && this.state !== STATE.PLAYING) this.menu.setMessage(text);
    };

    this.state = STATE.TITLE;
    this.menu.showTitle();
    this.hud.setVisible(false);

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.onResize());
    // Ctrl+W cierra la pestaña y ninguna página puede impedirlo; como Ctrl
    // es correr y W avanzar, se pide confirmación antes de salir del juego.
    // También si quedaron cambios sin guardar (porque falló el guardado).
    window.addEventListener('beforeunload', (e) => {
      if (this.state === STATE.TITLE && !this.multiplayer.active && this.world.unsaved.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    });
    // Al ocultar la pestaña o cerrarla se guarda lo que haya.
    const saveNow = () => {
      if (this.worldInUse || this.world.unsaved.size > 0) this.saves.save();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
    window.addEventListener('pagehide', saveNow);
    // Autoguardado con su propio reloj: sigue aunque la pestaña esté oculta
    // (ahí no se dibujan frames, pero pueden llegar cambios de invitados).
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      this.saves.update((now - lastTick) / 1000, this.worldInUse);
      lastTick = now;
    }, 1000);
    // Hasta leer los mundos guardados no se puede empezar (si no, "Jugar"
    // crearía un mundo nuevo en vez de continuar el último).
    this.worldsMenu.setBusy(true);
    this.saves
      .init()
      .then(() => this.openLastWorld())
      .finally(() => this.worldsMenu.setBusy(false));
    this.watchPixelRatio();
    this.onResize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** ¿Se está en un mundo (jugando o en pausa)? */
  get inGame() {
    return this.state !== STATE.TITLE;
  }

  /** ¿Se está usando el mundo (en juego o compartiéndolo)? Entonces se autoguarda. */
  get worldInUse() {
    return this.inGame || this.multiplayer.role === 'host';
  }

  /**
   * Cambia el mundo: otra semilla y, opcionalmente, cambios de bloques ya
   * hechos (al cargar un mundo guardado o al unirse a una partida). Antes se
   * guarda el mundo que se deja.
   * @param {object} o
   * @param {number} o.seed
   * @param {string} [o.seedText]
   * @param {unknown} [o.edits] cambios (formato de World.exportEdits)
   * @param {{x: number, y: number, z: number}} [o.spawn] dónde aparece (si no, se busca)
   * @param {{yaw: number, pitch: number, flying?: boolean}} [o.look] hacia dónde mira y si vuela
   * @param {{slots: number[], selected: number}} [o.hotbar]
   * @param {object} [o.save] datos del guardado de este mundo (ver WorldSaves.setCurrent)
   */
  loadWorld({ seed, seedText, edits, spawn, look, hotbar, save }) {
    this.saves.saveIfWorthIt();
    this.world.dispose();
    this.scene.remove(this.world.group);
    this.options.seed = seed;
    this.options.seedText = seedText ?? String(seed);
    this.generator = new TerrainGenerator(seed);
    this.world = new World(this.materials, this.generator, {
      renderDistance: this.options.renderDistance,
    });
    this.world.importEdits(edits);
    this.scene.add(this.world.group);
    this.interaction.world = this.world;
    this.applyRenderDistance();
    const s = spawn ?? this.generator.findSpawn();
    this.player.spawn(s.x, s.y, s.z, look?.yaw ?? this.player.yaw, look?.pitch ?? this.player.pitch);
    this.player.setFlying(Boolean(look?.flying));
    if (hotbar) this.hotbar.setSlots(hotbar.slots, hotbar.selected);
    this.saves.setCurrent(save);
    this.world.preload(s.x, s.z, 2);
  }

  /** Un mundo leído del guardado (WorldSaves.load) pasa a ser el actual. */
  applySavedWorld(data) {
    this.loadWorld({
      seed: data.seed,
      seedText: data.seedText,
      edits: data.edits,
      spawn: data.player,
      look: data.player ?? { yaw: 0, pitch: -0.1 },
      hotbar: data.hotbar ?? { slots: DEFAULT_HOTBAR, selected: 0 },
      save: data.save,
    });
  }

  /**
   * Al abrir el juego se prepara el último mundo jugado, para "Continuar".
   * No si la URL pide una semilla, ni si el jugador ya eligió otra cosa.
   */
  async openLastWorld() {
    const last = this.saves.worlds[0];
    if (!last || this.options.seedGiven) return;
    const idle = () =>
      this.state === STATE.TITLE &&
      !this.multiplayer.active &&
      !this.multiplayer.connecting &&
      this.saves.current.id === null &&
      this.world.edits.size === 0;
    if (!idle()) return;
    try {
      const data = await this.saves.load(last.id);
      if (data && idle()) this.applySavedWorld(data);
    } catch {
      // Si no se pudo leer, se queda el mundo nuevo.
    }
  }

  /**
   * Antes de dejar el mundo actual: si tiene cambios que no se pueden
   * guardar (el navegador no deja, o falló el guardado), se pregunta.
   * @returns {boolean} si se puede seguir
   */
  confirmLeaveWorld() {
    const s = this.saves;
    if (s.available === false && this.world.edits.size > 0) {
      return window.confirm('Este navegador no deja guardar: lo que construiste en este mundo se pierde. ¿Seguir?');
    }
    if (s.status === 'error' && this.world.unsaved.size > 0) {
      return window.confirm('No se pudo guardar este mundo: si seguís, se pierden los últimos cambios. ¿Seguir?');
    }
    return true;
  }

  /** Abre un mundo guardado (y, con `play`, entra a jugarlo). */
  async openWorld(id, { play = false } = {}) {
    if (this.saves.current.id !== id) {
      if (play && !this.confirmLeaveWorld()) return;
      this.worldsMenu.setBusy(true);
      try {
        const data = await this.saves.load(id);
        if (!data) throw new Error('No se encontró ese mundo.');
        this.applySavedWorld(data);
      } finally {
        this.worldsMenu.setBusy(false);
      }
    }
    if (play) this.controls.lock();
  }

  /** Crea un mundo nuevo (semilla al azar si no se elige) y entra a jugarlo. */
  newWorld({ name, seedText }) {
    if (!this.confirmLeaveWorld()) return;
    const seed = seedText ? parseSeed(seedText) : crypto.getRandomValues(new Uint32Array(1))[0];
    this.loadWorld({
      seed,
      seedText: seedText || String(seed),
      look: { yaw: 0, pitch: -0.1 },
      hotbar: { slots: DEFAULT_HOTBAR, selected: 0 },
      save: { name },
    });
    this.controls.lock();
  }

  /** Borra un mundo guardado. Si era el abierto, se abre otro (o uno nuevo). */
  async deleteWorld(id) {
    const wasCurrent = this.saves.current.id === id;
    await this.saves.delete(id);
    if (!wasCurrent) return;
    const next = this.saves.worlds.find((w) => w.id !== id);
    try {
      if (next) {
        await this.openWorld(next.id);
        return;
      }
    } catch {
      // Si no se pudo abrir el siguiente, queda uno nuevo.
    }
    this.freshWorld();
  }

  /**
   * Pausa → "Guardar y salir": guarda, deja la partida (si hay) y vuelve al
   * inicio. Un invitado no guarda el mundo de la partida: vuelve a su último
   * mundo propio.
   */
  async saveAndExit() {
    const mp = this.multiplayer;
    if (
      mp.role === 'host' &&
      mp.players.size > 0 &&
      !window.confirm('Se cierra la partida para todos los que están jugando. ¿Salir igual?')
    ) {
      return;
    }
    const wasGuest = mp.role === 'guest';
    if (mp.active) mp.leave({ adopt: false });
    this.state = STATE.TITLE;
    this.interaction.release();
    this.hud.setVisible(false);
    this.menu.showTitle();
    this.worldsMenu.render();
    if (wasGuest) {
      await this.openOwnWorld();
      return;
    }
    const ok = await this.saves.save();
    if (!ok && this.saves.status === 'error') {
      this.menu.setMessage('No se pudo guardar el mundo. Entrá de nuevo y probá otra vez.');
    }
  }

  /** Abre el último mundo propio guardado o, si no hay, uno nuevo. */
  async openOwnWorld() {
    const last = this.saves.worlds[0];
    try {
      if (last) {
        await this.openWorld(last.id);
        return;
      }
    } catch {
      // Si no se pudo abrir, queda uno nuevo.
    }
    this.freshWorld();
  }

  /** Un mundo nuevo al azar, sin guardar todavía (se guarda al jugarlo). */
  freshWorld() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.loadWorld({
      seed,
      seedText: String(seed),
      look: { yaw: 0, pitch: -0.1 },
      hotbar: { slots: DEFAULT_HOTBAR, selected: 0 },
    });
  }

  /**
   * Antes de unirse a una partida: se va a jugar en el mundo de quien la
   * creó. El propio se guarda solo; si no se puede guardar y tiene cambios,
   * se pregunta.
   */
  beforeJoin() {
    return this.confirmLeaveWorld();
  }

  /**
   * Ajusta niebla y plano lejano de la cámara a la distancia de render: la
   * niebla tapa el borde del área cargada.
   */
  applyRenderDistance() {
    this.sky.setViewDistance(this.world.edgeDistance);
    this.camera.far = this.world.renderDistance * 16 + 64;
    this.camera.updateProjectionMatrix();
  }

  /** El bloque elegido en la hotbar va a la mano (primera y tercera persona). */
  onHeldBlockChange(id) {
    this.heldItem.setBlock(id);
    this.avatar.setHeldBlock(getBlockGeometry(id), this.materials);
  }

  /** Teclas 1-9 y rueda del mouse: elegir casilla de la hotbar. */
  updateHotbarInput() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.controls.wasPressed(`Digit${i + 1}`)) this.hotbar.select(i);
    }
    this.hotbar.scroll(this.controls.consumeWheel());
  }

  /** Cambia el color del personaje y lo recuerda para la próxima vez. */
  setAvatarColor(key) {
    this.avatar.setVariant(key);
    this.preview.setVariant(key);
    savePreference('color', key);
    this.multiplayerMenu?.render(); // el color propio en la lista de jugadores
  }

  /** Cambio de captura del mouse: entra o sale del modo de juego. */
  onLockChange(locked) {
    if (locked) {
      this.state = STATE.PLAYING;
      this.menu.hideAll();
      this.worldsMenu.closeAll();
      this.multiplayerMenu.close();
      this.hud.setVisible(true);
      // Un mundo nuevo se guarda al empezar a jugarlo.
      if (this.saves.current.id === null) this.saves.save();
    } else if (this.state === STATE.PLAYING) {
      // Esc (o perder el foco) suelta el mouse: pausa (y se guarda).
      this.state = STATE.PAUSED;
      this.interaction.release();
      this.menu.showPause();
      this.saves.save();
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // El zoom del navegador o pasar a otro monitor cambia la densidad de
    // píxeles: se vuelve a leer siempre (con tope 2 por rendimiento).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Mover la ventana entre una pantalla Retina y un monitor común cambia
   * devicePixelRatio sin disparar "resize": se escucha con matchMedia y se
   * vuelve a registrar con el valor nuevo cada vez que cambia.
   */
  watchPixelRatio() {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        this.onResize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  /** Ubica y anima el personaje según el estado del jugador. */
  updateAvatar(dt) {
    const p = this.player;
    const a = this.avatar;
    a.root.visible = this.view.showsAvatar;
    a.root.position.copy(p.position);
    // Decidido mientras rompe bloques; contento al subir rápido volando.
    let expression = 'normal';
    if (this.interaction.breaking && this.interaction.target) expression = 'determinado';
    else if (p.flying && p.velocity.y > 3) expression = 'feliz';
    a.setExpression(expression);
    a.update(this.state === STATE.PLAYING ? dt : 0, {
      yaw: p.yaw,
      pitch: p.pitch,
      speed: p.horizontalSpeed,
      flying: p.flying && !p.onGround,
    });
  }

  /** Abre un poco el campo de visión al correr (con transición suave). */
  updateFov(dt) {
    const target = BASE_FOV * (this.player.sprinting ? SPRINT_FOV_FACTOR : 1);
    const fov = this.camera.fov + (target - this.camera.fov) * (1 - Math.exp(-8 * dt));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Un frame del loop principal. */
  frame() {
    const realDt = this.clock.getDelta();
    const dt = Math.min(realDt, MAX_DT);

    // El mundo se genera alrededor del jugador en todos los estados (así,
    // mientras se ve la pantalla de inicio, ya se va cargando).
    this.world.update(this.player.position.x, this.player.position.z);
    this.multiplayer.update(dt);

    if (this.state === STATE.TITLE) {
      // Fondo negro como el del logo y el personaje en su recuadro.
      this.renderer.setClearColor(TITLE_BG, 1);
      this.renderer.clear();
      this.preview.update(dt);
      this.preview.render(this.renderer, this.stageEl.getBoundingClientRect());
    } else {
      if (this.state === STATE.PLAYING) {
        if (this.controls.wasPressed('KeyV')) this.hud.toast(this.view.cycle());
        if (this.controls.wasPressed('KeyF')) {
          this.player.setFlying(!this.player.flying);
          this.hud.toast(
            this.player.flying ? 'Vuelo activado: Espacio sube, Shift baja' : 'Vuelo desactivado',
          );
        }
        this.player.update(dt, this.controls, this.world);
        this.updateHotbarInput();
        this.interaction.update(dt, this.controls);
        this.updateFov(dt);
      }
      // Primero la cámara: decide si hay lugar para mostrar al personaje.
      this.view.update(this.player, this.world);
      this.updateAvatar(dt);
      // De frente la mira no marcaría el bloque apuntado: se oculta.
      this.hud.crosshair.hidden = this.view.mode === VIEW.FRONT && this.view.showsAvatar;
      // El bloque en la mano se ve solo cuando no se ve al personaje.
      this.heldItem.setVisible(!this.view.showsAvatar);
      this.heldItem.update(this.state === STATE.PLAYING ? dt : 0, this.player.horizontalSpeed);
      this.hotbar.update(dt);
      // Con la cámara bajo el agua todo se ve azul y cerca (en cualquier vista).
      const cam = this.camera.position;
      this.sky.setUnderwater(this.world.isWaterAt(cam.x, cam.y, cam.z));
      this.sky.update(dt, this.player.position);
      this.renderer.render(this.scene, this.camera);
    }

    this.hud.update(realDt);
    this.controls.endFrame();
  }
}

/** Mensaje de error visible si el navegador no soporta WebGL. */
function showFatalError(message) {
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = message;
  document.body.appendChild(el);
}

try {
  const game = new Game(document.getElementById('game'));
  // Acceso desde la consola del navegador para depurar: window.megabrick
  window.megabrick = game;
} catch (err) {
  console.error(err);
  // Sin juego, el botón "Jugar" no haría nada: se desactiva y se avisa.
  document.getElementById('btn-play').disabled = true;
  document.querySelector('.title-actions')?.setAttribute('hidden', '');
  showFatalError(
    'Megabrick no pudo iniciar. Verificá que tu navegador tenga WebGL activado. Detalle: ' +
      (err?.message ?? err),
  );
}
