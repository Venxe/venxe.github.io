import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLaptop } from './laptop.js';
import { createCoffee } from './coffee.js';
import { createSteam } from './steam.js';
import { SETTINGS } from './config.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(SETTINGS.background);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '3D çalışma alanı. Sürükleyerek döndürün, kaydırarak yaklaşın. Klavyeyle ok tuşları ve artı eksi tuşlarını kullanın; laptopu Enter ile açın.');
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SETTINGS.background, 12, 30);
  const camera = new THREE.PerspectiveCamera(SETTINGS.fieldOfView, 1, 0.1, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = SETTINGS.minPolarAngle;
  controls.maxPolarAngle = SETTINGS.maxPolarAngle;
  controls.minDistance = 5;
  controls.target.fromArray(SETTINGS.sceneTarget);

  const environment = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentMap = generator.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.42;
  environment.dispose();
  generator.dispose();
  const mainLight = new THREE.DirectionalLight('#ffdfb6', 3.2);
  mainLight.position.set(-3, 7, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  Object.assign(mainLight.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 18 });
  mainLight.shadow.normalBias = 0.035;
  mainLight.shadow.bias = -0.0003;
  scene.add(mainLight);
  const fill = new THREE.DirectionalLight('#b8d3e7', 1.25);
  fill.position.set(4, 3, 1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#dbeac4', 2.3);
  rim.position.set(0, 5, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight('#d5dfcc', '#25241e', 0.55));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#161b17', roughness: 0.92 }));
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
  const initialDirection = new THREE.Vector3(4.6, 3.5, 7.8).normalize();
  const screenCenter = laptop.screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = laptop.screen.getWorldDirection(new THREE.Vector3());
  const gl = renderer.getContext();
  const maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
  let homeDistance = 9;

  function homePose() {
    const target = new THREE.Vector3().fromArray(SETTINGS.sceneTarget);
    return { target, position: target.clone().addScaledVector(initialDirection, homeDistance) };
  }
  function focusPose() {
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(3.7, 1.85 / (halfFov * camera.aspect));
    return { target: screenCenter.clone(), position: screenCenter.clone().addScaledVector(screenNormal, distance) };
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, SETTINGS.maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    homeDistance = Math.max(8.8, 3.55 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    controls.maxDistance = homeDistance * 1.8;
    steam.resize(height, pixelRatio, camera, maxPointSize);
  }
  function screenAt(clientX, clientY) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    hits.length = 0;
    raycaster.intersectObjects(selectableObjects, true, hits);
    return hits[0]?.object === laptop.screen;
  }
  function dispose() {
    renderer.setAnimationLoop(null);
    controls.dispose();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse((object) => {
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
  camera.position.copy(homePose().position);
  controls.update();
  renderer.shadowMap.needsUpdate = true;
  return { renderer, scene, camera, controls, laptop, steam, homePose, focusPose, resize, screenAt, dispose };
}
