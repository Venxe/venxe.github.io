import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SETTINGS } from './config.js';
import { createScreenTexture } from './screen.js';

export function createLaptop() {
  const group = new THREE.Group();
  group.position.fromArray(SETTINGS.laptopPosition);
  const metal = new THREE.MeshStandardMaterial({ color: '#89919e', metalness: 0.85, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#11151d', roughness: 0.68 });
  const keyMaterial = new THREE.MeshStandardMaterial({ color: '#202630', roughness: 0.6 });
  function rounded(width, height, depth, radius, material, parent, x, y, z) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  rounded(3.6, 0.16, 2.4, 0.07, metal, group, 0, 0, 0);
  rounded(3.45, 0.025, 2.23, 0.01, dark, group, 0, -0.08, 0);
  rounded(3.1, 0.012, 1.25, 0.006, dark, group, 0, 0.083, -0.32);
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.192, 0.035, 0.18, 1, 0.014), keyMaterial, 65);
  const transform = new THREE.Object3D();
  const labels = document.createElement('canvas');
  labels.width = 1300;
  labels.height = 550;
  const labelContext = labels.getContext('2d');
  labelContext.fillStyle = '#aab5c8';
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  labelContext.font = '21px Consolas, monospace';
  const rows = ['1 2 3 4 5 6 7 8 9 0 − = ⌫', 'Q W E R T Y U I O P [ ] \\', 'A S D F G H J K L ; \' ↵ ↵', 'Z X C V B N M , . / ↑ ⇧ ⇧', 'fn ⌃ ⌥ ⌘ · · · · · ⌘ ← ↓ →'];
  for (let row = 0; row < 5; row++) {
    const letters = rows[row].split(' ');
    for (let col = 0; col < 13; col++) {
      transform.position.set((col - 6) * 0.226, 0.107, -0.76 + row * 0.22);
      transform.updateMatrix();
      keys.setMatrixAt(row * 13 + col, transform.matrix);
      labelContext.fillText(letters[col], (col + 0.5) * 100, (row + 0.5) * 110);
    }
  }
  keys.castShadow = true;
  keys.receiveShadow = true;
  group.add(keys);
  const labelTexture = new THREE.CanvasTexture(labels);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.938, 1.1), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false }));
  labelPlane.rotation.x = -Math.PI / 2;
  labelPlane.position.set(0, 0.126, -0.32);
  group.add(labelPlane);

  rounded(1.2, 0.01, 0.64, 0.005, new THREE.MeshStandardMaterial({ color: '#454d5b', metalness: 0.7, roughness: 0.42 }), group, 0, 0.083, 0.65);
  rounded(1.16, 0.012, 0.6, 0.005, metal, group, 0, 0.086, 0.65);
  rounded(0.65, 0.014, 0.055, 0.007, dark, group, 0, 0.078, 1.177);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 2.98, 16), dark);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.11, -1.09);
  group.add(hinge);
  const lid = new THREE.Group();
  lid.position.set(0, 0.12, -1.09);
  lid.rotation.x = THREE.MathUtils.degToRad(-20);
  group.add(lid);
  rounded(3.6, 2.25, 0.105, 0.05, metal, lid, 0, 1.115, 0);
  rounded(3.48, 2.12, 0.012, 0.006, dark, lid, 0, 1.15, 0.057);

  const texture = createScreenTexture();
  // Display pixels stay independent of warm studio lights and specular hotspots.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.29, 1.974), new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, fog: false,
  }));
  screen.position.set(0, 1.16, 0.066);
  lid.add(screen);
  const webcam = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: '#35465c' }));
  webcam.position.set(0, 2.19, 0.067);
  lid.add(webcam);
  const badge = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#b5bfce', metalness: 0.85, roughness: 0.3 }));
  badge.rotation.y = Math.PI;
  badge.position.set(0, 1.18, -0.055);
  lid.add(badge);

  return { group, screen };
}
