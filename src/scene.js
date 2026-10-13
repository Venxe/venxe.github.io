import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLaptop } from './laptop.js';
import { createCoffee } from './coffee.js';
import { createSteam } from './steam.js';
import { SETTINGS } from './config.js';

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
  const hits = [];
  const selectableObjects = [laptop.group, coffee.group, floor];
  const initialDirection = new THREE.Vector3(3.8, 4.2, 8).normalize();
  const modelBounds = new THREE.Box3().setFromObject(laptop.group).union(new THREE.Box3().setFromObject(coffee.group));
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
  const screenCenter = laptop.screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = laptop.screen.getWorldDirection(new THREE.Vector3());

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
  function focusPose() {
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const { width, height } = laptop.screen.geometry.parameters;
    // Fit the enlarged screen even at the closest allowed focused zoom.
    const distance = Math.max(3.7, width / (2 * halfFov * camera.aspect * SETTINGS.focusMinRatio), height / (2 * halfFov * SETTINGS.focusMinRatio));
    return { target: screenCenter.clone(), position: screenCenter.clone().addScaledVector(screenNormal, distance) };
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
    raycaster.intersectObjects(selectableObjects, true, hits);
    const first = hits.find((hit) => hit.object !== laptop.webcam.hitArea && hit.object !== laptop.lid.hitArea);
    const lidHit = hits.find((hit) => hit.object === laptop.lid.hitArea);
    if (lidHit && (!first || first.distance >= lidHit.distance - 1e-6)) return { kind: 'lid' };
    if (laptop.lid.closed || laptop.lid.moving) return null;
    if (first?.object === laptop.screen) return { kind: 'screen', uv: first.uv };
    const coverHit = hits.find((hit) => hit.object === laptop.webcam.hitArea);
    // The hit area is only active on the front bezel; foreground objects still win.
    if (coverHit && (!first || first.distance >= coverHit.distance - 1e-6)) return { kind: 'webcam' };
    return null;
  }
  function dispose() {
    renderer.setAnimationLoop(null);
    controls.dispose();
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
  return { renderer, scene, camera, controls, steam, keyboard: laptop.keyboard, webcam: laptop.webcam, lid: laptop.lid, homePose, focusPose, resize, pickAt, dispose };
}
