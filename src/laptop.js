import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SETTINGS } from './config.js';

export function createLaptop() {
  const group = new THREE.Group();
  group.position.fromArray(SETTINGS.laptopPosition);
  const metal = new THREE.MeshStandardMaterial({ color: '#737c78', metalness: 0.82, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#111613', roughness: 0.65 });
  const keyMaterial = new THREE.MeshStandardMaterial({ color: '#202923', roughness: 0.58, metalness: 0.15 });
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
  labelContext.fillStyle = '#a4afa6';
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

  rounded(1.2, 0.01, 0.64, 0.005, new THREE.MeshStandardMaterial({ color: '#414b46', metalness: 0.7, roughness: 0.42 }), group, 0, 0.083, 0.65);
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

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1200;
  screenCanvas.height = 720;
  const context = screenCanvas.getContext('2d');
  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.29, 1.974), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.set(0, 1.16, 0.066);
  lid.add(screen);
  const webcam = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: '#40564e' }));
  webcam.position.set(0, 2.19, 0.067);
  lid.add(webcam);
  const badge = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#b5c2b5', metalness: 0.85, roughness: 0.25 }));
  badge.rotation.y = Math.PI;
  badge.position.set(0, 1.18, -0.055);
  lid.add(badge);

  const actions = [
    { id: 'theme', label: 'Tema', symbol: '◐', x: 356 },
    { id: 'back', label: 'Geri', symbol: '↙', x: 612 },
  ];
  const actionY = 504;
  const actionWidth = 232;
  const actionHeight = 192;
  let screenActive = false;

  function actionAt(uv) {
    if (!screenActive || !uv || !Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return null;
    const x = uv.x * screenCanvas.width;
    const y = (1 - uv.y) * screenCanvas.height;
    if (y < actionY || y >= actionY + actionHeight) return null;
    return actions.find((action) => x >= action.x && x < action.x + actionWidth)?.id || null;
  }

  function drawScreen(theme = 0, active = false, selectedAction = null) {
    screenActive = active;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    const warm = theme === 1;
    const gradient = context.createLinearGradient(0, 0, 900, 720);
    gradient.addColorStop(0, warm ? '#482d38' : '#142c28');
    gradient.addColorStop(1, warm ? '#ac7049' : '#567660');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 720);
    context.fillStyle = warm ? '#d6a373' : '#afc9a0';
    context.beginPath();
    context.arc(915, 240, 95, 0, Math.PI * 2);
    context.fill();
    const hills = warm ? ['#855b50', '#61433f', '#392f35'] : ['#547b68', '#38594c', '#203c35'];
    for (let i = 0; i < 3; i++) {
      context.fillStyle = hills[i];
      context.beginPath();
      context.moveTo(0, 510 + i * 52);
      context.bezierCurveTo(350, 150 + i * 95, 720, 790 - i * 60, 1200, 310 + i * 125);
      context.lineTo(1200, 720);
      context.lineTo(0, 720);
      context.fill();
    }
    context.fillStyle = '#e4e8dc';
    context.font = 'bold 17px monospace';
    context.fillText('venxe.', 28, 28);
    if (active) {
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const action of actions) {
        context.fillStyle = '#0c1b18bb';
        context.beginPath();
        context.roundRect(action.x, actionY, actionWidth, actionHeight, 24);
        context.fill();
        if (action.id === selectedAction) {
          context.strokeStyle = '#d7ebaa';
          context.lineWidth = 4;
          context.stroke();
        }
        context.fillStyle = '#eaf0dc';
        context.font = '54px "Segoe UI Symbol", Arial, sans-serif';
        context.fillText(action.symbol, action.x + actionWidth / 2, actionY + 74);
        context.font = '26px "Segoe UI", Arial, sans-serif';
        context.fillText(action.label, action.x + actionWidth / 2, actionY + 151);
      }
    }
    texture.needsUpdate = true;
  }
  drawScreen();
  return { group, screen, drawScreen, actionAt };
}
