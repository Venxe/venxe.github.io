import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createElement, createDesktopControls, TestImage } from './test-dom.mjs';

export const background = (await readFile(new URL('../styles.css', import.meta.url), 'utf8')).match(/--background:\s*([^;]+)/)[1];

// Replace only browser/GPU boundaries. All application modules and OrbitControls run unchanged.
const threeUrl = new URL('../vendor/three/build/three.module.min.js', import.meta.url).href;
const rendererUrl = new URL('./test-renderer.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: rendererUrl, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return nextResolve(new URL(`../vendor/three/addons/${specifier.slice('three/addons/'.length)}`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === rendererUrl) return { format: 'module', shortCircuit: true, source: `
      export * from '${threeUrl}';
      import { Texture } from '${threeUrl}';
      export class WebGLRenderer {
        constructor(options) {
          const renderer = globalThis.interactionRenderer;
          renderer.options = options;
          return renderer;
        }
      }
      export class PMREMGenerator {
        fromScene() {
          const texture = new Texture();
          return { texture, dispose() { texture.dispose(); } };
        }
        dispose() {}
      }
    ` };
    return nextLoad(url, context);
  },
});

export const THREE = await import('three');
const { start } = await import('../src/main.js');
globalThis.Image = TestImage;
const clockStart = new Date(2026, 9, 13, 13, 45).getTime();
export const VIEWPORTS = [[1920, 1080], [1440, 900], [2560, 1080], [390, 844], [844, 390], [320, 568]];
export let wallTime = clockStart;
Date.now = () => wallTime;
export function setWallTime(time) { wallTime = time; }

export function send(target, type, properties = {}) {
  const { timeStamp, ...values } = properties;
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
  return event;
}

// Node EventTarget does not order capture listeners before bubble listeners.
class CanvasTarget extends EventTarget {
  capture = new EventTarget();
  addEventListener(type, listener, options) {
    if (options?.capture) this.capture.addEventListener(type, listener, options);
    else super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    if (options?.capture) this.capture.removeEventListener(type, listener, options);
    else super.removeEventListener(type, listener, options);
  }
  dispatchEvent(event) {
    this.capture.dispatchEvent(event);
    return event.cancelBubble ? !event.defaultPrevented : super.dispatchEvent(event);
  }
}

export function setup(width, height, reduceMotion = true) {
  wallTime = clockStart;
  const document = Object.assign(new EventTarget(), { hidden: false, createElement });
  const canvas = Object.assign(new CanvasTarget(), {
    tagName: 'CANVAS',
    style: {}, getRootNode: () => document, focus() { document.activeElement?.dispatchEvent?.(new Event('blur')); document.activeElement = this; },
    setAttribute() {}, setPointerCapture() {}, releasePointerCapture() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  });
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const elements = new Map(['scene', 'hint', 'announcement', 'loading', 'masthead'].map((id) => [id, createElement('div')]));
  for (const id of ['camera-cover-toggle', 'laptop-lid-toggle', 'laptop-power']) {
    const button = createElement('button');
    button.setAttribute('aria-pressed', 'false');
    button.setPointerCapture = () => {};
    elements.set(id, button);
  }
  Object.assign(elements.get('scene'), { append() {}, getBoundingClientRect: canvas.getBoundingClientRect });
  elements.set('desktop-controls', createDesktopControls());
  document.querySelector = (selector) => elements.get(selector.slice(1)) || null;
  globalThis.document = document;
  globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 3 });
  const window = globalThis.window;
  const preference = Object.assign(new EventTarget(), { matches: reduceMotion });
  globalThis.matchMedia = () => preference;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => background });
  let resizeCallback;
  globalThis.ResizeObserver = class {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    disconnect() {}
  };
  const renderer = {
    domElement: canvas, shadowMap: {}, loop: null,
    setPixelRatio(ratio) { this.pixelRatio = ratio; }, setSize() {}, dispose() { this.disposed = true; },
    getContext: () => ({ ALIASED_POINT_SIZE_RANGE: 0, getParameter: () => [1, 128] }),
    setAnimationLoop(loop) { this.loop = loop; },
    render(scene, camera) {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      this.scene = scene;
      this.camera = camera;
    },
  };
  globalThis.interactionRenderer = renderer;
  const errors = [];
  start((message) => errors.push(message));
  let time = 0;
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { wallTime += 50; renderer.loop?.(time += 50); } };
  const keyDown = (value, repeat = false) => {
    const event = send(canvas, 'keydown', { key: value, repeat });
    if (!event.cancelBubble) document.dispatchEvent(event);
    return event;
  };
  const keyUp = (value) => send(document, 'keyup', { key: value });
  const key = (value) => { const event = keyDown(value); keyUp(value); return event; };
  const wheel = (deltaY, deltaMode = 0) => send(canvas, 'wheel', { deltaY, deltaMode, timeStamp: time, clientX: width / 2, clientY: height / 2 });
  const pointer = (type, x, y, id = 1, pointerType = 'mouse') => send(canvas, type, { clientX: x, clientY: y, pageX: x, pageY: y, pointerId: id, pointerType, button: 0, timeStamp: time });
  tick();
  const workspace = renderer.scene;
  const screen = renderer.scene.getObjectByName('laptop-screen');
  assert.ok(screen, 'The rendered scene must contain the laptop screen');
  const projectPoint = (object, localPoint = new THREE.Vector3()) => {
    workspace.updateMatrixWorld(true);
    renderer.camera.updateMatrixWorld();
    const point = object.localToWorld(localPoint).project(renderer.camera);
    return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
  };
  const screenPoint = (u, v) => {
    const { width: screenWidth, height: screenHeight } = screen.geometry.parameters;
    return projectPoint(screen, new THREE.Vector3((u - 0.5) * screenWidth, (v - 0.5) * screenHeight, 0));
  };
  const click = (u, v) => {
    const [x, y] = screenPoint(u, v);
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  };
  const pinch = (scale) => {
    const x = width / 2;
    const y = height / 2;
    const endX = x - 30 + 60 * scale;
    pointer('pointerdown', x - 30, y, 1, 'touch');
    pointer('pointerdown', x + 30, y, 2, 'touch');
    pointer('pointermove', endX, y, 2, 'touch');
    tick();
    pointer('pointerup', endX, y, 2, 'touch');
    pointer('pointerup', x - 30, y, 1, 'touch');
  };
  return { renderer, workspace, screen, elements, document, window, canvas, preference, errors, tick, key, keyDown, keyUp, wheel, pointer, click, pinch, projectPoint, screenPoint,
    get camera() { return renderer.camera; },
    get mode() { return elements.get('scene').getAttribute('data-view-mode'); },
    get focused() { return this.mode !== 'free'; },
    resize(w, h) { width = w; height = h; resizeCallback(); },
    close() { send(window, 'pagehide', { persisted: false }); },
  };
}

export function samePose(test, position, rotation) {
  assert.ok(test.camera.position.distanceTo(position) < 1e-8, 'Return must restore the saved camera position');
  assert.ok(test.camera.quaternion.angleTo(rotation) < 1e-7, 'Return must restore the saved viewing direction');
}

export function framedLaptop(test) {
  assert.equal(test.mode, 'laptop');
  test.camera.updateMatrixWorld();
  let group = test.screen;
  while (group.parent !== test.workspace) group = group.parent;
  const outline = new THREE.Box2();
  const instance = new THREE.Matrix4();
  group.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || !mesh.material.visible) return;
    const vertices = mesh.geometry.attributes.position;
    for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
      if (mesh.isInstancedMesh) mesh.getMatrixAt(i, instance);
      for (let j = 0; j < vertices.count; j++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, j);
        if (mesh.isInstancedMesh) point.applyMatrix4(instance);
        point.applyMatrix4(mesh.matrixWorld).project(test.camera);
        assert.ok(point.z > -1 && point.z < 1, 'The laptop must stay inside the camera clipping planes');
        outline.expandByPoint(new THREE.Vector2(point.x, point.y));
      }
    }
  });
  const center = outline.getCenter(new THREE.Vector2());
  const viewport = test.canvas.getBoundingClientRect();
  // Rounded surfaces can sit slightly inside their mesh bounds.
  assert.ok(Math.abs(center.x) * viewport.width / 2 <= 2 && Math.abs(center.y) * viewport.height / 2 <= 2, `Visible laptop margins must be centered within two CSS pixels; center=${center.toArray()}`);
  const size = outline.getSize(new THREE.Vector2());
  assert.ok(Math.max(size.x, size.y) >= 1.76, 'Laptop focus must fill at least 88% of the limiting viewport axis');
  assert.ok(Math.max(Math.abs(outline.min.x), Math.abs(outline.min.y), Math.abs(outline.max.x), Math.abs(outline.max.y)) <= 0.985, 'The whole laptop must remain visible while zooming toward fullscreen');
  const direction = test.camera.getWorldDirection(new THREE.Vector3());
  const elevation = THREE.MathUtils.radToDeg(Math.asin(-direction.y));
  assert.ok(Math.abs(direction.x) < 1e-8 && elevation >= 12 && elevation <= 18, 'Laptop focus must use a low front angle like a seated user');
}

export function fullscreenScreen(test) {
  assert.equal(test.mode, 'screen');
  test.camera.updateMatrixWorld();
  const point = test.screen.getWorldPosition(new THREE.Vector3()).project(test.camera);
  assert.ok(Math.abs(point.x) < 1e-8 && Math.abs(point.y) < 1e-8, 'Screen view must center the entire desktop on both axes');
  const normal = test.screen.getWorldDirection(new THREE.Vector3());
  assert.ok(test.camera.getWorldDirection(new THREE.Vector3()).dot(normal) < -0.999999, 'Focus must face the screen');
  const { width, height } = test.screen.geometry.parameters;
  const barCenter = test.screen.localToWorld(new THREE.Vector3(-width / 2 + width * 30 / test.screen.material.map.image.width, 0, 0)).project(test.camera);
  assert.ok(barCenter.x > -1 && barCenter.x < 1, 'The left shell bar must remain visible in fullscreen');
  const bounds = new THREE.Box2();
  for (const x of [-width / 2, width / 2]) {
    for (const y of [-height / 2, height / 2]) {
      const corner = test.screen.localToWorld(new THREE.Vector3(x, y, 0)).project(test.camera);
      assert.ok(Math.abs(corner.x) <= 0.990001 && Math.abs(corner.y) <= 0.990001 && corner.z > -1 && corner.z < 1, 'Every screen corner, including the bottom and sides, must fit inside the viewport');
      bounds.expandByPoint(new THREE.Vector2(corner.x, corner.y));
    }
  }
  const size = bounds.getSize(new THREE.Vector2());
  const viewport = test.canvas.getBoundingClientRect();
  assert.ok(Math.abs(size.x * viewport.width / (size.y * viewport.height) - 16 / 9) < 1e-6, 'The projected desktop must retain the 16:9 aspect ratio');
  assert.ok(Math.abs(Math.max(size.x, size.y) / 2 - 0.99) < 1e-6, 'Screen view must use 99% of the limiting viewport axis');
  assert.ok(Math.abs(size.x * viewport.width / (size.y * viewport.height) - test.screen.material.map.image.width / test.screen.material.map.image.height) < 1e-6, 'The whole desktop must preserve its original proportions');
  const displayed = test.renderer.scene.children;
  assert.equal(displayed.length, 1, 'Screen view must render only the desktop over a plain background');
  const desktop = displayed[0];
  assert.ok(desktop.isMesh, 'Screen view must render the existing desktop as a mesh');
  assert.equal(desktop.geometry, test.screen.geometry, 'Both views must share the display geometry');
  assert.equal(desktop.material, test.screen.material, 'Both views must share the display material and texture');
  assert.ok(desktop.matrixWorld.equals(test.screen.matrixWorld), 'Screen view must use the open display world transform');
  assert.equal(test.renderer.scene.background.getHexString(), test.workspace.background.getHexString(), 'Screen margins must use the existing dark background');
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(), test.camera);
  assert.equal(raycaster.intersectObjects(displayed, true)[0]?.object, desktop, 'The centered desktop must be the only rendered surface');
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), test.camera);
      assert.equal(raycaster.intersectObjects(displayed, true).length, 0, 'The viewport margins must show the background, not scene geometry');
    }
  }
  for (const id of ['masthead', 'hint', 'camera-cover-toggle', 'laptop-lid-toggle']) assert.equal(test.elements.get(id).hidden, true, 'Fullscreen must hide every HUD control');
}
