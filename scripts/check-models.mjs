import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Use the same vendored modules as the browser import map.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return nextResolve(new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, context);
    if (specifier.startsWith('three/addons/')) return nextResolve(new URL(`../vendor/three/addons/${specifier.slice('three/addons/'.length)}`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});

// Model construction needs a 2D canvas. Pixel output is deliberately not tested here.
const drawnLabels = [];
const context = new Proxy({}, { get: (_, key) => {
  if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (key === 'fillText') return (text, x, y) => {
    drawnLabels.push({ text, x, y });
  };
  return () => {};
} });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
const THREE = await import('three');
const { createLaptop } = await import('../src/laptop.js');
const { createCoffee } = await import('../src/coffee.js');
const laptop = createLaptop();
const coffee = createCoffee();
const scene = new THREE.Scene();
scene.add(laptop.group, coffee.group);
scene.updateMatrixWorld(true);

let triangles = 0;
let meshes = 0;
scene.traverse((object) => {
  if (!object.isMesh) return;
  meshes++;
  const geometry = object.geometry;
  const positions = geometry.getAttribute('position');
  assert.ok(positions.array.every(Number.isFinite), 'Geometry positions must be finite');
  triangles += (geometry.index?.count || positions.count) / 3 * (object.isInstancedMesh ? object.count : 1);
});
assert.ok(triangles < 100_000, `Model triangle budget exceeded: ${triangles}`);
assert.ok(meshes < 80, `Model draw budget exceeded: ${meshes}`);
const keys = laptop.group.getObjectByName('keyboard');
const legends = laptop.group.getObjectByName('keyboard-legends');
const keyBounds = [];
const matrix = new THREE.Matrix4();
keys.geometry.computeBoundingBox();
for (let index = 0; index < keys.count; index++) {
  keys.getMatrixAt(index, matrix);
  const bounds = keys.geometry.boundingBox.clone().applyMatrix4(matrix).applyMatrix4(keys.matrixWorld);
  keyBounds.push(bounds);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 0 && size.z > 0, 'Every key must have a positive width and depth');
  for (const previous of keyBounds.slice(0, -1)) assert.ok(!bounds.intersectsBox(previous), 'Keycaps must not overlap');
}
const labelledKeys = drawnLabels.filter(({ text }) => text !== 'venxe').map(({ text, x, y }) => {
  const uvs = legends.geometry.attributes.uv;
  const positions = legends.geometry.attributes.position;
  const drawnUv = new THREE.Vector2(x / legends.material.map.image.width, 1 - y / legends.material.map.image.height);
  let index = -1;
  const point = new THREE.Vector3();
  for (let key = 0; key < keys.count; key++) {
    const uv = new THREE.Vector2();
    point.set(0, 0, 0);
    for (let corner = 0; corner < 4; corner++) {
      uv.add(new THREE.Vector2().fromBufferAttribute(uvs, key * 4 + corner));
      point.add(new THREE.Vector3().fromBufferAttribute(positions, key * 4 + corner));
    }
    if (uv.multiplyScalar(0.25).distanceTo(drawnUv) >= 1e-7) continue;
    index = key;
    legends.localToWorld(point.multiplyScalar(0.25));
    break;
  }
  assert.ok(index >= 0, `Legend ${text} must have an atlas quad`);
  const bounds = keyBounds[index];
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.hypot(center.x - point.x, center.z - point.z) < 1e-6, `Legend ${text} must align with its keycap`);
  return { text, index, size: bounds.getSize(new THREE.Vector3()) };
});
assert.equal(labelledKeys.length, keys.count - 1, 'Only the space bar may have no legend');
const letter = labelledKeys.find(({ text }) => text === 'A').size;
for (const text of ['Shift', 'Backspace', 'Enter', 'Tab', 'Caps']) {
  const matches = labelledKeys.filter((key) => key.text === text);
  assert.equal(matches.length, text === 'Shift' ? 2 : 1, `The keyboard must contain ${text}`);
  assert.ok(matches.every(({ size }) => size.x > letter.x * 1.4), `${text} must be wider than letter keys`);
}
for (let number = 1; number <= 12; number++) {
  const key = labelledKeys.find(({ text }) => text === `F${number}`);
  assert.ok(key && key.size.z < letter.z, `F${number} must be present in the compact function row`);
}
const widestKey = Math.max(...keyBounds.map((box) => box.max.x - box.min.x));
assert.ok(widestKey > letter.x * 5, 'The space bar must be a single wide key');
const target = laptop.screen.getWorldPosition(new THREE.Vector3());
const normal = laptop.screen.getWorldDirection(new THREE.Vector3());
const ray = new THREE.Raycaster(target.clone().addScaledVector(normal, 4), normal.clone().negate());
assert.equal(ray.intersectObjects(scene.children, true)[0]?.object, laptop.screen, 'The visible screen must be clickable');
ray.set(target.clone().addScaledVector(normal, -4), normal.clone());
assert.notEqual(ray.intersectObjects(scene.children, true)[0]?.object, laptop.screen, 'The back of the lid must block screen clicks');

for (const u of [0.01, 0.5, 0.99]) {
  for (const v of [0.01, 0.5, 0.99]) {
    const { width, height } = laptop.screen.geometry.parameters;
    const point = laptop.screen.localToWorld(new THREE.Vector3((u - 0.5) * width, (v - 0.5) * height, 0));
    ray.set(point.addScaledVector(normal, 4), normal.clone().negate());
    const hit = ray.intersectObjects(scene.children, true)[0];
    assert.equal(hit?.object, laptop.screen);
    assert.ok(hit.uv.distanceTo(new THREE.Vector2(u, v)) < 1e-6, 'Screen UVs must remain usable for future desktop interactions');
  }
}
assert.ok(drawnLabels.some(({ text }) => text === 'venxe'), 'The screen must draw the desktop brand');
assert.equal(drawnLabels.length, labelledKeys.length + 1, 'Only keyboard legends and the desktop brand may be drawn');
const texture = laptop.screen.material.map;
assert.equal(texture.image.width, 1200);
assert.equal(texture.image.height, 720);
assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
for (const group of [laptop.group, coffee.group]) {
  const bottom = new THREE.Box3().setFromObject(group).min.y;
  assert.ok(bottom >= 0 && bottom < 0.005, 'Models must sit just above the floor without intersecting it');
}

assert.deepEqual(laptop.ports.map(({ id, type }) => [id, type]), [
  ['power-left', 'power'], ['usb-c-left', 'usb-c'], ['usb-a-left', 'usb-a'],
  ['ethernet-right', 'ethernet'], ['usb-a-right', 'usb-a'],
], 'The agreed five empty ports must be exposed to future accessories');
const shell = ['laptop-deck', 'laptop-bottom', 'body-seam', 'body-left-wall', 'body-right-wall',
  'body-front-wall', 'body-back-wall', 'body-corners'].map((name) => laptop.group.getObjectByName(name));
const portRay = new THREE.Raycaster();
portRay.far = 0.15;
for (const { id, type, group, anchor } of laptop.ports) {
  assert.equal(anchor.parent, group, 'Attachment anchors must move with their own port');
  assert.equal(anchor.children.length, 0, 'Ports must start without attached accessories');
  const outward = anchor.getWorldDirection(new THREE.Vector3());
  assert.ok(outward.distanceTo(new THREE.Vector3(id.endsWith('left') ? -1 : 1, 0, 0)) < 1e-7, 'Anchor +Z must face outward');
  const offset = type === 'power' ? [0.018, 0] : type === 'usb-c' ? [0.038, 0] : type === 'usb-a' ? [0.048, 0.014] : [0, 0.035];
  const mouth = anchor.localToWorld(new THREE.Vector3(...offset, 0));
  portRay.set(mouth.clone().addScaledVector(outward, 0.025), outward.clone().negate());
  assert.equal(portRay.intersectObjects(shell, false).length, 0, `${id} must have a real opening through the chassis`);
  assert.ok(portRay.intersectObject(group, true).length > 0, `${id} must have recessed socket geometry`);
}
const ethernetPort = laptop.ports.find(({ type }) => type === 'ethernet');
const jaw = ethernetPort.group.getObjectByName('ethernet-jaw');
assert.equal(jaw.rotation.x, 0, 'The empty Ethernet jaw must start closed');
jaw.rotation.x = 0.5;
scene.updateMatrixWorld(true);
assert.ok(new THREE.Box3().setFromObject(jaw).min.y >= 0, 'An opened Ethernet jaw must clear the floor');
const outward = ethernetPort.anchor.getWorldDirection(new THREE.Vector3());
const lowerMouth = ethernetPort.anchor.localToWorld(new THREE.Vector3(0, -0.05, 0));
portRay.set(lowerMouth.clone().addScaledVector(outward, 0.012), outward.clone().negate());
portRay.far = 0.02;
assert.equal(portRay.intersectObjects([...shell, jaw], true).length, 0, 'Opening the jaw must clear the full-height mouth, including the bottom plate');
jaw.rotation.x = 0;
scene.updateMatrixWorld(true);

const grille = laptop.group.getObjectByName('cooling-grille');
const grilleOrigin = laptop.group.localToWorld(new THREE.Vector3(0.006, 0, -1.035));
grilleOrigin.y = new THREE.Box3().setFromObject(grille).max.y + 0.02;
const grilleRay = new THREE.Raycaster(grilleOrigin, new THREE.Vector3(0, -1, 0), 0, 0.03);
assert.equal(grilleRay.intersectObjects([shell[0], grille], false).length, 0, 'A cooling pore must pass through both the grille and the deck');
grilleRay.ray.origin.x = laptop.group.position.x;
assert.ok(grilleRay.intersectObject(grille).length > 0, 'Metal must remain between cooling pores');
assert.equal(laptop.group.getObjectByName('rubber-feet').count, 4);
assert.equal(laptop.group.getObjectByName('bottom-screws').count, 6);
const frontHeight = new THREE.Box3().setFromObject(laptop.group.getObjectByName('body-front-wall')).getSize(new THREE.Vector3()).y;
assert.ok(frontHeight < 0.085, 'The lower chassis must retain its slim side profile');
const deckBottom = new THREE.Box3().setFromObject(shell[0]).min.y;
const bodyBottom = new THREE.Box3().setFromObject(shell[1]).max.y;
for (const port of laptop.ports.filter(({ type }) => type !== 'ethernet')) {
  const bounds = new THREE.Box3().setFromObject(port.group);
  assert.ok(bounds.min.y >= bodyBottom && bounds.max.y <= deckBottom, `${port.id} must fit between the thinner chassis plates`);
}

const { webcam } = laptop;
const cover = webcam.group.getObjectByName('camera-cover');
const lens = webcam.group.getObjectByName('camera-lens');
const webcamVisuals = [];
laptop.group.traverse((object) => { if (object.isMesh && object !== webcam.hitArea) webcamVisuals.push(object); });
function visibleCamera() {
  scene.updateMatrixWorld(true);
  const center = lens.getWorldPosition(new THREE.Vector3());
  const front = lens.getWorldDirection(new THREE.Vector3());
  return new THREE.Raycaster(center.clone().addScaledVector(front, 1), front.negate()).intersectObjects(webcamVisuals, false)[0]?.object;
}
assert.equal(webcam.closed, false, 'The camera must start open');
assert.equal(visibleCamera(), lens, 'The open cover must reveal the lens');
assert.equal(webcam.update(1, false), false, 'An idle shutter must not update');
assert.equal(webcam.group.getObjectByName('camera-indicator').material.emissive.getHex(), 0, 'The indicator must remain unlit');
webcam.setClosed(true);
assert.equal(webcam.update(0, false), false, 'Starting an animation must not refresh unchanged geometry');
webcam.update(0.09, false);
assert.ok(cover.position.x > -0.035 && cover.position.x < 0, 'The cover must slide gradually');
const halfway = cover.position.x;
webcam.setClosed(false);
assert.equal(cover.position.x, halfway, 'Reversing must not jump the cover');
webcam.update(0.18, false);
assert.equal(visibleCamera(), lens, 'Reversal must reopen the camera');
webcam.setClosed(true);
webcam.update(0, true);
assert.equal(cover.position.x, 0, 'Reduced motion must finish the cover immediately');
assert.equal(visibleCamera()?.name, 'camera-cover-panel', 'The closed cover must physically block the lens');
assert.equal(webcam.update(0.05, false), false, 'A settled shutter must stay idle');
webcam.setClosed(false);
webcam.update(0.18, false);

const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), new THREE.MeshBasicMaterial());
blocker.position.copy(target).addScaledVector(normal, 1);
scene.add(blocker);
scene.updateMatrixWorld(true);
ray.set(target.clone().addScaledVector(normal, 4), normal.clone().negate());
assert.equal(ray.intersectObjects(scene.children, true)[0]?.object, blocker, 'An object in front of the screen must intercept the click');

const restingMatrices = keys.instanceMatrix.array.slice();
const restingLegends = legends.geometry.attributes.position.array.slice();
const restingUvs = legends.geometry.attributes.uv.array.slice();
const legendTextureVersion = legends.material.map.version;
const aIndex = labelledKeys.find(({ text }) => text === 'A').index;
function keyOffset(index) {
  keys.getMatrixAt(index, matrix);
  return restingMatrices[index * 16 + 13] - matrix.elements[13];
}
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} vs ${expected}`);
}
function atRest() {
  assert.deepEqual(keys.instanceMatrix.array, restingMatrices, 'All keycaps must return exactly to rest');
  assert.deepEqual(legends.geometry.attributes.position.array, restingLegends, 'All legends must return exactly to rest');
}
const { keyboard } = laptop;
assert.equal(keyboard.update(0.05, false), false, 'An idle keyboard must not upload geometry');
keyboard.setPressed('KeyA', true);
assert.equal(keyboard.update(0.045, false), true);
near(keyOffset(aIndex), 0.012, 'A must depress');
for (let index = 0; index < keys.count; index++) {
  if (index !== aIndex) near(keyOffset(index), 0, 'Unpressed keycaps must stay still');
  for (let corner = 0; corner < 4; corner++) {
    near(-legends.geometry.attributes.position.getZ(index * 4 + corner), keyOffset(index), 'Legends must follow their keycaps');
  }
}
keyboard.setPressed('KeyA', true);
assert.equal(keyboard.update(1, false), false, 'Held or repeated keys must stay depressed without geometry uploads');
keyboard.setPressed('KeyA', false);
keyboard.update(0.045, false);
near(keyOffset(aIndex), 0.006, 'Released keys must rise gradually');
keyboard.update(0.045, false);
atRest();

keyboard.setPressed('KeyA', true);
keyboard.setPressed('KeyA', false);
keyboard.update(0.0225, false);
near(keyOffset(aIndex), 0.006, 'A tap before a frame must still begin a downward stroke');
keyboard.update(0.0225, false);
near(keyOffset(aIndex), 0.012, 'A short tap must finish its downward stroke');
keyboard.update(0.09, false);
atRest();

const leftShift = labelledKeys.filter(({ text }) => text === 'Shift')[0].index;
const rightShift = labelledKeys.filter(({ text }) => text === 'Shift')[1].index;
keyboard.setPressed('ShiftLeft', true);
keyboard.setPressed('ShiftRight', true);
keyboard.setPressed('KeyI', true);
keyboard.update(0.045, false);
for (const index of [leftShift, rightShift, labelledKeys.find(({ text }) => text === 'I').index]) near(keyOffset(index), 0.012, 'Simultaneous physical keys must depress independently');
keyboard.setPressed('ShiftRight', false);
keyboard.update(0.09, false);
near(keyOffset(leftShift), 0.012, 'Releasing right Shift must preserve left Shift');
near(keyOffset(rightShift), 0, 'Right Shift must release independently');
keyboard.reset();
atRest();

for (const [code, label, occurrence] of [
  ['Digit1', '1', 0], ['Equal', '=', 0], ['Quote', "'", 0], ['Space', null, 0],
  ['ArrowUp', '↑', 0], ['Escape', 'Esc', 0], ['Enter', 'Enter', 0],
  ['ControlLeft', 'Ctrl', 0], ['AltLeft', 'Alt', 0], ['AltRight', 'Alt', 1],
  ['MetaLeft', 'Cmd', 0], ['MetaRight', 'Cmd', 1], ['F12', 'F12', 0],
]) {
  const index = label === null ? keyBounds.findIndex((box) => box.max.x - box.min.x === widestKey) : labelledKeys.filter(({ text }) => text === label)[occurrence].index;
  keyboard.setPressed(code, true);
  assert.equal(keyboard.update(0, true), true, `${code} must work without animation in reduced motion`);
  near(keyOffset(index), 0.012, `${code} must map to the matching physical key`);
  assert.equal(keyboard.update(0.05, true), false);
  keyboard.setPressed(code, false);
  keyboard.update(0, true);
  atRest();
}
for (const code of ['Numpad1', 'NumpadEnter', 'ControlRight', 'IntlBackslash', undefined]) keyboard.setPressed(code, true);
assert.equal(keyboard.update(0.05, false), false, 'Keys absent from the model must be ignored');
keyboard.setPressed('KeyA', true);
keyboard.update(0.01, false);
keyboard.update(0, true);
near(keyOffset(aIndex), 0.012, 'Enabling reduced motion must finish a held press immediately');
keyboard.setPressed('KeyA', false);
keyboard.update(0, true);
atRest();
keyboard.setPressed('KeyA', true);
keyboard.update(0.01, false);
keyboard.reset();
assert.equal(keyboard.update(1, false), false, 'Reset must cancel animation as well as clear held keys');
atRest();
assert.deepEqual(legends.geometry.attributes.uv.array, restingUvs, 'Animation must preserve the label atlas UVs');
assert.equal(legends.material.map.version, legendTextureVersion, 'Animation must not upload the label texture');

console.log(`PASS: finite geometry; ${triangles.toLocaleString('en-US')} model triangles across ${meshes} meshes (not GPU draw-call measurements).`);
console.log('PASS: front screen hit, back-of-lid rejection, and foreground occlusion using the real Three.js raycaster.');
console.log('PASS: desktop shell, display texture, screen UV mapping, and grounded models.');
console.log('PASS: staggered keyboard legends, wide modifier/space keys, F1-F12, and non-overlapping keycaps.');
console.log('PASS: synchronized keycaps/legends, physical key mapping, holds, short taps, simultaneous keys, reduced motion, reset, and idle upload budget.');
console.log('PASS: real port/grille openings, five empty attachment anchors, recessed sockets, Ethernet jaw/floor clearance, feet and screws, and camera cover occlusion/reversal/reduced motion.');
console.log('NOT CHECKED: WebGL shaders, canvas pixels, browser interaction, accessibility rendering, or FPS.');
