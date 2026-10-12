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

  const deckY = 0.0625;
  const keyboardWidth = 3.26;
  const keyboardDepth = 1.38;
  const keyboardCenterZ = -0.3;
  rounded(3.6, deckY * 2, 2.4, 0.045, metal, group, 0, 0, 0).name = 'laptop-body';
  rounded(3.45, 0.015, 2.23, 0.007, dark, group, 0, -deckY - 0.0025, 0);
  rounded(keyboardWidth + 0.06, 0.008, keyboardDepth + 0.02, 0.004, dark, group, 0, deckY + 0.0035, keyboardCenterZ);
  const gap = 0.026;
  const rows = [
    'Esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 Del'.split(' '),
    [...'` 1 2 3 4 5 6 7 8 9 0 - ='.split(' '), ['Backspace', 2]],
    [['Tab', 1.5], ...'Q W E R T Y U I O P [ ]'.split(' '), ['\\', 1.5]],
    [['Caps', 1.75], ...'A S D F G H J K L ;'.split(' '), "'", ['Enter', 2.25]],
    [['Shift', 2.25], ...'Z X C V B N M , . /'.split(' '), ['Shift', 2.75]],
    ['fn', ['Ctrl', 1.25], ['Alt', 1.25], ['Cmd', 1.25], ['', 5.5], ['Cmd', 1.25], ['Alt', 1.25]],
  ];
  const layout = [];
  for (const [rowIndex, row] of rows.entries()) {
    const cells = row.map((key) => typeof key === 'string' ? [key, 1] : key);
    // The final row reserves 2.25 units for the inverted-T arrow cluster.
    const units = rowIndex === 5 ? 15 : cells.reduce((sum, [, width]) => sum + width, 0);
    const pitch = keyboardWidth / units;
    const depth = rowIndex === 0 ? 0.125 : 0.195;
    const z = rowIndex === 0 ? -0.905 : -0.68 + (rowIndex - 1) * 0.226;
    let x = -keyboardWidth / 2;
    for (const [label, width] of cells) {
      layout.push({ label, x: x + width * pitch / 2, z, width: width * pitch - gap, depth });
      x += width * pitch;
    }
    if (rowIndex === 5) {
      const arrowPitch = (keyboardWidth / 2 - x) / 3;
      const arrowDepth = (depth - gap) / 2;
      const offsetZ = (arrowDepth + gap) / 2;
      for (const [label, column, offset] of [['←', 0, offsetZ], ['↓', 1, offsetZ], ['→', 2, offsetZ], ['↑', 1, -offsetZ]]) {
        layout.push({ label, x: x + (column + 0.5) * arrowPitch, z: z + offset, width: arrowPitch - gap, depth: arrowDepth });
      }
    }
  }
  const keyWidth = keyboardWidth / 15 - gap;
  const keyDepth = 0.195;
  const keyHeight = 0.028;
  const keyCenterY = deckY + 0.0085 + keyHeight / 2;
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(keyWidth, keyHeight, keyDepth, 1, 0.011), keyMaterial, layout.length);
  keys.name = 'keyboard';
  const transform = new THREE.Object3D();
  const labels = document.createElement('canvas');
  labels.width = Math.round(keyboardWidth * 500);
  labels.height = Math.round(keyboardDepth * 500);
  const labelContext = labels.getContext('2d');
  labelContext.fillStyle = '#aab5c8';
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  for (const [index, key] of layout.entries()) {
    transform.position.set(key.x, keyCenterY, key.z);
    transform.scale.set(key.width / keyWidth, 1, key.depth / keyDepth);
    transform.updateMatrix();
    keys.setMatrixAt(index, transform.matrix);
    if (!key.label) continue;
    const fontSize = key.depth < 0.15 ? 15 : key.label.length === 1 ? 24 : 16;
    labelContext.font = `${fontSize}px "Segoe UI", Arial, sans-serif`;
    labelContext.fillText(key.label,
      (key.x / keyboardWidth + 0.5) * labels.width,
      ((key.z - keyboardCenterZ) / keyboardDepth + 0.5) * labels.height);
  }
  keys.castShadow = true;
  keys.receiveShadow = true;
  group.add(keys);
  const labelTexture = new THREE.CanvasTexture(labels);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(keyboardWidth, keyboardDepth), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false }));
  labelPlane.name = 'keyboard-legends';
  labelPlane.rotation.x = -Math.PI / 2;
  labelPlane.position.set(0, keyCenterY + keyHeight / 2 + 0.0015, keyboardCenterZ);
  group.add(labelPlane);

  rounded(1.45, 0.005, 0.68, 0.0025, new THREE.MeshStandardMaterial({ color: '#454d5b', metalness: 0.7, roughness: 0.42 }), group, 0, deckY + 0.0025, 0.76);
  rounded(1.41, 0.006, 0.64, 0.003, metal, group, 0, deckY + 0.0035, 0.76);
  rounded(0.58, 0.009, 0.04, 0.004, dark, group, 0, 0.06, 1.165);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 2.98, 16), dark);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.085, -1.09);
  group.add(hinge);
  const lid = new THREE.Group();
  lid.position.set(0, 0.085, -1.09);
  lid.rotation.x = THREE.MathUtils.degToRad(-20);
  group.add(lid);
  rounded(3.6, 2.2, 0.085, 0.035, metal, lid, 0, 1.1, 0).name = 'laptop-lid';
  rounded(3.52, 2.146, 0.008, 0.004, dark, lid, 0, 1.1, 0.0465);

  const texture = createScreenTexture();
  // Display pixels stay independent of warm studio lights and specular hotspots.
  const screenWidth = 3.46;
  const screenHeight = screenWidth * texture.image.height / texture.image.width;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, fog: false,
  }));
  screen.name = 'laptop-screen';
  screen.position.set(0, 1.09, 0.052);
  lid.add(screen);
  const webcam = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), new THREE.MeshBasicMaterial({ color: '#35465c' }));
  webcam.position.set(0, 2.152, 0.0525);
  lid.add(webcam);
  const badgeMaterial = new THREE.MeshStandardMaterial({ color: '#c4cedd', metalness: 0.75, roughness: 0.35 });
  const badge = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 32), badgeMaterial);
  badge.rotation.y = Math.PI;
  badge.position.set(0, 1.1, -0.0445);
  lid.add(badge);

  // Match the favicon's simple V silhouette without a font or image texture.
  const logoShape = new THREE.Shape([[14, 18], [27, 47], [35, 47], [48, 18], [37, 18], [31, 35], [25, 18]]
    .map(([x, y]) => new THREE.Vector2((x - 31) * 0.12 / 34, (32.5 - y) * 0.12 / 34)));
  logoShape.closePath();
  const logo = new THREE.Mesh(new THREE.ShapeGeometry(logoShape), badgeMaterial);
  logo.name = 'lid-logo';
  logo.rotation.y = Math.PI;
  logo.position.copy(badge.position);
  lid.add(logo);

  return { group, screen };
}
