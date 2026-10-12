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
const drawnAreas = [];
const context = new Proxy({}, { get: (_, key) => {
  if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (key === 'roundRect') return (...area) => drawnAreas.push(area);
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
const target = laptop.screen.getWorldPosition(new THREE.Vector3());
const normal = laptop.screen.getWorldDirection(new THREE.Vector3());
const ray = new THREE.Raycaster(target.clone().addScaledVector(normal, 4), normal.clone().negate());
assert.equal(ray.intersectObjects(scene.children, true)[0]?.object, laptop.screen, 'The visible screen must be clickable');
ray.set(target.clone().addScaledVector(normal, -4), normal.clone());
assert.notEqual(ray.intersectObjects(scene.children, true)[0]?.object, laptop.screen, 'The back of the lid must block screen clicks');

const uvAt = (x, y) => new THREE.Vector2(x / 1200, 1 - y / 720);
assert.equal(laptop.actionAt(uvAt(472, 600)), null, 'Hidden screen actions must be inactive');
laptop.drawScreen(0, true);
assert.equal(drawnAreas.length, 2, 'The screen must draw only two action areas');
for (const [index, [x, y, width, height]] of drawnAreas.entries()) {
  const action = ['theme', 'back'][index];
  for (const [px, py] of [[x + width / 2, y + height / 2], [x + 1, y + 1], [x + width - 1, y + height - 1]]) {
    const uv = uvAt(px, py);
    const point = laptop.screen.localToWorld(new THREE.Vector3((uv.x - 0.5) * 3.29, (uv.y - 0.5) * 1.974, 0));
    ray.set(point.addScaledVector(normal, 4), normal.clone().negate());
    const hit = ray.intersectObjects(scene.children, true)[0];
    assert.equal(hit?.object, laptop.screen);
    assert.equal(laptop.actionAt(hit.uv), action, 'Raycast UVs must select the drawn action, including the vertical flip');
  }
  assert.equal(laptop.actionAt(uvAt(x - 2, y + height / 2)), null, 'Outside an action must do nothing');
  assert.equal(laptop.actionAt(uvAt(x + width / 2, y - 2)), null, 'Above an action must do nothing');
  assert.equal(laptop.actionAt(uvAt(x + width / 2, y + height + 2)), null, 'Below an action must do nothing');
}
assert.equal(laptop.actionAt(uvAt(600, 600)), null, 'The gap between actions must do nothing');
assert.equal(laptop.actionAt(uvAt(472, 120)), null, 'The wallpaper must do nothing');
assert.equal(laptop.actionAt(null), null);
assert.equal(laptop.actionAt({ x: NaN, y: 0 }), null);
laptop.drawScreen(1, false);
assert.equal(laptop.actionAt(uvAt(472, 600)), null, 'Leaving focus must deactivate screen actions');

const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), new THREE.MeshBasicMaterial());
blocker.position.copy(target).addScaledVector(normal, 1);
scene.add(blocker);
scene.updateMatrixWorld(true);
ray.set(target.clone().addScaledVector(normal, 4), normal.clone().negate());
assert.equal(ray.intersectObjects(scene.children, true)[0]?.object, blocker, 'An object in front of the screen must intercept the click');
console.log(`PASS: finite geometry; ${triangles.toLocaleString('en-US')} model triangles across ${meshes} meshes (not GPU draw-call measurements).`);
console.log('PASS: front screen hit, back-of-lid rejection, and foreground occlusion using the real Three.js raycaster.');
console.log('PASS: drawn screen actions, raycast UV mapping, blank areas, and inactive controls.');
console.log('NOT CHECKED: WebGL shaders, canvas pixels, browser interaction, accessibility rendering, or FPS.');
