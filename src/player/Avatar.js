// Personaje principal: modelo, animación y expresiones.
//
// Estilo "juguete": formas redondeadas (cajas con bordes suaves, esferas y
// cilindros) con material plástico. La cara, el logo del pecho y el de la
// mochila son calcomanías (DecalGeometry) proyectadas sobre las piezas.
// El modelo se arma en "unidades" de 1/16 de bloque y mira hacia -Z, igual
// que la cámara con yaw = 0.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  COLORS,
  DEFAULT_VARIANT,
  EXPRESSIONS,
  VARIANTS,
  getFaceTexture,
  getVariantTextures,
  isVariant,
} from '../render/avatarTextures.js';

/**
 * Tamaño de una unidad del modelo, en bloques. Con la cabeza agrandada el
 * personaje mide ~33 unidades: se achica un poco para que quede en ~1,9
 * bloques, cerca de la altura del jugador (1,8).
 */
const UNIT = (1 / 16) * 0.92;
/** Escala de la cabeza (cabezona, estilo juguete). */
const HEAD_SCALE = 1.12;

// Alturas de las articulaciones (en unidades, desde los pies).
const HIP_Y = 10;
const SHOULDER_Y = 17.4;
const NECK_Y = 18.4;
const ARM_X = 6.2;
const LEG_X = 2.3;

// ---------------------------------------------------------------------------
// Ayudas para armar piezas
// ---------------------------------------------------------------------------

/** Caja con bordes redondeados (el radio se limita a la medida más chica). */
function rbox(w, h, d, r, segments = 3) {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
}

/** Agrega una pieza a `parent` en la posición/rotación/escala dadas. */
function add(parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

/** Grupo que sirve de articulación (pivote) en la posición dada. */
function joint(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

/**
 * Calcomanía proyectada sobre una pieza. Se proyecta en el espacio local de
 * la pieza y se agrega como hija, así acompaña cualquier animación.
 * `facing` es hacia dónde mira la cara donde va pegada: -1 adelante, +1 atrás.
 */
function decal(target, material, center, size, facing = -1) {
  const local = new THREE.Mesh(target.geometry); // matriz identidad
  const orientation = new THREE.Euler(0, facing < 0 ? Math.PI : 0, 0);
  const geometry = new DecalGeometry(
    local,
    new THREE.Vector3(...center),
    orientation,
    new THREE.Vector3(...size),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  target.add(mesh);
  return mesh;
}

/** Material plástico con color. */
function plastic(color, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

/** Material para calcomanías (transparente, siempre por delante de su pieza). */
function decalMaterial(map, roughness = 0.5) {
  return new THREE.MeshStandardMaterial({
    map,
    roughness,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
}

/**
 * Une en una sola malla las piezas de un grupo que comparten material (menos
 * llamadas de dibujo). Las calcomanías y piezas con varios materiales quedan
 * aparte.
 */
function mergeByMaterial(group) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || Array.isArray(child.material) || child.children.length) continue;
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(child);
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const clone = m.geometry.clone().applyMatrix4(m.matrix);
      // Solo atributos comunes, sin grupos, para poder unirlas.
      for (const name of Object.keys(clone.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) clone.deleteAttribute(name);
      }
      clone.clearGroups();
      return clone.index ? clone.toNonIndexed() : clone;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    group.add(new THREE.Mesh(merged, material));
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Duración del movimiento de brazo al usar un bloque (segundos). */
const SWING_TIME = 0.3;

/** Diferencia de ángulos normalizada a [-PI, PI]. */
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// Personaje
// ---------------------------------------------------------------------------

export class Avatar {
  /**
   * @param {string} [variant] clave de VARIANTS (verde, azul, rojo, ...)
   */
  constructor(variant = DEFAULT_VARIANT) {
    this.variant = isVariant(variant) ? variant : DEFAULT_VARIANT;
    const v = VARIANTS[this.variant];
    const tex = getVariantTextures(this.variant);

    // Materiales: los de color de la variante se actualizan al cambiarla.
    this.mats = {
      main: plastic(v.main),
      dark: plastic(v.dark),
      light: plastic(v.light),
      white: plastic(COLORS.white, 0.6),
      skin: plastic(COLORS.skin, 0.62),
      hair: plastic(COLORS.hair, 0.7),
      pants: plastic(COLORS.pants, 0.75),
      pantsDark: plastic(COLORS.pantsDark, 0.75),
      bag: plastic(COLORS.bag, 0.6),
      bagPocket: plastic(COLORS.bagPocket, 0.6),
      cap: new THREE.MeshStandardMaterial({ map: tex.cap, roughness: 0.55, side: THREE.DoubleSide }),
      face: decalMaterial(getFaceTexture('normal'), 0.6),
      chest: decalMaterial(tex.chest, 0.6),
      bagLogo: decalMaterial(tex.bag, 0.5),
    };

    // Raíz en los pies; todo el modelo se arma en unidades y se escala.
    this.root = new THREE.Group();
    this.root.name = 'personaje';
    this.model = new THREE.Group();
    this.model.scale.setScalar(UNIT);
    this.root.add(this.model);
    this._build();

    // Estado de animación.
    this.bodyYaw = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.baseExpression = 'normal';
    this._blinkTimer = 2 + Math.random() * 3;
    this._blinking = 0;
    this._swing = 0; // animación de usar un bloque (segundos que faltan)
    this.heldBlock = null; // malla del bloque en la mano derecha
  }

  _build() {
    const M = this.mats;

    // --- Piernas: pantalón cargo y zapatillas (pivote en la cadera) ---
    const buildLeg = (side) => {
      const leg = joint(side * LEG_X, HIP_Y, 0);
      add(leg, new THREE.CapsuleGeometry(2.15, 3.6, 8, 18), M.pants, [0, -3.5, 0]);
      // Bolsillo cargo del lado de afuera, con una etiqueta de color.
      add(leg, rbox(0.9, 2.8, 2.6, 0.44), M.pantsDark, [side * 2.2, -4.2, 0.2]);
      add(leg, rbox(0.5, 0.9, 1.1, 0.24), M.main, [side * 2.65, -3.5, -0.4]);
      // Zapatilla redondeada: capellada de color, suela y puntera blancas.
      add(leg, rbox(4.6, 2.7, 6.4, 1.34, 5), M.main, [0, -8.4, -0.9]);
      add(leg, rbox(4.9, 1.05, 6.8, 0.52, 4), M.white, [0, -9.5, -0.9]);
      add(leg, rbox(4.1, 1.5, 1.8, 0.74, 4), M.white, [0, -8.75, -3.5]);
      add(leg, rbox(1.8, 0.45, 0.7, 0.22), M.white, [0, -7.0, -1.6]);
      add(leg, rbox(1.8, 0.45, 0.7, 0.22), M.white, [0, -7.15, -2.6]);
      return leg;
    };
    this.legR = buildLeg(1);
    this.legL = buildLeg(-1);

    // --- Torso: buzo con capucha, panel blanco y mochila ---
    this.body = joint(0, HIP_Y, 0);
    const torso = add(this.body, rbox(10, 8.6, 6.2, 2.9, 6), M.main, [0, 4.3, 0]);
    // El panel va sobre la parte plana del frente, para que no se deforme en
    // la curva del torso.
    decal(torso, M.chest, [0, 0.3, -3.1], [4.6, 5.6, 4]);
    // Cuello y capucha caída detrás.
    add(this.body, new THREE.TorusGeometry(2.5, 0.85, 12, 28), M.light, [0, 8.5, 0.1], [Math.PI / 2, 0, 0]);
    add(this.body, rbox(7.6, 3.3, 3.4, 1.6, 4), M.dark, [0, 8.3, 2.8], [-0.25, 0, 0]);
    // Cordones de la capucha: cortos y blancos, a los costados del cuello
    // (que no tapen el logo del pecho).
    for (const x of [-1.7, 1.7]) {
      add(this.body, new THREE.CylinderGeometry(0.22, 0.22, 1.5, 8), M.white, [x, 7.55, -3.15]);
      add(this.body, new THREE.SphereGeometry(0.34, 10, 8), M.white, [x, 6.75, -3.15]);
    }
    // Tiras de la mochila: un tramo recto adelante y un arco que sigue la
    // curva del hombro hasta la mochila.
    const strapArc = new THREE.TorusGeometry(3.0, 0.35, 8, 24, Math.PI);
    for (const x of [-3.3, 3.3]) {
      add(this.body, rbox(1.5, 4.4, 0.7, 0.34), M.bag, [x, 3.7, -2.95]);
      add(this.body, strapArc, M.bag, [x, 5.7, 0], [0, Math.PI / 2, 0], [1, 1, 2.1]);
    }
    // Mochila con bolsillo y logo.
    const bag = add(this.body, rbox(8, 8, 3.4, 1.65, 5), M.bag, [0, 4.7, 4.8]);
    add(this.body, rbox(5.8, 3.6, 1.3, 0.64, 4), M.bagPocket, [0, 2.5, 6.6]);
    decal(bag, M.bagLogo, [0, 1.45, 1.7], [4.6, 3.6, 2], 1);

    // --- Brazos: manga, puño blanco y mano (pivote en el hombro) ---
    const buildArm = (side) => {
      const arm = joint(side * ARM_X, SHOULDER_Y, 0);
      add(arm, new THREE.CapsuleGeometry(1.75, 4.2, 8, 18), M.main, [0, -3.0, 0]);
      add(arm, new THREE.CylinderGeometry(1.85, 1.85, 1.0, 18), M.white, [0, -6.2, 0]);
      add(arm, new THREE.SphereGeometry(1.7, 18, 14), M.skin, [0, -7.75, 0], [0, 0, 0], [1, 1.12, 1]);
      return arm;
    };
    this.armR = buildArm(1);
    this.armL = buildArm(-1);

    // --- Cabeza redonda con pelo y gorra (pivote en el cuello) ---
    // HC: altura del centro de la cabeza; la cabeza es un elipsoide.
    const HC = 6.3;
    const HEAD = [5.8, 5.4, 5.3]; // radios x, y, z
    this.head = joint(0, NECK_Y, 0);
    this.head.rotation.order = 'YXZ'; // primero gira, después inclina (como la mirada)
    this.head.scale.setScalar(HEAD_SCALE);
    add(this.head, new THREE.CylinderGeometry(1.5, 1.5, 1.4, 14), M.skin, [0, 0.5, 0]);
    this.headMesh = add(this.head, new THREE.SphereGeometry(1, 48, 32).scale(...HEAD), M.skin, [0, HC, 0]);
    this.faceDecal = decal(this.headMesh, M.face, [0, -1.5, -HEAD[2]], [9, 6.75, 6]);
    // Pelo castaño: un casquete que cubre la nuca hasta la línea de las
    // orejas (por debajo de la gorra), un flequillo finito y dos patillas.
    add(
      this.head,
      new THREE.SphereGeometry(1, 40, 20, 0, Math.PI, 0.18 * Math.PI, 0.5 * Math.PI).scale(
        HEAD[0] + 0.2,
        HEAD[1] + 0.15,
        HEAD[2] + 0.2,
      ),
      M.hair,
      [0, HC, 0.15],
    );
    const tuft = new THREE.SphereGeometry(1, 14, 10);
    for (const [x, y, z, sx, sy, sz] of [
      [-2.8, HC + 0.95, -4.45, 1.6, 0.5, 0.75],
      [2.7, HC + 0.95, -4.5, 1.7, 0.5, 0.75],
      [-5.45, HC + 0.35, -1.6, 0.6, 1.2, 1.4],
      [5.45, HC + 0.35, -1.6, 0.6, 1.2, 1.4],
    ]) {
      add(this.head, tuft, M.hair, [x, y, z], [0, 0, 0], [sx, sy, sz]);
    }
    // Gorra: media esfera con la textura (panel blanco y logo) y botón.
    const CAP_Y = HC + 1.3;
    add(
      this.head,
      new THREE.SphereGeometry(1, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      M.cap,
      [0, CAP_Y, 0.15],
      [0, 0, 0],
      [6.05, 5.4, 5.85],
    );
    add(this.head, new THREE.SphereGeometry(0.7, 12, 8), M.main, [0, CAP_Y + 5.35, 0.15]);
    // Visera: medio disco aplanado, apenas inclinado hacia abajo. La cara de
    // abajo es más oscura (materiales: costado, arriba, abajo).
    add(
      this.head,
      new THREE.CylinderGeometry(1, 1, 0.6, 40, 1, false, Math.PI / 2, Math.PI),
      [M.main, M.main, M.dark],
      [0, CAP_Y + 0.1, -1.6],
      [-0.1, 0, 0],
      [5.7, 1, 6.2],
    );

    this.model.add(this.legL, this.legR, this.body, this.armL, this.armR, this.head);

    // Menos llamadas de dibujo: unir piezas del mismo material por grupo.
    for (const g of [this.legL, this.legR, this.body, this.armL, this.armR, this.head]) {
      mergeByMaterial(g);
    }
  }

  /**
   * Pone un bloque en la mano derecha (o lo saca con geometry = null).
   * @param {THREE.BufferGeometry | null} geometry geometría del bloque (1x1x1)
   * @param {THREE.Material[]} [materials] materiales de bloques por capa
   */
  setHeldBlock(geometry, materials) {
    if (!geometry) {
      if (this.heldBlock) this.heldBlock.visible = false;
      return;
    }
    if (!this.heldBlock) {
      this.heldBlock = new THREE.Mesh(geometry, materials);
      // Delante de la mano, del tamaño de un cubito (unos 0,2 bloques).
      this.heldBlock.position.set(0, -8.4, -1.7);
      this.heldBlock.scale.setScalar(3.6);
      this.heldBlock.rotation.y = Math.PI / 4;
      this.armR.add(this.heldBlock);
    }
    this.heldBlock.geometry = geometry;
    this.heldBlock.visible = true;
  }

  /** Movimiento del brazo al romper o poner un bloque. */
  swing() {
    this._swing = SWING_TIME;
  }

  /** Cambia el color del buzo, la gorra y las zapatillas. */
  setVariant(variant) {
    if (!isVariant(variant) || variant === this.variant) return;
    this.variant = variant;
    const v = VARIANTS[variant];
    const tex = getVariantTextures(variant);
    this.mats.main.color.set(v.main);
    this.mats.dark.color.set(v.dark);
    this.mats.light.color.set(v.light);
    this.mats.cap.map = tex.cap;
    this.mats.chest.map = tex.chest;
    this.mats.bagLogo.map = tex.bag;
  }

  /**
   * Cambia la expresión de la cara (normal, feliz, sorprendido, determinado,
   * divertido). El parpadeo se superpone solo, cerrando los ojos de la
   * expresión actual.
   */
  setExpression(name) {
    if (!EXPRESSIONS.includes(name) || name === this.baseExpression) return;
    this.baseExpression = name;
    this._applyFace();
  }

  _applyFace() {
    this.mats.face.map = getFaceTexture(this.baseExpression, this._blinking > 0);
  }

  /**
   * Avanza la animación.
   * @param {number} dt segundos
   * @param {object} s estado del jugador
   * @param {number} s.yaw hacia dónde mira (radianes)
   * @param {number} s.pitch inclinación de la mirada
   * @param {number} s.speed velocidad horizontal (bloques/s)
   * @param {boolean} [s.flying] si está volando (en el aire)
   */
  update(dt, { yaw, pitch, speed, flying = false }) {
    this.time += dt;

    // El cuerpo sigue a la cabeza con suavidad; la cabeza gira como mucho
    // ~60° respecto del cuerpo (como una persona).
    const moving = speed > 0.3;
    const follow = moving ? 10 : 3;
    let diff = angleDiff(yaw, this.bodyYaw);
    this.bodyYaw += diff * (1 - Math.exp(-follow * dt));
    diff = angleDiff(yaw, this.bodyYaw);
    if (Math.abs(diff) > 1.05) this.bodyYaw = yaw - Math.sign(diff) * 1.05;
    this.root.rotation.y = this.bodyYaw;
    this.head.rotation.y = angleDiff(yaw, this.bodyYaw);
    this.head.rotation.x = clamp(pitch, -0.8, 0.8);

    // Caminata: piernas y brazos se balancean en contrafase.
    const amount = clamp(speed / 4.3, 0, 1);
    if (moving) this.walkPhase += dt * (4 + speed * 1.2);
    const swing = Math.sin(this.walkPhase) * 0.7 * amount;
    const idle = Math.sin(this.time * 1.8) * 0.04;
    if (flying && !moving) {
      // Flotando quieto: piernas un poco hacia atrás, brazos abiertos.
      this.legL.rotation.x = -0.2;
      this.legR.rotation.x = -0.12;
      this.armL.rotation.set(0.1, 0, -0.2 - idle);
      this.armR.rotation.set(0.1, 0, 0.2 + idle);
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.set(-swing * 0.8, 0, -0.06 - idle);
      this.armR.rotation.set(swing * 0.8, 0, 0.06 + idle);
    }
    // Con un bloque en la mano el brazo va un poco hacia adelante; al usarlo
    // se levanta y baja de golpe.
    if (this.heldBlock?.visible) this.armR.rotation.x = this.armR.rotation.x * 0.5 + 0.3;
    if (this._swing > 0) {
      this._swing = Math.max(0, this._swing - dt);
      const s = Math.sin((1 - this._swing / SWING_TIME) * Math.PI);
      this.armR.rotation.x += s * 1.3;
      this.armR.rotation.z -= s * 0.25;
    }
    // Al caminar el cuerpo sube y baja apenas con cada paso.
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.4 * amount;
    this.body.position.y = HIP_Y + bob;
    this.head.position.y = NECK_Y + bob;
    this.armL.position.y = this.armR.position.y = SHOULDER_Y + bob;

    // Parpadeo cada algunos segundos.
    if (this._blinking > 0) {
      this._blinking -= dt;
      if (this._blinking <= 0) {
        this._blinking = 0;
        this._applyFace();
      }
    } else {
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) {
        this._blinkTimer = 2.5 + Math.random() * 3;
        this._blinking = 0.13;
        this._applyFace();
      }
    }
  }

  /** Libera geometrías y materiales (las texturas se comparten y quedan). */
  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
