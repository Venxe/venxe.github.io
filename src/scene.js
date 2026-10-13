import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLaptop } from './laptop.js';
import { createCoffee } from './coffee.js';
import { createSteam } from './steam.js';
import { SETTINGS } from './config.js';

const LID_PICK_RADIUS = 22;

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'application');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D workspace');
  renderer.domElement.setAttribute('aria-describedby', 'scene-help');
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--background').trim());
  scene.fog = new THREE.Fog(scene.background, 12, 32);
  const camera = new THREE.PerspectiveCamera(SETTINGS.fieldOfView, 1, 0.1, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = SETTINGS.minPolarAngle;
  controls.maxPolarAngle = SETTINGS.maxPolarAngle;
  controls.minDistance = SETTINGS.minSceneDistance;

  const environment = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentMap = generator.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.35;
  environment.dispose();
  generator.dispose();
  const mainLight = new THREE.DirectionalLight('#ffdfbf', 2.4);
  mainLight.position.set(-3, 7, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.normalBias = 0.015;
  mainLight.shadow.bias = -0.00015;
  scene.add(mainLight, mainLight.target);
  const fill = new THREE.DirectionalLight('#b7c9ef', 0.65);
  fill.position.set(4, 3, 1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#bcccf1', 1.4);
  rim.position.set(0, 5, -4);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#1c222d', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const laptop = createLaptop();
  const coffee = createCoffee();
  scene.add(laptop.group, coffee.group);
  const steam = createSteam(coffee.steamOrigin);
  scene.add(steam.points);
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const lidCenter = new THREE.Vector3();
  const hits = [];
  const selectableObjects = [laptop.group, coffee.group, floor];
  const initialDirection = new THREE.Vector3(3.8, 4.2, 8).normalize();
  const laptopBounds = new THREE.Box3().setFromObject(laptop.group);
  const modelBounds = laptopBounds.clone().union(new THREE.Box3().setFromObject(coffee.group));
  const homeTarget = modelBounds.getCenter(new THREE.Vector3());
  const corners = [];
  for (const x of [modelBounds.min.x, modelBounds.max.x]) {
    for (const y of [modelBounds.min.y, modelBounds.max.y]) {
      for (const z of [modelBounds.min.z, modelBounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const orientation = new THREE.Matrix4().lookAt(initialDirection, new THREE.Vector3(), camera.up);
  const viewRight = new THREE.Vector3().setFromMatrixColumn(orientation, 0);
  const viewUp = new THREE.Vector3().setFromMatrixColumn(orientation, 1);
  const offsets = corners.map((corner) => corner.clone().sub(homeTarget));
  const laptopTarget = laptopBounds.getCenter(new THREE.Vector3());
  const laptopDirection = new THREE.Vector3(0, Math.sin(SETTINGS.focusElevation), Math.cos(SETTINGS.focusElevation));
  const laptopUp = new THREE.Vector3(0, laptopDirection.z, -laptopDirection.y);
  const laptopFrame = [];
  // Preserve each mesh's orientation instead of framing empty world-box corners.
  laptop.group.traverseVisible((mesh) => {
    if (!mesh.isMesh || !mesh.material.visible) return;
    if (mesh.isInstancedMesh) mesh.computeBoundingBox();
    else mesh.geometry.computeBoundingBox();
    const bounds = mesh.isInstancedMesh ? mesh.boundingBox : mesh.geometry.boundingBox;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).sub(laptopTarget);
          laptopFrame.push(new THREE.Vector3(point.x, point.dot(laptopUp), point.dot(laptopDirection)));
        }
      }
    }
  });
  const frameBounds = new THREE.Box3().setFromPoints(laptopFrame);
  const screenCenter = laptop.screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = laptop.screen.getWorldDirection(new THREE.Vector3());
  const screenScene = new THREE.Scene();
  screenScene.background = scene.background;
  const desktop = new THREE.Mesh(laptop.screen.geometry, laptop.screen.material);
  desktop.name = laptop.screen.name;
  desktop.matrixAutoUpdate = false;
  desktop.matrix.copy(laptop.screen.matrixWorld);
  screenScene.add(desktop);
  let screenOnlyRendered = false;

  // Include each corner's projected ground shadow when fitting the static map.
  mainLight.target.position.copy(homeTarget);
  scene.updateMatrixWorld(true);
  mainLight.shadow.updateMatrices(mainLight);
  const shadowBounds = new THREE.Box3();
  const lightDirection = homeTarget.clone().sub(mainLight.position).normalize();
  for (const corner of corners) {
    shadowBounds.expandByPoint(corner.clone().applyMatrix4(mainLight.shadow.camera.matrixWorldInverse));
    const ground = corner.clone().addScaledVector(lightDirection, -corner.y / lightDirection.y);
    shadowBounds.expandByPoint(ground.applyMatrix4(mainLight.shadow.camera.matrixWorldInverse));
  }
  Object.assign(mainLight.shadow.camera, {
    left: shadowBounds.min.x - 0.35, right: shadowBounds.max.x + 0.35,
    bottom: shadowBounds.min.y - 0.35, top: shadowBounds.max.y + 0.35,
    near: Math.max(0.1, -shadowBounds.max.z - 0.5), far: -shadowBounds.min.z + 0.5,
  });
  mainLight.shadow.camera.updateProjectionMatrix();
  const gl = renderer.getContext();
  const maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
  let homeDistance = 9;

  function homePose() {
    const target = homeTarget.clone();
    return { target, position: target.clone().addScaledVector(initialDirection, homeDistance) };
  }
  function laptopPose(zoomRatio = 1) {
    const verticalFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontalFov = verticalFov * camera.aspect;
    const slopes = new THREE.Vector2(horizontalFov, verticalFov).multiplyScalar(SETTINGS.focusFrameRatio);
    const lower = new THREE.Vector2(Infinity, Infinity);
    const upper = new THREE.Vector2(-Infinity, -Infinity);
    for (const point of laptopFrame) {
      lower.x = Math.min(lower.x, point.x - slopes.x * point.z);
      lower.y = Math.min(lower.y, point.y - slopes.y * point.z);
      upper.x = Math.max(upper.x, point.x + slopes.x * point.z);
      upper.y = Math.max(upper.y, point.y + slopes.y * point.z);
    }
    // The tightest centered fit still has room for inward zoom before immersion.
    const distance = Math.max((upper.x - lower.x) / (2 * slopes.x), (upper.y - lower.y) / (2 * slopes.y)) * zoomRatio / SETTINGS.focusMinRatio;
    const low = new THREE.Vector2(frameBounds.min.x, frameBounds.min.y);
    const high = new THREE.Vector2(frameBounds.max.x, frameBounds.max.y);
    // Perspective changes the silhouette's center as the camera gets closer.
    for (let i = 0; i < 24; i++) {
      const shift = low.clone().add(high).multiplyScalar(0.5);
      const min = new THREE.Vector2(Infinity, Infinity);
      const max = new THREE.Vector2(-Infinity, -Infinity);
      for (const point of laptopFrame) {
        const depth = distance - point.z;
        const x = (point.x - shift.x) / depth;
        const y = (point.y - shift.y) / depth;
        min.x = Math.min(min.x, x); max.x = Math.max(max.x, x);
        min.y = Math.min(min.y, y); max.y = Math.max(max.y, y);
      }
      if (min.x + max.x > 0) low.x = shift.x; else high.x = shift.x;
      if (min.y + max.y > 0) low.y = shift.y; else high.y = shift.y;
    }
    const target = laptopTarget.clone().add(new THREE.Vector3((low.x + high.x) / 2, 0, 0)).addScaledVector(laptopUp, (low.y + high.y) / 2);
    return { target, position: target.clone().addScaledVector(laptopDirection, distance) };
  }
  function screenPose() {
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const { width, height } = laptop.screen.geometry.parameters;
    // Fit every screen edge in both orientations, with a small clipping margin.
    const distance = Math.max(width / (2 * halfFov * camera.aspect), height / (2 * halfFov)) / SETTINGS.screenFitRatio;
    const target = screenCenter.clone();
    return { target, position: target.clone().addScaledVector(screenNormal, distance) };
  }
  function render(screenOnly = false) {
    if (screenOnlyRendered && !screenOnly) renderer.shadowMap.needsUpdate = true;
    screenOnlyRendered = screenOnly;
    renderer.render(screenOnly ? screenScene : scene, camera);
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, SETTINGS.maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    const verticalFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontalFov = verticalFov * camera.aspect;
    // Leave 15% breathing room in both axes, including narrow portrait screens.
    homeDistance = Math.max(SETTINGS.minSceneDistance / SETTINGS.focusEnterRatio + 0.1, ...offsets.map((offset) =>
      offset.dot(initialDirection) + Math.max(Math.abs(offset.dot(viewRight)) / horizontalFov, Math.abs(offset.dot(viewUp)) / verticalFov) / 0.85));
    controls.maxDistance = homeDistance * 1.8;
    camera.far = Math.max(60, controls.maxDistance + 30);
    camera.updateProjectionMatrix();
    steam.resize(height, pixelRatio, camera, maxPointSize);
  }
  function pickAt(clientX, clientY) {
    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    camera.updateMatrixWorld();
    laptop.group.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    hits.length = 0;
    if (screenOnlyRendered) {
      raycaster.intersectObject(desktop, false, hits);
      return hits[0] ? { kind: 'screen', uv: hits[0].uv } : null;
    }
    raycaster.intersectObjects(selectableObjects, true, hits);
    const first = hits.find((hit) => hit.object !== laptop.webcam.hitArea && hit.object !== laptop.lid.hitArea);
    const lidHit = hits.find((hit) => hit.object === laptop.lid.hitArea);
    if (lidHit && (!first || first.distance >= lidHit.distance - 1e-6)) return { kind: 'lid' };
    if (!laptop.lid.closed && !laptop.lid.moving) {
      if (first?.object === laptop.screen) return { kind: 'screen', uv: first.uv };
      const coverHit = hits.find((hit) => hit.object === laptop.webcam.hitArea);
      // The hit area is only active on the front bezel; foreground objects still win.
      if (coverHit && (!first || first.distance >= coverHit.distance - 1e-6)) return { kind: 'webcam' };
    }
    // Pad the narrow notch in CSS pixels, but only while its center is visible.
    laptop.lid.hitArea.getWorldPosition(lidCenter).project(camera);
    if (lidCenter.z < -1 || lidCenter.z > 1 || Math.abs(lidCenter.x) > 1 || Math.abs(lidCenter.y) > 1) return null;
    const lidX = bounds.left + (lidCenter.x + 1) * bounds.width / 2;
    const lidY = bounds.top + (1 - lidCenter.y) * bounds.height / 2;
    if (Math.hypot(clientX - lidX, clientY - lidY) > LID_PICK_RADIUS) return null;
    pointer.set(lidCenter.x, lidCenter.y);
    raycaster.setFromCamera(pointer, camera);
    hits.length = 0;
    raycaster.intersectObjects(selectableObjects, true, hits);
    const visibleHit = hits.find((hit) => hit.object !== laptop.webcam.hitArea);
    return visibleHit?.object === laptop.lid.hitArea ? { kind: 'lid' } : null;
  }
  function screenSize() {
    const bounds = renderer.domElement.getBoundingClientRect();
    const { width, height } = laptop.screen.geometry.parameters;
    camera.updateMatrixWorld();
    laptop.screen.updateWorldMatrix(true, false);
    const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, y]) => {
      const point = laptop.screen.localToWorld(new THREE.Vector3(x * width / 2, y * height / 2, 0)).project(camera);
      return new THREE.Vector2(point.x * bounds.width / 2, point.y * bounds.height / 2);
    });
    return { width: Math.min(corners[0].distanceTo(corners[1]), corners[2].distanceTo(corners[3])),
      height: Math.min(corners[0].distanceTo(corners[2]), corners[1].distanceTo(corners[3])) };
  }
  function dispose() {
    renderer.setAnimationLoop(null);
    controls.dispose();
    laptop.desktop.dispose();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.isPointLight) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture && value !== environmentMap.texture) textures.add(value);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    mainLight.shadow.dispose();
    environmentMap.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  resize();
  controls.target.copy(homeTarget);
  camera.position.copy(homePose().position);
  controls.update();
  renderer.shadowMap.needsUpdate = true;
  return { renderer, scene, camera, controls, steam, keyboard: laptop.keyboard, webcam: laptop.webcam, lid: laptop.lid, desktop: laptop.desktop, homePose, laptopPose, screenPose, screenSize, render, resize, pickAt, dispose };
}
