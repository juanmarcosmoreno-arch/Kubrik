// Contorno (wireframe) del bloque apuntado.

import * as THREE from 'three';

const DARK = new THREE.Color(0x101010);
const LIGHT = new THREE.Color(0xd8e0f0);

export class BlockOutline {
  constructor(scene) {
    // Un poco más grande que el bloque, para que no se pise con sus caras.
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.mesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.7 }),
    );
    box.dispose();
    // Las aristas se acercan un poquito a la cámara (solo en profundidad, sin
    // moverse en pantalla) para que no las tapen las caras de al lado, por
    // ejemplo en el fondo de un pozo o en una esquina interior.
    this.mesh.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tmvPosition.xyz *= 0.98;\n\tgl_Position = projectionMatrix * mvPosition;',
      );
    };
    this.mesh.visible = false;
    this.mesh.renderOrder = 2; // después del agua
    scene.add(this.mesh);
  }

  /**
   * Color según la luz del día (0 noche, 1 día): oscuro de día y claro de
   * noche, con un cambio rápido al atardecer para que nunca se pierda.
   */
  setDaylight(daylight) {
    const k = THREE.MathUtils.smoothstep(daylight, 0.35, 0.65);
    this.mesh.material.color.lerpColors(LIGHT, DARK, k);
  }

  /** Muestra el contorno en el bloque (x, y, z), o lo oculta con null. */
  show(block) {
    if (!block) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
  }
}
