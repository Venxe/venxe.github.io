import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// CPU construction and buffer storage, not browser FPS or total GPU memory.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return nextResolve(new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, context);
  if (specifier.startsWith('three/addons/')) return nextResolve(new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
const THREE = await import('three');
const { createLaptopBody } = await import(pathToFileURL(resolve(process.env.PERF_SITE_ROOT || '.', 'src/laptop-details.js')).href);
const samples = [];
let grilleBytes = 0, grilleTriangles = 0;
for (let i = 0; i < 6; i++) {
  const at = performance.now();
  const body = createLaptopBody(0.0475, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
  samples.push(performance.now() - at);
  if (i === 0) body.group.getObjectByName('cooling-grille').traverse(object => {
    if (!object.geometry) return;
    for (const attribute of Object.values(object.geometry.attributes)) grilleBytes += attribute.array.byteLength;
    grilleBytes += object.geometry.index?.array.byteLength || 0;
    grilleBytes += object.instanceMatrix?.array.byteLength || 0;
    grilleTriangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 * (object.count || 1);
  });
  const geometries = new Set(), materials = new Set();
  body.group.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
console.log(JSON.stringify({ node: process.version, bodyConstructionMs: samples, grilleBytes, grilleTriangles }, null, 2));
