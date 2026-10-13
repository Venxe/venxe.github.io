import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SETTINGS } from './config.js';
import { createScreenTexture } from './screen.js';
import { createKeyboard } from './keyboard.js';
import { createLaptopBody, createWebcam } from './laptop-details.js';

export function createLaptop() {
  const group = new THREE.Group();
  group.position.fromArray(SETTINGS.laptopPosition);
  const metal = new THREE.MeshStandardMaterial({ color: '#89919e', metalness: 0.85, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#11151d', roughness: 0.68 });
  function rounded(width, height, depth, radius, material, parent, x, y, z) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  const deckY = 0.0475;
  const body = createLaptopBody(deckY, metal, dark);
  group.add(body.group);
  const keyboard = createKeyboard(deckY);
  group.add(keyboard.group);

  rounded(1.45, 0.005, 0.68, 0.0025, new THREE.MeshStandardMaterial({ color: '#454d5b', metalness: 0.7, roughness: 0.42 }), group, 0, deckY + 0.0025, 0.76);
  rounded(1.41, 0.006, 0.64, 0.003, metal, group, 0, deckY + 0.0035, 0.76);
  rounded(0.58, 0.009, 0.04, 0.004, dark, group, 0, deckY - 0.0025, 1.165);

  const hingeY = deckY + 0.019;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.98, 16), dark);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, hingeY, -1.12);
  group.add(hinge);
  const lid = new THREE.Group();
  lid.position.set(0, hingeY, -1.12);
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
  const webcam = createWebcam(dark);
  lid.add(webcam.group);
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

  return { group, screen, keyboard, ports: body.ports, webcam };
}
