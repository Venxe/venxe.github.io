import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KEYBOARD_WELL } from './keyboard.js';

export const LAPTOP_SIZE = Object.freeze({ width: 3.6, depth: 2.4 });

const PORT_LAYOUT = [
  { id: 'power-left', type: 'power', side: -1, z: -0.58, y: 0.006, width: 0.054, height: 0.054, radius: 0.027 },
  { id: 'usb-c-left', type: 'usb-c', side: -1, z: -0.27, y: 0.006, width: 0.09, height: 0.032, radius: 0.016 },
  { id: 'usb-a-left', type: 'usb-a', side: -1, z: 0.1, y: 0.006, width: 0.135, height: 0.049, radius: 0.005 },
  { id: 'ethernet-right', type: 'ethernet', side: 1, z: -0.58, y: -0.0155, width: 0.145, height: 0.1, radius: 0.003 },
  { id: 'usb-a-right', type: 'usb-a', side: 1, z: 0.12, y: 0.006, width: 0.135, height: 0.049, radius: 0.005 },
];
const ethernet = PORT_LAYOUT.find(({ type }) => type === 'ethernet');
const GRILLE = { width: 2.7, depth: 0.045, z: -1.035, diameter: 0.006, pitch: 0.012, rows: 3 };
const FOOT_HEIGHT = 0.023;
const CAMERA_COVER_SECONDS = 0.18;

function rectangle(width, height, radius, x = 0, y = 0) {
  const path = new THREE.Shape();
  const left = x - width / 2, right = x + width / 2;
  const bottom = y - height / 2, top = y + height / 2;
  path.moveTo(left + radius, bottom).lineTo(right - radius, bottom);
  path.quadraticCurveTo(right, bottom, right, bottom + radius).lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top).lineTo(left + radius, top);
  path.quadraticCurveTo(left, top, left, top - radius).lineTo(left, bottom + radius);
  path.quadraticCurveTo(left, bottom, left + radius, bottom);
  return path;
}

function circle(radius, x = 0, y = 0) {
  return new THREE.Path().absarc(x, y, radius, 0, Math.PI * 2, true);
}

function mesh(geometry, material, parent, name, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 4, bevelEnabled: false });
}

function box(parent, material, name, width, height, depth, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(width, height, depth), material, parent, name, x, y, z);
}

// Leave a bottom-edge notch for the Ethernet jaw and a future full-height plug.
function bottomPlate(width, depth, radius) {
  const left = -width / 2, right = width / 2, bottom = -depth / 2, top = depth / 2;
  const notchBottom = -ethernet.z - ethernet.width / 2 - 0.008;
  const notchTop = -ethernet.z + ethernet.width / 2 + 0.008;
  const path = new THREE.Shape().moveTo(left + radius, bottom).lineTo(right - radius, bottom);
  path.quadraticCurveTo(right, bottom, right, bottom + radius);
  path.lineTo(right, notchBottom).lineTo(1.8 - 0.15, notchBottom);
  path.lineTo(1.8 - 0.15, notchTop).lineTo(right, notchTop).lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top).lineTo(left + radius, top);
  path.quadraticCurveTo(left, top, left, top - radius).lineTo(left, bottom + radius);
  path.quadraticCurveTo(left, bottom, left + radius, bottom);
  return path;
}

export function createLaptopBody(deckY, metal, dark) {
  const group = new THREE.Group();
  group.name = 'laptop-body';
  const wallBottom = -deckY + 0.008;
  const wallTop = deckY - 0.008;
  const wallHeight = wallTop - wallBottom;
  const chrome = new THREE.MeshStandardMaterial({ color: '#abb3be', metalness: 0.9, roughness: 0.29 });
  const plastic = new THREE.MeshStandardMaterial({ color: '#171c24', roughness: 0.82 });
  const contacts = new THREE.MeshStandardMaterial({ color: '#a28a54', metalness: 0.8, roughness: 0.42 });

  const deck = rectangle(LAPTOP_SIZE.width, LAPTOP_SIZE.depth, 0.045);
  deck.holes.push(rectangle(KEYBOARD_WELL.width, KEYBOARD_WELL.depth, KEYBOARD_WELL.radius, 0, -KEYBOARD_WELL.centerZ));
  deck.holes.push(rectangle(GRILLE.width, GRILLE.depth, 0.008, 0, -GRILLE.z));
  const top = mesh(extrude(deck, 0.008), metal, group, 'laptop-deck', 0, wallTop);
  top.rotation.x = -Math.PI / 2;
  const bottom = mesh(extrude(bottomPlate(LAPTOP_SIZE.width, LAPTOP_SIZE.depth, 0.045), 0.008), metal, group, 'laptop-bottom', 0, -deckY);
  bottom.rotation.x = -Math.PI / 2;
  const seam = mesh(extrude(bottomPlate(3.45, 2.23, 0.045), 0.008), dark, group, 'body-seam', 0, -deckY - 0.008);
  seam.rotation.x = -Math.PI / 2;

  const grilleShape = rectangle(GRILLE.width, GRILLE.depth, 0.008);
  const columns = Math.floor((GRILLE.width - 0.03) / GRILLE.pitch);
  for (let row = 0; row < GRILLE.rows; row++) {
    for (let column = 0; column < columns; column++) {
      grilleShape.holes.push(circle(GRILLE.diameter / 2,
        (column - (columns - 1) / 2) * GRILLE.pitch, (row - (GRILLE.rows - 1) / 2) * GRILLE.pitch));
    }
  }
  const grille = mesh(extrude(grilleShape, 0.004), metal, group, 'cooling-grille', 0, deckY - 0.004, GRILLE.z);
  grille.rotation.x = -Math.PI / 2;
  box(group, plastic, 'grille-channel', GRILLE.width, 0.006, GRILLE.depth, 0, deckY - 0.028, GRILLE.z);

  for (const side of [-1, 1]) {
    const sidePorts = PORT_LAYOUT.filter((port) => port.side === side);
    const panel = new THREE.Shape().moveTo(-1.155, wallBottom);
    if (side === ethernet.side) {
      const center = -side * ethernet.z;
      panel.lineTo(center - ethernet.width / 2, wallBottom).lineTo(center - ethernet.width / 2, ethernet.y + ethernet.height / 2);
      panel.lineTo(center + ethernet.width / 2, ethernet.y + ethernet.height / 2).lineTo(center + ethernet.width / 2, wallBottom);
    }
    panel.lineTo(1.155, wallBottom).lineTo(1.155, wallTop).lineTo(-1.155, wallTop).closePath();
    for (const port of sidePorts) {
      if (port.type === 'ethernet') continue;
      panel.holes.push(port.type === 'power' ? circle(port.radius, -side * port.z, port.y)
        : rectangle(port.width, port.height, port.radius, -side * port.z, port.y));
    }
    for (let slot = 0; slot < 11; slot++) {
      panel.holes.push(rectangle(0.009, 0.045, 0.003, -side * (-0.97 + (slot - 5) * 0.018), 0));
    }
    const wall = mesh(extrude(panel, 0.008), metal, group, side === -1 ? 'body-left-wall' : 'body-right-wall', side * 1.792);
    wall.rotation.y = side * Math.PI / 2;
    box(group, plastic, `vent-channel-${side === -1 ? 'left' : 'right'}`, 0.006, 0.06, 0.22, side * 1.755, 0, -0.97);
  }
  for (const side of [-1, 1]) {
    const wall = mesh(extrude(rectangle(3.51, wallHeight, 0), 0.008), metal, group, side === 1 ? 'body-front-wall' : 'body-back-wall', 0, 0, side * 1.192);
    wall.rotation.y = side === 1 ? 0 : Math.PI;
  }
  const corners = [];
  for (let corner = 0; corner < 4; corner++) {
    const angle = corner * Math.PI / 2;
    const x = Math.cos(angle + Math.PI / 4) > 0 ? 1.755 : -1.755;
    const y = Math.sin(angle + Math.PI / 4) > 0 ? 1.155 : -1.155;
    const path = new THREE.Shape().moveTo(x + 0.045 * Math.cos(angle), y + 0.045 * Math.sin(angle));
    path.absarc(x, y, 0.045, angle, angle + Math.PI / 2, false);
    path.lineTo(x + 0.037 * Math.cos(angle + Math.PI / 2), y + 0.037 * Math.sin(angle + Math.PI / 2));
    path.absarc(x, y, 0.037, angle + Math.PI / 2, angle, true).closePath();
    corners.push(path);
  }
  const cornerWall = mesh(extrude(corners, wallHeight), metal, group, 'body-corners', 0, wallBottom);
  cornerWall.rotation.x = -Math.PI / 2;

  const ports = PORT_LAYOUT.map((port) => {
    const portGroup = new THREE.Group();
    portGroup.name = port.id;
    portGroup.position.set(port.side * 1.8, port.y, port.z);
    portGroup.rotation.y = port.side * Math.PI / 2;
    group.add(portGroup);
    const anchor = new THREE.Object3D();
    anchor.name = `${port.id}-anchor`;
    portGroup.add(anchor);
    if (port.type === 'power') {
      mesh(new THREE.TorusGeometry(0.025, 0.002, 6, 20), chrome, portGroup, 'power-rim');
      const barrel = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 16, 1, true), plastic, portGroup, 'power-socket', 0, 0, -0.05);
      barrel.rotation.x = Math.PI / 2;
      mesh(new THREE.CircleGeometry(0.026, 16), plastic, portGroup, 'power-recess', 0, 0, -0.1);
      const pin = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8), chrome, portGroup, 'power-pin', 0, 0, -0.05);
      pin.rotation.x = Math.PI / 2;
    } else if (port.type === 'ethernet') {
      const left = -port.width / 2, right = port.width / 2;
      const rimBottom = -deckY - port.y;
      const rimTop = port.height / 2;
      const rim = new THREE.Shape().moveTo(left - 0.005, rimBottom).lineTo(left - 0.005, rimTop + 0.004);
      rim.lineTo(right + 0.005, rimTop + 0.004).lineTo(right + 0.005, rimBottom).lineTo(right, rimBottom);
      rim.lineTo(right, rimTop).lineTo(left, rimTop).lineTo(left, rimBottom).closePath();
      mesh(extrude(rim, 0.004), chrome, portGroup, 'ethernet-rim', 0, 0, -0.003);
      const innerBottom = wallBottom - port.y;
      const innerHeight = rimTop - innerBottom;
      const innerY = (rimTop + innerBottom) / 2;
      box(portGroup, plastic, 'ethernet-recess', port.width, innerHeight, 0.005, 0, innerY, -0.115);
      box(portGroup, plastic, 'ethernet-ceiling', port.width, 0.006, 0.1, 0, rimTop - 0.003, -0.06);
      for (const side of [-1, 1]) box(portGroup, plastic, 'ethernet-inner-wall', 0.005, innerHeight, 0.1, side * (port.width / 2 - 0.0025), innerY, -0.06);
      const jaw = new THREE.Group();
      jaw.name = 'ethernet-jaw';
      jaw.position.set(0, -deckY + 0.0065 - port.y, -0.06);
      portGroup.add(jaw);
      box(jaw, plastic, 'ethernet-jaw-floor', port.width, 0.004, 0.07, 0, -0.002, 0.035);
      box(jaw, metal, 'ethernet-jaw-lip', port.width, 0.008, 0.008, 0, 0.001, 0.066);
      const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.005, 0.003, 0.055), contacts, 8);
      pins.name = 'ethernet-contacts';
      const transform = new THREE.Object3D();
      for (let index = 0; index < pins.count; index++) {
        transform.position.set((index - 3.5) * 0.015, 0.026, -0.055);
        transform.rotation.x = -0.2;
        transform.updateMatrix();
        pins.setMatrixAt(index, transform.matrix);
      }
      portGroup.add(pins);
    } else {
      const shell = rectangle(port.width + 0.01, port.height + 0.01, port.radius + 0.005);
      shell.holes.push(rectangle(port.width, port.height, port.radius));
      mesh(extrude(shell, 0.1), chrome, portGroup, `${port.type}-socket`, 0, 0, -0.098);
      box(portGroup, plastic, `${port.type}-recess`, port.width, port.height, 0.004, 0, 0, -0.1);
      const isA = port.type === 'usb-a';
      box(portGroup, plastic, `${port.type}-tongue`, isA ? 0.105 : 0.065, isA ? 0.012 : 0.007, 0.065, 0, isA ? -0.007 : 0, -0.049);
      const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(isA ? 0.013 : 0.003, 0.0015, 0.027), contacts, isA ? 4 : 24);
      pins.name = `${port.type}-contacts`;
      const transform = new THREE.Object3D();
      for (let index = 0; index < pins.count; index++) {
        transform.position.set(isA ? (index - 1.5) * 0.025 : (index % 12 - 5.5) * 0.005,
          isA ? -0.00025 : index < 12 ? 0.004 : -0.004, -0.043);
        transform.updateMatrix();
        pins.setMatrixAt(index, transform.matrix);
      }
      portGroup.add(pins);
    }
    return { id: port.id, type: port.type, group: portGroup, anchor };
  });

  const transform = new THREE.Object3D();
  const feet = new THREE.InstancedMesh(new RoundedBoxGeometry(0.3, FOOT_HEIGHT, 0.09, 1, 0.006), plastic, 4);
  feet.name = 'rubber-feet';
  feet.castShadow = true;
  for (const [index, [x, z]] of [[-1.42, -0.94], [1.42, -0.94], [-1.42, 0.94], [1.42, 0.94]].entries()) {
    transform.position.set(x, -deckY - 0.008 - FOOT_HEIGHT / 2, z);
    transform.updateMatrix();
    feet.setMatrixAt(index, transform.matrix);
  }
  group.add(feet);
  const screwShape = new THREE.Shape().absarc(0, 0, 0.014, 0, Math.PI * 2, false);
  screwShape.holes.push(rectangle(0.019, 0.003, 0.001));
  const screws = new THREE.InstancedMesh(extrude(screwShape, 0.002), chrome, 6);
  screws.name = 'bottom-screws';
  for (const [index, [x, z]] of [[-1.57, -1.02], [0, -1.02], [1.57, -1.02], [-1.57, 1.02], [0, 1.02], [1.57, 1.02]].entries()) {
    transform.position.set(x, -deckY - 0.008, z);
    transform.rotation.set(Math.PI / 2, 0, 0);
    transform.updateMatrix();
    screws.setMatrixAt(index, transform.matrix);
  }
  group.add(screws);
  return { group, ports };
}

export function createWebcam(dark) {
  const group = new THREE.Group();
  group.name = 'webcam';
  group.position.set(0, 2.152, 0.0525);
  const railShape = rectangle(0.088, 0.028, 0.008, -0.022);
  railShape.holes.push(circle(0.009));
  mesh(extrude(railShape, 0.0015), dark, group, 'camera-cover-rail');
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#5f6877', metalness: 0.7, roughness: 0.35 });
  mesh(new THREE.RingGeometry(0.0075, 0.009, 20), rimMaterial, group, 'camera-lens-ring', 0, 0, 0.002);
  const lens = mesh(new THREE.CircleGeometry(0.0075, 20), new THREE.MeshPhysicalMaterial({
    color: '#152c43', metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
  }), group, 'camera-lens', 0, 0, 0.002);
  lens.castShadow = false;
  const led = mesh(new THREE.CircleGeometry(0.003, 12), new THREE.MeshStandardMaterial({ color: '#53605b', roughness: 0.5 }), group, 'camera-indicator', 0.031, 0, 0.002);
  led.castShadow = false;
  const cover = new THREE.Group();
  cover.name = 'camera-cover';
  cover.position.x = -0.035;
  group.add(cover);
  mesh(new RoundedBoxGeometry(0.025, 0.022, 0.003, 1, 0.0015), dark, cover, 'camera-cover-panel', 0, 0, 0.0045);
  box(cover, rimMaterial, 'camera-cover-grip', 0.002, 0.01, 0.0015, -0.006, 0, 0.0065);
  const hitArea = mesh(new THREE.PlaneGeometry(0.12, 0.043), new THREE.MeshBasicMaterial({ visible: false }), group, 'camera-cover-hit-area', -0.017, 0, 0.008);
  hitArea.castShadow = false;
  hitArea.receiveShadow = false;
  let closed = false;
  let from = cover.position.x;
  let elapsed = CAMERA_COVER_SECONDS;
  return {
    group, hitArea,
    get closed() { return closed; },
    setClosed(value) {
      if (closed === value) return;
      closed = value;
      from = cover.position.x;
      elapsed = 0;
    },
    update(delta, reducedMotion) {
      const target = closed ? 0 : -0.035;
      if (cover.position.x === target) return false;
      elapsed = reducedMotion ? CAMERA_COVER_SECONDS : Math.min(CAMERA_COVER_SECONDS, elapsed + delta);
      const progress = elapsed / CAMERA_COVER_SECONDS;
      const eased = progress * progress * (3 - 2 * progress);
      const position = elapsed === CAMERA_COVER_SECONDS ? target : THREE.MathUtils.lerp(from, target, eased);
      if (position === cover.position.x) return false;
      cover.position.x = position;
      return true;
    },
  };
}
