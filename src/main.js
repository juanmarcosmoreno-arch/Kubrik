// Megabrick — punto de entrada: arma el juego y corre el loop principal.

import './style.css';
import * as THREE from 'three';
import { createAtlasTexture } from './render/textures.js';
import { createBlockMaterials } from './render/materials.js';
import { Sky } from './render/Sky.js';
import { World } from './world/World.js';
import { FLAT_SURFACE_Y, generateFlatFloor, placeShowcase } from './world/TerrainGen.js';
import { Player } from './player/Player.js';
import { Controls } from './player/Controls.js';
import { Avatar } from './player/Avatar.js';
import { ViewCamera } from './player/ViewCamera.js';
import { CharacterPreview } from './render/CharacterPreview.js';
import { DEFAULT_VARIANT, VARIANTS, isVariant } from './render/avatarTextures.js';
import { loadPreference, savePreference } from './save/Preferences.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Hud } from './ui/Hud.js';
import { Menu } from './ui/Menu.js';

// Tamaño del piso de prueba de la etapa 1 (en bloques).
const FLOOR_SIZE = 32;
// Paso de tiempo máximo por frame: si el navegador se traba, el juego no
// "salta" de golpe.
const MAX_DT = 0.1;
// Color de fondo de la pantalla de inicio (el mismo negro del logo).
const TITLE_BG = 0x0a0a0a;

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
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // --- Texturas y materiales ---
    this.atlas = createAtlasTexture();
    this.materials = createBlockMaterials(this.atlas.texture);

    // --- Mundo ---
    this.world = new World(this.materials);
    this.scene.add(this.world.group);
    generateFlatFloor(this.world, FLOOR_SIZE);
    placeShowcase(this.world);
    this.world.rebuildDirty();

    this.sky = new Sky(this.scene);

    // --- Jugador ---
    this.player = new Player();
    // Aparece en el borde sur del piso mirando hacia el centro (-Z).
    this.player.spawn(FLOOR_SIZE / 2, FLAT_SURFACE_Y, FLOOR_SIZE - 4, 0, -0.2);
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
    this.controls = new Controls(this.renderer.domElement);
    this.controls.onLockChange = (locked) => this.onLockChange(locked);
    this.controls.onLockError = () =>
      this.menu.setMessage('No se pudo capturar el mouse. Esperá un segundo y probá de nuevo.');

    // --- Interfaz ---
    this.hud = new Hud(document.getElementById('hud'));
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
    this.watchPixelRatio();
    this.onResize();
    this.renderer.setAnimationLoop(() => this.frame());
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
    // Contento mientras sube rápido volando; normal el resto del tiempo.
    a.setExpression(p.velocity.y > 3 ? 'feliz' : 'normal');
    a.update(this.state === STATE.PLAYING ? dt : 0, {
      yaw: p.yaw,
      pitch: p.pitch,
      speed: p.horizontalSpeed,
      flying: p.flying && !p.isOnGround(this.world),
    });
  }

  /** Un frame del loop principal. */
  frame() {
    const realDt = this.clock.getDelta();
    const dt = Math.min(realDt, MAX_DT);

    if (this.state === STATE.TITLE) {
      // Fondo negro como el del logo y el personaje en su recuadro.
      this.renderer.setClearColor(TITLE_BG, 1);
      this.renderer.clear();
      this.preview.update(dt);
      this.preview.render(this.renderer, this.stageEl.getBoundingClientRect());
    } else {
      if (this.state === STATE.PLAYING) {
        if (this.controls.wasPressed('KeyV')) this.hud.toast(this.view.cycle());
        this.player.update(dt, this.controls, this.world);
        this.world.rebuildDirty();
      }
      // Primero la cámara: decide si hay lugar para mostrar al personaje.
      this.view.update(this.player, this.world);
      this.updateAvatar(dt);
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
