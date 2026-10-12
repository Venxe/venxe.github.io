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
const drawnText = [];
const drawnLabels = [];
const context = new Proxy({}, { get: (_, key) => {
  if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (key === 'fillText') return (text, x, y) => {
    drawnText.push(text);
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
  const point = legends.localToWorld(new THREE.Vector3(
    (x / legends.material.map.image.width - 0.5) * legends.geometry.parameters.width,
    (0.5 - y / legends.material.map.image.height) * legends.geometry.parameters.height, 0));
  const bounds = keyBounds.find((box) => {
    const center = box.getCenter(new THREE.Vector3());
    return Math.hypot(center.x - point.x, center.z - point.z) < 1e-6;
  });
  assert.ok(bounds, `Legend ${text} must align with its keycap`);
  return { text, size: bounds.getSize(new THREE.Vector3()) };
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
assert.ok(drawnText.includes('venxe'), 'The screen must draw the desktop brand');
assert.ok(!drawnText.includes('Tema') && !drawnText.includes('Geri'), 'The desktop must not draw the previous action cards');
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
console.log(`PASS: finite geometry; ${triangles.toLocaleString('en-US')} model triangles across ${meshes} meshes (not GPU draw-call measurements).`);
console.log('PASS: front screen hit, back-of-lid rejection, and foreground occlusion using the real Three.js raycaster.');
console.log('PASS: desktop shell, display texture, screen UV mapping, and grounded models.');
console.log('PASS: staggered keyboard legends, wide modifier/space keys, F1-F12, and non-overlapping keycaps.');
console.log('NOT CHECKED: WebGL shaders, canvas pixels, browser interaction, accessibility rendering, or FPS.');
