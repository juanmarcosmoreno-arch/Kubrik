// Vitrina del personaje en la pantalla de inicio: gira despacio, respira y
// va mostrando sus expresiones. Se dibuja solo dentro del recuadro
// #character-stage (con scissor), sobre el fondo negro del título.

import * as THREE from 'three';
import { Avatar } from '../player/Avatar.js';

/** Expresiones que muestra la vitrina, en orden. */
const SHOWCASE = ['normal', 'feliz', 'sorprendido', 'determinado', 'divertido'];
const EXPRESSION_SECONDS = 2.2;

/** Sombra suave bajo los pies (un degradé radial en un plano). */
function shadowMesh() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  return mesh;
}

export class CharacterPreview {
  /**
   * @param {string} variant color inicial
   */
  constructor(variant) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 0.6, 0.1, 50);
    this.camera.position.set(0, 1.15, 4.6);
    this.camera.lookAt(0, 0.92, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const key = new THREE.DirectionalLight(0xfff2de, 2.0);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9ff8a, 0.9); // contraluz verdoso, como el logo
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);

    this.avatar = new Avatar(variant);
    this.scene.add(this.avatar.root);
    this.shadow = shadowMesh();
    this.scene.add(this.shadow);

    this.time = 0;
    this._expressionIndex = 0;
    this._expressionTimer = EXPRESSION_SECONDS;
  }

  setVariant(variant) {
    this.avatar.setVariant(variant);
  }

  update(dt) {
    this.time += dt;
    // Gira mirando hacia la cámara con un vaivén que muestra los costados.
    // (yaw = PI: el personaje, que mira hacia -Z, queda de frente a la cámara.)
    const yaw = Math.PI + Math.sin(this.time * 0.6) * 0.75;
    this.avatar.bodyYaw = yaw;
    this.avatar.update(dt, { yaw, pitch: Math.sin(this.time * 0.9) * 0.08, speed: 0 });

    this._expressionTimer -= dt;
    if (this._expressionTimer <= 0) {
      this._expressionTimer = EXPRESSION_SECONDS;
      this._expressionIndex = (this._expressionIndex + 1) % SHOWCASE.length;
      this.avatar.setExpression(SHOWCASE[this._expressionIndex]);
    }
  }

  /**
   * Dibuja la vitrina dentro del rectángulo de un elemento HTML.
   * @param {THREE.WebGLRenderer} renderer
   * @param {DOMRect} rect posición del recuadro en la pantalla (px CSS)
   */
  render(renderer, rect) {
    if (rect.width < 2 || rect.height < 2) return;
    const x = rect.left;
    const y = window.innerHeight - rect.bottom; // WebGL cuenta Y desde abajo
    renderer.setViewport(x, y, rect.width, rect.height);
    renderer.setScissor(x, y, rect.width, rect.height);
    renderer.setScissorTest(true);
    this.camera.aspect = rect.width / rect.height;
    // Si el recuadro es angosto, alejar la cámara para que entre entero.
    const dist = Math.max(4.6, 2.6 / this.camera.aspect);
    this.camera.position.set(0, 1.15, dist);
    this.camera.lookAt(0, 0.92, 0);
    this.camera.updateProjectionMatrix();
    // Mapeo de tonos suave solo para la vitrina, así los blancos y la piel
    // no se "queman" con la luz fuerte del estudio.
    const toneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.render(this.scene, this.camera);
    renderer.toneMapping = toneMapping;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}
