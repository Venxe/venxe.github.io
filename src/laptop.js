import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SETTINGS, LAPTOP_SIZE, LAPTOP_DEPTH_SCALE } from './config.js';
import { createScreen } from './screen.js';
import { createKeyboard } from './keyboard.js';
import { createSystem } from './system.js';
import { createLaptopBody, createWebcam } from './laptop-details.js';

const LID_OPEN_ANGLE = THREE.MathUtils.degToRad(-20);
const LID_CLOSED_ANGLE = Math.PI / 2;
const LID_SECONDS = 0.65;
const SCREEN_SLEEP_ANGLE = THREE.MathUtils.degToRad(20);
const SCREEN_WAKE_ANGLE = THREE.MathUtils.degToRad(30);
const SCREEN_FADE_OUT_SECONDS = 0.1;
const SCREEN_WAKE_DELAY_SECONDS = 0.15;
const SCREEN_FADE_IN_SECONDS = 0.6;
const SCREEN_LIGHT_INTENSITY = 0.3;

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
  const { width: bodyWidth, depth: bodyDepth } = LAPTOP_SIZE;
  const body = createLaptopBody(deckY, metal, dark);
  group.add(body.group);
  const keyboard = createKeyboard(deckY);
  keyboard.group.position.y = -0.03;
  group.add(keyboard.group);

  rounded(1.45, 0.005, 0.68 * LAPTOP_DEPTH_SCALE, 0.0025, new THREE.MeshStandardMaterial({ color: '#454d5b', metalness: 0.7, roughness: 0.42 }), group, 0, deckY + 0.0025, 0.76 * LAPTOP_DEPTH_SCALE).name = 'touchpad-rim';
  rounded(1.41, 0.006, 0.64 * LAPTOP_DEPTH_SCALE, 0.003, metal, group, 0, deckY + 0.0035, 0.76 * LAPTOP_DEPTH_SCALE).name = 'touchpad';
  rounded(0.58, 0.009, 0.04, 0.004, dark, group, 0, deckY - 0.0025, bodyDepth / 2 - 0.035).name = 'lid-notch';
  const hitArea = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.035, 0.08), new THREE.MeshBasicMaterial({ visible: false }));
  hitArea.name = 'lid-toggle-hit-area';
  // Extend just beyond the front lip so the notch stays reachable with the lid shut.
  hitArea.position.set(0, deckY - 0.0025, bodyDepth / 2 + 0.005);
  group.add(hitArea);

  const hingeRadius = 0.025;
  const hingeY = deckY + hingeRadius;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(hingeRadius, hingeRadius, 2.98, 16), dark);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, hingeY, -bodyDepth / 2);
  group.add(hinge);
  const lidPivot = new THREE.Group();
  lidPivot.name = 'laptop-lid-pivot';
  lidPivot.position.set(0, hingeY, -bodyDepth / 2);
  lidPivot.rotation.x = LID_OPEN_ANGLE;
  group.add(lidPivot);
  // Keep the screen above the resting keycaps when the lid lies flat.
  const lidContent = new THREE.Group();
  lidContent.position.z = -0.037;
  lidPivot.add(lidContent);
  rounded(bodyWidth, bodyDepth, 0.085, 0.035, metal, lidContent, 0, bodyDepth / 2, 0).name = 'laptop-lid';
  rounded(bodyWidth - 0.08, bodyDepth - 0.054, 0.008, 0.004, dark, lidContent, 0, bodyDepth / 2, 0.0465);

  const system = createSystem();
  const desktop = createScreen(system);
  const { texture } = desktop;
  // Display pixels stay independent of warm studio lights and specular hotspots.
  const { screenWidth, screenHeight } = LAPTOP_SIZE;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, fog: false,
  }));
  screen.name = 'laptop-screen';
  screen.position.set(0, bodyDepth / 2 - 0.01, 0.052);
  lidContent.add(screen);
  const screenLight = new THREE.PointLight('#b9caff', SCREEN_LIGHT_INTENSITY, 3, 2);
  screenLight.position.set(0, -0.55, 0.2);
  screen.add(screenLight);
  const webcam = createWebcam(dark);
  lidContent.add(webcam.group);
  const badgeMaterial = new THREE.MeshStandardMaterial({ color: '#c4cedd', metalness: 0.75, roughness: 0.35 });
  const badge = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 32), badgeMaterial);
  badge.rotation.y = Math.PI;
  badge.position.set(0, bodyDepth / 2, -0.0445);
  lidContent.add(badge);

  // Match the favicon's simple V silhouette without a font or image texture.
  const logoShape = new THREE.Shape([[14, 18], [27, 47], [35, 47], [48, 18], [37, 18], [31, 35], [25, 18]]
    .map(([x, y]) => new THREE.Vector2((x - 31) * 0.12 / 34, (32.5 - y) * 0.12 / 34)));
  logoShape.closePath();
  const logo = new THREE.Mesh(new THREE.ShapeGeometry(logoShape), badgeMaterial);
  logo.name = 'lid-logo';
  logo.rotation.y = Math.PI;
  logo.position.copy(badge.position);
  lidContent.add(logo);

  let closed = false;
  let from = lidPivot.rotation.x;
  let elapsed = LID_SECONDS;
  let screenAwake = true;
  let screenBrightness = 1;
  let screenFrom = 1;
  let screenElapsed = 0;
  const lid = {
    hitArea,
    get closed() { return closed; },
    get moving() { return lidPivot.rotation.x !== (closed ? LID_CLOSED_ANGLE : LID_OPEN_ANGLE); },
    setClosed(value) {
      if (closed === value) return;
      closed = value;
      system.send('lid', closed);
      from = lidPivot.rotation.x;
      elapsed = 0;
    },
    update(delta, reducedMotion) {
      const target = closed ? LID_CLOSED_ANGLE : LID_OPEN_ANGLE;
      let moved = false;
      if (lidPivot.rotation.x !== target) {
        elapsed = reducedMotion ? LID_SECONDS : Math.min(LID_SECONDS, elapsed + delta);
        const progress = elapsed / LID_SECONDS;
        const eased = progress * progress * (3 - 2 * progress);
        const angle = elapsed === LID_SECONDS ? target : THREE.MathUtils.lerp(from, target, eased);
        moved = angle !== lidPivot.rotation.x;
        lidPivot.rotation.x = angle;
      }
      const openingAngle = LID_CLOSED_ANGLE - lidPivot.rotation.x;
      let awake = screenAwake;
      if (openingAngle <= SCREEN_SLEEP_ANGLE) awake = false;
      else if (openingAngle >= SCREEN_WAKE_ANGLE) awake = true;
      if (awake !== screenAwake) {
        screenAwake = awake;
        screenFrom = screenBrightness;
        screenElapsed = 0;
      }
      const brightnessTarget = screenAwake ? 1 : 0;
      if (screenBrightness !== brightnessTarget) {
        const delay = screenAwake ? SCREEN_WAKE_DELAY_SECONDS : 0;
        const duration = screenAwake ? SCREEN_FADE_IN_SECONDS : SCREEN_FADE_OUT_SECONDS;
        screenElapsed = reducedMotion ? delay + duration : Math.min(delay + duration, screenElapsed + delta);
        const progress = THREE.MathUtils.clamp((screenElapsed - delay) / duration, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        screenBrightness = screenElapsed === delay + duration ? brightnessTarget : THREE.MathUtils.lerp(screenFrom, brightnessTarget, eased);
      }
      const brightness = screenBrightness * system.state.brightness;
      screen.material.color.setScalar(brightness);
      screenLight.intensity = SCREEN_LIGHT_INTENSITY * brightness;
      keyboard.setPower(system.state.phase !== 'off');
      return moved;
    },
  };

  return { group, screen, desktop, system, keyboard, ports: body.ports, webcam, lid };
}
