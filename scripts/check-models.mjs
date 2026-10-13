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
console.log('NOT CHECKED: WebGL shaders, canvas pixels, browser interaction, accessibility rendering, or FPS.');
