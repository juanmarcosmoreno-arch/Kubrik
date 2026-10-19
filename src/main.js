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
import { Hotbar, HOTBAR_SIZE } from './ui/Hotbar.js';
import { BlockOutline } from './render/BlockOutline.js';
import { HeldItem } from './render/HeldItem.js';
import { getBlockGeometry } from './render/blockGeometry.js';
import { BlockInteraction } from './player/Interaction.js';

// Paso de tiempo máximo por frame: si el navegador se traba, el juego no
// "salta" de golpe.
const MAX_DT = 0.1;
// Color de fondo de la pantalla de inicio (el mismo negro del logo).
const TITLE_BG = 0x0a0a0a;
// Campo de visión vertical (grados) y cuánto se abre al correr.
const BASE_FOV = 75;
const SPRINT_FOV_FACTOR = 1.12;

/**
 * Opciones que por ahora se eligen en la URL (el menú de mundos llega en la
 * etapa 5 y el de opciones en la 6):
 *   ?semilla=texto-o-número   misma semilla = mismo mundo
 *   ?distancia=6              distancia de render en chunks (2 a 16)
 */
function readUrlOptions() {
  const params = new URLSearchParams(window.location.search);
  const seedText = params.get('semilla')?.trim() || 'megabrick';
  const distance = Number.parseInt(params.get('distancia') ?? '', 10);
  return {
    seedText,
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
      },
    });
    this.menu = new Menu({
      onPlay: () => this.controls.lock(),
      onResume: () => this.controls.lock(),
      colors: VARIANTS,
      color,
      onColor: (key) => this.setAvatarColor(key),
    });

    this.state = STATE.TITLE;
    this.menu.showTitle();
    this.hud.setVisible(false);

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.onResize());
    // Ctrl+W cierra la pestaña y ninguna página puede impedirlo; como Ctrl
    // es correr y W avanzar, se pide confirmación antes de salir del juego.
    window.addEventListener('beforeunload', (e) => {
      if (this.state === STATE.TITLE) return;
      e.preventDefault();
      e.returnValue = '';
    });
    this.watchPixelRatio();
    this.onResize();
    this.renderer.setAnimationLoop(() => this.frame());
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
  }

  /** Cambio de captura del mouse: entra o sale del modo de juego. */
  onLockChange(locked) {
    if (locked) {
      this.state = STATE.PLAYING;
      this.menu.hideAll();
      this.hud.setVisible(true);
    } else if (this.state === STATE.PLAYING) {
      // Esc (o perder el foco) suelta el mouse: pausa.
      this.state = STATE.PAUSED;
      this.interaction.release();
      this.menu.showPause();
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
