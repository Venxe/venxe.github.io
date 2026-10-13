import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';

const background = (await readFile(new URL('../styles.css', import.meta.url), 'utf8')).match(/--background:\s*([^;]+)/)[1];

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

const THREE = await import('three');
const { start } = await import('../src/main.js');
const drawing = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });

function send(target, type, properties = {}) {
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

function setup(width, height, reduceMotion = true) {
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => ({ getContext: () => drawing }) });
  const canvas = Object.assign(new CanvasTarget(), {
    style: {}, getRootNode: () => document, focus() { document.activeElement = this; },
    setAttribute() {}, setPointerCapture() {}, releasePointerCapture() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  });
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const elements = new Map(['scene', 'hint', 'announcement', 'loading', 'masthead'].map((id) => {
    const attributes = new Map();
    return [id, { setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name); }, contains: () => false, textContent: '', hidden: false }];
  }));
  for (const id of ['camera-cover-toggle', 'laptop-lid-toggle']) {
    const attributes = new Map([['aria-pressed', 'false']]);
    elements.set(id, Object.assign(new EventTarget(), {
      disabled: false, hidden: false,
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
    }));
  }
  Object.assign(elements.get('scene'), { append() {}, getBoundingClientRect: canvas.getBoundingClientRect });
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
  const tick = (count = 1) => { for (let i = 0; i < count; i++) renderer.loop?.(time += 50); };
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
  const screen = renderer.scene.getObjectByName('laptop-screen');
  assert.ok(screen, 'The rendered scene must contain the laptop screen');
  const screenPoint = (u, v) => {
    renderer.camera.updateMatrixWorld();
    const { width: screenWidth, height: screenHeight } = screen.geometry.parameters;
    const point = screen.localToWorld(new THREE.Vector3((u - 0.5) * screenWidth, (v - 0.5) * screenHeight, 0)).project(renderer.camera);
    return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
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
  return { renderer, screen, elements, document, window, canvas, preference, errors, tick, key, keyDown, keyUp, wheel, pointer, click, pinch, screenPoint,
    get camera() { return renderer.camera; },
    get mode() { return elements.get('scene').getAttribute('data-view-mode'); },
    get focused() { return this.mode !== 'free'; },
    resize(w, h) { width = w; height = h; resizeCallback(); },
    close() { send(window, 'pagehide', { persisted: false }); },
  };
}

function samePose(test, position, rotation) {
  assert.ok(test.camera.position.distanceTo(position) < 1e-8, 'Return must restore the saved camera position');
  assert.ok(test.camera.quaternion.angleTo(rotation) < 1e-7, 'Return must restore the saved viewing direction');
}

function framedLaptop(test) {
  assert.equal(test.mode, 'laptop');
  test.camera.updateMatrixWorld();
  let group = test.screen;
  while (group.parent !== test.renderer.scene) group = group.parent;
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

function fullscreenScreen(test) {
  assert.equal(test.mode, 'screen');
  test.camera.updateMatrixWorld();
  const point = test.screen.getWorldPosition(new THREE.Vector3()).project(test.camera);
  assert.ok(Math.abs(point.x) < 1e-8, 'Fullscreen must keep the desktop horizontally centered');
  const normal = test.screen.getWorldDirection(new THREE.Vector3());
  assert.ok(test.camera.getWorldDirection(new THREE.Vector3()).dot(normal) < -0.999999, 'Focus must face the screen');
  const { width, height } = test.screen.geometry.parameters;
  const top = test.screen.localToWorld(new THREE.Vector3(0, height / 2, 0)).project(test.camera);
  assert.ok(top.y >= 1 && top.y <= 1.006, 'Fullscreen must anchor the top of the desktop at the viewport edge');
  const taskbarCenter = test.screen.localToWorld(new THREE.Vector3(0, height / 2 - height * 18 / test.screen.material.map.image.height, 0)).project(test.camera);
  assert.ok(taskbarCenter.y > -1 && taskbarCenter.y < 1, 'The top taskbar content must remain visible in fullscreen');
  for (const x of [-width / 2, width / 2]) {
    for (const y of [-height / 2, height / 2]) {
      const corner = test.screen.localToWorld(new THREE.Vector3(x, y, 0)).project(test.camera);
      assert.ok(Math.abs(corner.x) >= 1.004 && Math.abs(corner.y) >= 1.004, 'The desktop must cover the viewport in both axes');
    }
  }
  const raycaster = new THREE.Raycaster();
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), test.camera);
      const hit = raycaster.intersectObjects(test.renderer.scene.children, true).find((entry) => entry.object.isMesh && entry.object.material.visible);
      assert.equal(hit?.object, test.screen, 'Only desktop pixels must be visible at the viewport corners and center');
    }
  }
  for (const id of ['masthead', 'hint', 'camera-cover-toggle', 'laptop-lid-toggle']) assert.equal(test.elements.get(id).hidden, true, 'Fullscreen must hide every HUD control');
}

for (const [width, height] of [[1440, 900], [390, 844], [844, 390], [320, 568], [2560, 1080]]) {
  const test = setup(width, height);
  assert.equal(test.renderer.options.alpha, false, 'The studio canvas must be opaque');
  assert.equal(test.renderer.pixelRatio, 1.5, 'High-DPI devices must respect the pixel ratio budget');
  assert.equal(test.renderer.scene.background.getHexString(), new THREE.Color(background).getHexString(), 'Scene and CSS must share the backdrop color');
  const floor = test.renderer.scene.children.find((object) => object.geometry?.parameters?.width === 200);
  assert.ok(floor?.material.isMeshStandardMaterial && floor.receiveShadow, 'The matte floor must receive shadows');
  const lights = [];
  test.renderer.scene.traverse((object) => { if (object.isLight) lights.push(object); });
  assert.equal(lights.filter((light) => light.castShadow).length, 1, 'Only the key light may generate a shadow map');
  assert.ok(lights.some((light) => light.isPointLight && light.distance > 0 && !light.castShadow), 'The screen light must have limited range and no shadows');
  for (const group of test.renderer.scene.children.filter((object) => object.isGroup)) {
    const bounds = new THREE.Box3().setFromObject(group);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(test.camera);
          assert.ok(Math.abs(point.x) <= 0.851 && Math.abs(point.y) <= 0.851 && point.z > -1 && point.z < 1, 'The initial camera must frame both models with breathing room');
        }
      }
    }
  }
  const texture = test.screen.material.map;
  const textureVersion = texture.version;
  let textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  test.key('ArrowLeft');
  test.tick();
  let position;
  let rotation;
  for (let i = 0; i < 20 && !test.focused; i++) {
    position = test.camera.position.clone();
    rotation = test.camera.quaternion.clone();
    test.wheel(-120);
    test.tick();
  }
  assert.equal(test.focused, true, 'Zooming inward must focus the screen');
  framedLaptop(test);
  const focusPosition = test.camera.position.clone();
  assert.equal(test.document.activeElement, undefined, 'Automatic focus must not steal keyboard focus');
  test.wheel(120);
  test.tick();
  assert.equal(test.mode, 'laptop', 'The rest of the entry gesture must not leave laptop focus');
  assert.ok(test.camera.position.distanceTo(focusPosition) < 1e-8, 'Consumed wheel input must not move the camera');
  test.tick(5);
  test.wheel(-400);
  test.tick();
  fullscreenScreen(test);
  test.wheel(-120);
  test.tick();
  fullscreenScreen(test);
  test.tick(5);
  test.wheel(120);
  test.tick();
  framedLaptop(test);
  assert.ok(test.camera.position.distanceTo(focusPosition) < 1e-8, 'Leaving fullscreen must restore the initial laptop framing');
  test.wheel(240);
  test.tick();
  assert.equal(test.mode, 'laptop', 'One outward gesture must not skip the laptop stage');
  test.tick(5);
  test.wheel(120);
  test.tick();
  assert.equal(test.focused, false, 'Zooming outward must return to free view');
  for (const id of ['masthead', 'hint', 'camera-cover-toggle', 'laptop-lid-toggle']) assert.equal(test.elements.get(id).hidden, false, 'Leaving fullscreen must restore every HUD control');
  samePose(test, position, rotation);
  test.tick(3);
  assert.equal(test.focused, false, 'Return must not immediately refocus');

  test.click(0.5, 0.5);
  assert.equal(test.focused, true, 'Clicking the screen must focus it');
  const announcement = test.elements.get('announcement').textContent;
  const focusedPosition = test.camera.position.clone();
  for (const [u, v] of [[0.5, 0.5], [472 / 1200, 1 - 600 / 720], [728 / 1200, 1 - 600 / 720]]) test.click(u, v);
  test.key('ArrowLeft');
  test.key('ArrowRight');
  test.key('Enter');
  test.key(' ');
  test.tick();
  assert.equal(test.focused, true, 'Blank desktop clicks and keys must not exit focus');
  assert.equal(test.elements.get('announcement').textContent, announcement, 'Blank desktop input must not run hidden actions');
  assert.ok(test.camera.position.distanceTo(focusedPosition) < 1e-8, 'Blank desktop input must not move the camera');
  send(test.document, 'keydown', { key: 'Escape' });
  samePose(test, position, rotation);
  test.key('Enter');
  assert.equal(test.focused, true, 'Enter must still focus the screen');
  send(test.document, 'keydown', { key: 'Escape' });
  samePose(test, position, rotation);
  test.pinch(1.25);
  assert.equal(test.focused, true, 'A pinch inward must focus the screen');
  framedLaptop(test);
  test.pinch(1.25);
  fullscreenScreen(test);
  test.pinch(0.8);
  framedLaptop(test);
  test.pinch(0.8);
  assert.equal(test.focused, false, 'A pinch outward must return to free view');
  samePose(test, position, rotation);
  assert.equal(texture.version, textureVersion, 'The empty desktop texture must not be uploaded again during interactions');
  assert.ok(test.renderer.scene.fog.near > test.camera.position.distanceTo(test.screen.getWorldPosition(new THREE.Vector3())), 'Fog must start behind the models');
  test.key('Enter');
  test.tick();
  for (let i = 0; i < 6; i++) {
    test.key('+');
    test.tick();
  }
  fullscreenScreen(test);
  send(test.document, 'keydown', { key: 'Escape' });
  framedLaptop(test);
  send(test.document, 'keydown', { key: 'Escape' });
  samePose(test, position, rotation);
  test.close();
  assert.equal(textureDisposals, 1, 'The desktop texture must be disposed exactly once');
  assert.equal(test.renderer.disposed, true, 'Leaving the page must release the renderer');
}

const animated = setup(1440, 900, false);
const [x, y] = animated.screenPoint(0.5, 0.5);
animated.pointer('pointerdown', x, y);
animated.pointer('pointermove', x + 20, y);
animated.pointer('pointerup', x, y);
assert.equal(animated.focused, false, 'Dragging must not open the screen');
animated.pointer('pointerdown', x, y, 1, 'touch');
animated.pointer('pointerdown', x + 10, y, 2, 'touch');
animated.pointer('pointerup', x + 10, y, 2, 'touch');
animated.pointer('pointerup', x, y, 1, 'touch');
assert.equal(animated.focused, false, 'Multiple pointers must not click the screen');
animated.pointer('pointerdown', x, y);
animated.pointer('pointercancel', x, y);
animated.pointer('pointerup', x, y);
assert.equal(animated.focused, false, 'Cancelled pointers must not click the screen');
animated.tick(120);
const beforeFocus = animated.camera.position.clone();
const beforeRotation = animated.camera.quaternion.clone();
animated.key('Enter');
const transitionPosition = animated.camera.position.clone();
animated.wheel(120);
assert.ok(animated.camera.position.distanceTo(transitionPosition) < 1e-8, 'Wheel input must pause during a transition');
animated.tick(5);
animated.resize(390, 844);
animated.tick(20);
framedLaptop(animated);
animated.wheel(-120);
animated.tick();
framedLaptop(animated);
assert.equal(animated.focused, true);
animated.resize(844, 390);
animated.tick();
assert.equal(animated.focused, true, 'Resizing must not exit focus');
framedLaptop(animated);
animated.key('+');
animated.tick(5);
animated.resize(390, 844);
animated.tick(20);
fullscreenScreen(animated);
animated.resize(844, 390);
animated.tick();
fullscreenScreen(animated);
animated.key('-');
animated.tick(20);
framedLaptop(animated);
animated.key('-');
animated.tick(20);
samePose(animated, beforeFocus, beforeRotation);
animated.resize(390, 844);
animated.tick(3);
assert.equal(animated.focused, false, 'Resizing must not trigger automatic focus');
animated.key('+');
animated.tick();
assert.equal(animated.focused, true, 'Inward zoom must focus even when resize placed the camera inside the threshold');
animated.preference.matches = true;
send(animated.preference, 'change');
framedLaptop(animated);
const steam = animated.renderer.scene.children.find((object) => object.isPoints);
assert.equal(steam.visible, false, 'Reduced motion must hide the steam');
const steamTime = steam.material.uniforms.time.value;
animated.tick(10);
assert.equal(steam.material.uniforms.time.value, steamTime, 'Reduced motion must stop updating the steam');
animated.document.hidden = true;
send(animated.document, 'visibilitychange');
assert.equal(animated.renderer.loop, null, 'A hidden tab must stop the animation loop');
animated.document.hidden = false;
send(animated.document, 'visibilitychange');
assert.equal(typeof animated.renderer.loop, 'function', 'A visible tab must resume the animation loop');
animated.tick();
send(animated.canvas, 'webglcontextlost');
assert.equal(animated.errors.length, 1);
assert.equal(animated.renderer.loop, null, 'Context loss must stop rendering');
animated.close();

for (const reduced of [true, false]) {
  const gestures = setup(1440, 900, reduced);
  let savedPosition = gestures.camera.position.clone();
  const savedRotation = gestures.camera.quaternion.clone();
  gestures.key('Enter');
  gestures.tick(20);
  gestures.wheel(-100);
  gestures.tick();
  framedLaptop(gestures);
  gestures.wheel(-100);
  gestures.tick();
  assert.equal(gestures.mode, 'screen', 'Small wheel deltas must accumulate to enter fullscreen');
  gestures.tick(20);
  fullscreenScreen(gestures);
  gestures.wheel(120);
  gestures.tick();
  assert.equal(gestures.mode, 'laptop', 'A new outward gesture must leave fullscreen');
  for (let i = 0; i < 25; i++) {
    gestures.wheel(120);
    gestures.tick();
    assert.equal(gestures.mode, 'laptop', 'Wheel inertia must stay consumed after the transition finishes');
  }
  framedLaptop(gestures);
  gestures.tick(4);
  gestures.wheel(120);
  gestures.tick(20);
  samePose(gestures, savedPosition, savedRotation);

  gestures.keyDown('+');
  for (let i = 0; gestures.mode === 'free' && i < 20; i++) {
    savedPosition = gestures.camera.position.clone();
    gestures.keyDown('+', true);
  }
  gestures.tick(20);
  framedLaptop(gestures);
  for (let i = 0; i < 8; i++) gestures.keyDown('+', true);
  gestures.tick(20);
  framedLaptop(gestures);
  gestures.keyUp('+');
  gestures.keyDown('+');
  gestures.keyDown('+', true);
  gestures.tick(20);
  fullscreenScreen(gestures);
  gestures.keyUp('+');
  gestures.keyDown('-');
  gestures.tick(20);
  for (let i = 0; i < 8; i++) gestures.keyDown('-', true);
  gestures.tick(20);
  framedLaptop(gestures);
  gestures.keyUp('-');
  gestures.key('-');
  gestures.tick(20);
  samePose(gestures, savedPosition, savedRotation);

  gestures.key('Enter');
  gestures.tick(20);
  gestures.document.activeElement = gestures.elements.get('camera-cover-toggle');
  gestures.pointer('pointerdown', 700, 450, 1, 'touch');
  gestures.pointer('pointerdown', 760, 450, 2, 'touch');
  gestures.pointer('pointermove', 820, 450, 2, 'touch');
  gestures.tick(20);
  fullscreenScreen(gestures);
  assert.equal(gestures.document.activeElement, gestures.canvas, 'Hiding an active HUD control must move focus to the canvas');
  gestures.pointer('pointermove', 730, 450, 2, 'touch');
  gestures.tick(20);
  fullscreenScreen(gestures);
  gestures.pointer('pointerup', 730, 450, 2, 'touch');
  gestures.pointer('pointerdown', 760, 450, 3, 'touch');
  gestures.pointer('pointermove', 720, 450, 3, 'touch');
  gestures.tick(20);
  fullscreenScreen(gestures);
  gestures.pointer('pointerup', 720, 450, 3, 'touch');
  gestures.pointer('pointerup', 700, 450, 1, 'touch');
  gestures.pinch(0.8);
  gestures.tick(20);
  framedLaptop(gestures);
  gestures.pinch(0.8);
  gestures.tick(20);
  samePose(gestures, savedPosition, savedRotation);

  gestures.key('Enter');
  gestures.tick(20);
  gestures.wheel(-25, 1);
  gestures.tick(20);
  fullscreenScreen(gestures);
  gestures.keyDown('Escape');
  gestures.tick(20);
  gestures.keyDown('Escape', true);
  assert.equal(gestures.mode, 'laptop', 'Holding Escape must not skip a stage');
  gestures.keyUp('Escape');
  gestures.key('Escape');
  gestures.tick(20);
  samePose(gestures, savedPosition, savedRotation);
  gestures.key('Enter');
  gestures.tick(20);
  gestures.wheel(-4, 2);
  gestures.tick(20);
  fullscreenScreen(gestures);
  send(gestures.elements.get('laptop-lid-toggle'), 'click');
  gestures.tick(20);
  assert.equal(gestures.mode, 'free', 'Closing the lid from fullscreen must return directly to the scene');
  samePose(gestures, savedPosition, savedRotation);
  gestures.close();
}
console.log('PASS: two-stage framing and screen coverage, HUD visibility/focus, wheel accumulation/inertia and delta modes, held zoom/Escape keys, continuous pinch/release, fullscreen resize, reduced motion, and saved scene return.');

const typing = setup(1440, 900, false);
const keyboardMesh = typing.renderer.scene.getObjectByName('keyboard');
const legendMesh = typing.renderer.scene.getObjectByName('keyboard-legends');
const restingKeys = keyboardMesh.instanceMatrix.array.slice();
const restingLabels = legendMesh.geometry.attributes.position.array.slice();
const keyboardTexture = legendMesh.material.map;
const keyboardTextureVersion = keyboardTexture.version;
const physicalKey = (type, code, properties = {}) => send(typing.document, type, { key: code, code, ...properties });
function keyboardAtRest() {
  assert.deepEqual(keyboardMesh.instanceMatrix.array, restingKeys, 'Keyboard events must restore all keycaps');
  assert.deepEqual(legendMesh.geometry.attributes.position.array, restingLabels, 'Keyboard events must restore all legends');
}
const freePosition = typing.camera.position.clone();
const typed = physicalKey('keydown', 'KeyI', { key: 'ı' });
assert.equal(typed.defaultPrevented, false, 'Keyboard animation must not suppress normal typing');
assert.equal(typing.document.activeElement, undefined, 'Typing must work without focusing the canvas');
typing.renderer.shadowMap.needsUpdate = false;
typing.tick();
assert.notDeepEqual(keyboardMesh.instanceMatrix.array, restingKeys, 'A document keydown must depress a key');
assert.equal(typing.renderer.shadowMap.needsUpdate, true, 'Moving keycaps must refresh the shadow map');
assert.ok(typing.camera.position.distanceTo(freePosition) < 1e-8, 'Normal typing must not move the camera');
const heldKeys = keyboardMesh.instanceMatrix.array.slice();
typing.renderer.shadowMap.needsUpdate = false;
physicalKey('keydown', 'KeyI', { key: 'I', repeat: true });
typing.tick(10);
assert.deepEqual(keyboardMesh.instanceMatrix.array, heldKeys, 'Auto-repeat must preserve the depressed key');
assert.equal(typing.renderer.shadowMap.needsUpdate, false, 'A held key must not refresh shadows continuously');
physicalKey('keyup', 'KeyI', { key: 'ı' });
typing.tick(2);
keyboardAtRest();
physicalKey('keydown', 'KeyI', { key: 'i' });
typing.tick();
assert.deepEqual(keyboardMesh.instanceMatrix.array, heldKeys, 'Physical mapping must ignore the keyboard language');
send(typing.window, 'blur');
keyboardAtRest();
typing.tick(3);
keyboardAtRest();

physicalKey('keydown', 'KeyA');
physicalKey('keyup', 'KeyA');
typing.tick();
assert.notDeepEqual(keyboardMesh.instanceMatrix.array, restingKeys, 'A fast keydown/keyup must still animate');
typing.tick(2);
keyboardAtRest();
physicalKey('keydown', 'KeyA');
physicalKey('keydown', 'ShiftRight', { key: 'Shift' });
typing.tick();
const heldCount = Array.from({ length: keyboardMesh.count }, (_, index) => keyboardMesh.instanceMatrix.array[index * 16 + 13] !== restingKeys[index * 16 + 13]).filter(Boolean).length;
assert.equal(heldCount, 2, 'A modifier and letter must animate together');
typing.document.hidden = true;
send(typing.document, 'visibilitychange');
keyboardAtRest();
physicalKey('keydown', 'KeyA');
typing.document.hidden = false;
send(typing.document, 'visibilitychange');
typing.tick(3);
keyboardAtRest();

physicalKey('keydown', 'KeyA');
typing.tick();
send(typing.window, 'pagehide', { persisted: true });
keyboardAtRest();
send(typing.window, 'pageshow');
typing.tick();
keyboardAtRest();
physicalKey('keydown', 'KeyA');
typing.preference.matches = true;
send(typing.preference, 'change');
typing.tick();
assert.notDeepEqual(keyboardMesh.instanceMatrix.array, restingKeys, 'Reduced motion must still show the pressed key');
physicalKey('keyup', 'KeyA');
typing.tick();
keyboardAtRest();
physicalKey('keydown', 'Numpad1');
physicalKey('keydown', 'KeyA', { repeat: true });
typing.tick();
keyboardAtRest();
assert.equal(keyboardTexture.version, keyboardTextureVersion, 'Keyboard events must not re-upload the legend texture');
physicalKey('keydown', 'KeyA');
typing.tick();
send(typing.canvas, 'webglcontextlost');
keyboardAtRest();
physicalKey('keydown', 'KeyA');
typing.tick();
keyboardAtRest();
let keyboardTextureDisposals = 0;
keyboardTexture.addEventListener('dispose', () => keyboardTextureDisposals++);
typing.close();
physicalKey('keydown', 'KeyA');
physicalKey('keyup', 'KeyA');
keyboardAtRest();
assert.equal(keyboardTextureDisposals, 1, 'The shared legend texture must be disposed exactly once');

console.log('PASS: studio framing, floor/light budget, blank desktop, screen picking, wheel/pinch and keyboard input, saved camera poses, gestures, resize, transitions, and context loss.');
console.log('PASS: document keyboard input, language-independent physical codes, taps, holds, chords, shadow updates, blur/visibility/page cache cleanup, reduced motion, context loss, and keyboard disposal.');

const cameraCover = setup(1440, 900, false);
const shutter = cameraCover.renderer.scene.getObjectByName('camera-cover');
const cameraHit = cameraCover.renderer.scene.getObjectByName('camera-cover-hit-area');
const coverButton = cameraCover.elements.get('camera-cover-toggle');
function coverPoint() {
  cameraCover.renderer.scene.updateMatrixWorld(true);
  cameraCover.camera.updateMatrixWorld();
  const point = cameraHit.getWorldPosition(new THREE.Vector3()).project(cameraCover.camera);
  return [(point.x + 1) * 1440 / 2, (1 - point.y) * 900 / 2];
}
function coverClick(pointerType = 'mouse') {
  const [x, y] = coverPoint();
  cameraCover.pointer('pointerdown', x, y, 1, pointerType);
  cameraCover.pointer('pointerup', x, y, 1, pointerType);
}
coverClick();
assert.equal(coverButton.getAttribute('aria-pressed'), 'true', 'Clicking the physical cover must toggle its accessible state');
assert.equal(cameraCover.focused, false, 'Clicking the cover must not focus the desktop');
cameraCover.tick(2);
assert.ok(shutter.position.x > -0.035 && shutter.position.x < 0, 'The physical click must animate');
coverClick('touch');
assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'A touch must reverse the cover');
cameraCover.tick(4);
assert.equal(shutter.position.x, -0.035);

for (const cancelEvent of ['pointercancel', 'lostpointercapture']) {
  const [x, y] = coverPoint();
  cameraCover.pointer('pointerdown', x, y);
  cameraCover.pointer(cancelEvent, x, y);
  cameraCover.pointer('pointerup', x, y);
  assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'Cancelled input must not toggle the cover');
}
let [coverX, coverY] = coverPoint();
cameraCover.pointer('pointerdown', coverX, coverY);
cameraCover.pointer('pointermove', coverX + 20, coverY);
cameraCover.pointer('pointerup', coverX, coverY);
assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'Dragging must not toggle the cover');
cameraCover.tick(20);
[coverX, coverY] = coverPoint();
cameraCover.pointer('pointerdown', coverX, coverY, 1, 'touch');
cameraCover.pointer('pointerdown', coverX + 10, coverY, 2, 'touch');
cameraCover.pointer('pointerup', coverX + 10, coverY, 2, 'touch');
cameraCover.pointer('pointerup', coverX, coverY, 1, 'touch');
assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'Multiple pointers must not toggle the cover');
cameraCover.tick(20);

cameraCover.key('Enter');
cameraCover.tick(20);
coverClick();
assert.equal(cameraCover.focused, true, 'Cover input must also work without leaving screen focus');
assert.equal(coverButton.getAttribute('aria-pressed'), 'true');
cameraCover.tick(1);
cameraCover.preference.matches = true;
send(cameraCover.preference, 'change');
assert.equal(shutter.position.x, 0, 'Enabling reduced motion must finish the moving shutter immediately');
send(coverButton, 'click');
assert.equal(shutter.position.x, -0.035, 'The native keyboard-accessible button must use the same cover behavior');
assert.equal(cameraCover.elements.get('announcement').textContent, 'Camera privacy cover open.');

const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.03), new THREE.MeshBasicMaterial());
blocker.position.copy(cameraHit.position);
blocker.position.z += 0.3;
cameraHit.parent.add(blocker);
cameraCover.tick();
coverClick();
assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'A foreground attachment must occlude the cover hit area');
blocker.removeFromParent();
blocker.geometry.dispose();
blocker.material.dispose();

let instancedDisposals = 0;
cameraCover.renderer.scene.getObjectByName('rubber-feet').addEventListener('dispose', () => instancedDisposals++);
send(cameraCover.canvas, 'webglcontextlost');
assert.equal(coverButton.disabled, true, 'Context loss must disable the cover button');
send(coverButton, 'click');
assert.equal(coverButton.getAttribute('aria-pressed'), 'false');
cameraCover.close();
send(coverButton, 'click');
assert.equal(coverButton.getAttribute('aria-pressed'), 'false', 'Disposal must remove the button listener');
assert.equal(instancedDisposals, 1, 'Instanced detail buffers must be released exactly once');
console.log('PASS: camera cover click/touch/button, reversal, focus, cancelled/drag/multi-pointer input, reduced motion, foreground occlusion, context loss, and instance disposal.');

const laptopLid = setup(1440, 900, false);
const lidPivot = laptopLid.renderer.scene.getObjectByName('laptop-lid-pivot');
const lidHit = laptopLid.renderer.scene.getObjectByName('lid-toggle-hit-area');
const lidButton = laptopLid.elements.get('laptop-lid-toggle');
const lidCoverButton = laptopLid.elements.get('camera-cover-toggle');
const screenLight = laptopLid.screen.children.find((object) => object.isPointLight);
const openAngle = lidPivot.rotation.x;
function lidPoint(test = laptopLid, width = 1440, height = 900) {
  test.renderer.scene.updateMatrixWorld(true);
  test.camera.updateMatrixWorld();
  const hit = test.renderer.scene.getObjectByName('lid-toggle-hit-area');
  const point = hit.getWorldPosition(new THREE.Vector3()).project(test.camera);
  return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
}
function lidClick(pointerType = 'mouse', offsetY = 0) {
  const [x, y] = lidPoint();
  laptopLid.pointer('pointerdown', x, y + offsetY, 1, pointerType);
  laptopLid.pointer('pointerup', x, y + offsetY, 1, pointerType);
}
const [lidX, lidY] = lidPoint();
laptopLid.pointer('pointermove', lidX, lidY);
assert.equal(laptopLid.canvas.style.cursor, 'pointer', 'The notch must advertise its click action');
const lightBeforeClose = screenLight.getWorldPosition(new THREE.Vector3());
lidClick();
assert.equal(lidButton.getAttribute('aria-pressed'), 'true', 'The notch must select the closed target');
assert.equal(laptopLid.focused, false, 'The notch must not focus the desktop');
assert.equal(lidCoverButton.disabled, true, 'Closing must disable the camera-cover button');
laptopLid.renderer.shadowMap.needsUpdate = false;
laptopLid.tick(3);
assert.ok(lidPivot.rotation.x > openAngle && lidPivot.rotation.x < Math.PI / 2, 'A physical click must animate closing');
assert.equal(laptopLid.renderer.shadowMap.needsUpdate, true, 'Lid motion must refresh shadows');
assert.ok(screenLight.getWorldPosition(new THREE.Vector3()).distanceTo(lightBeforeClose) > 0.01, 'The screen light must travel with the lid');
laptopLid.click(0.5, 0.5);
laptopLid.key('Enter');
send(lidCoverButton, 'click');
assert.equal(laptopLid.focused, false, 'A moving lid must not allow screen focus');
assert.equal(lidCoverButton.getAttribute('aria-pressed'), 'false', 'A moving lid must not allow camera-cover input');
const beforeReverse = lidPivot.rotation.x;
lidClick('touch', -10);
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Touch must reverse a closing lid');
assert.equal(lidPivot.rotation.x, beforeReverse, 'Reversal must not jump the lid');
laptopLid.tick(14);
assert.equal(lidPivot.rotation.x, openAngle);
assert.equal(lidCoverButton.disabled, false, 'Reopening must restore the camera-cover button');
laptopLid.renderer.shadowMap.needsUpdate = false;
laptopLid.tick(2);
assert.equal(laptopLid.renderer.shadowMap.needsUpdate, false, 'A resting lid must not keep refreshing shadows');

for (const cancelEvent of ['pointercancel', 'lostpointercapture']) {
  const [x, y] = lidPoint();
  laptopLid.pointer('pointerdown', x, y - 10);
  laptopLid.pointer(cancelEvent, x, y - 10);
  laptopLid.pointer('pointerup', x, y - 10);
  assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Cancelled input must not toggle the lid');
}
let [notchX, notchY] = lidPoint();
notchY -= 10;
laptopLid.pointer('pointerdown', notchX, notchY);
laptopLid.pointer('pointermove', notchX + 20, notchY);
laptopLid.pointer('pointerup', notchX, notchY);
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Dragging must not toggle the lid');
laptopLid.tick(20);
[notchX, notchY] = lidPoint();
notchY -= 10;
laptopLid.pointer('pointerdown', notchX, notchY, 1, 'touch');
laptopLid.pointer('pointerdown', notchX + 10, notchY, 2, 'touch');
laptopLid.pointer('pointerup', notchX + 10, notchY, 2, 'touch');
laptopLid.pointer('pointerup', notchX, notchY, 1, 'touch');
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Multiple pointers must not toggle the lid');
laptopLid.tick(20);
const notchBlocker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.2), new THREE.MeshBasicMaterial());
notchBlocker.position.copy(lidHit.position).add(new THREE.Vector3(0, 0.2, 0.25));
lidHit.parent.add(notchBlocker);
laptopLid.tick();
lidClick();
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Foreground geometry must occlude the notch');
lidClick('touch', -10);
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'Padding must not select a notch hidden by foreground geometry');
notchBlocker.removeFromParent();
notchBlocker.geometry.dispose();
notchBlocker.material.dispose();

const beforeLidFocus = laptopLid.camera.position.clone();
const beforeLidFocusRotation = laptopLid.camera.quaternion.clone();
laptopLid.key('Enter');
laptopLid.tick(14);
assert.equal(laptopLid.focused, true);
send(lidButton, 'click');
assert.equal(laptopLid.focused, false, 'Closing from focus must leave the desktop');
laptopLid.tick(3);
const returningAngle = lidPivot.rotation.x;
send(lidButton, 'click');
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'The button must reverse the lid during the camera return');
assert.equal(lidPivot.rotation.x, returningAngle, 'Reversing during a camera transition must not jump the lid');
laptopLid.tick(3);
lidClick();
assert.equal(lidButton.getAttribute('aria-pressed'), 'true', 'The notch must also work during the camera return');
laptopLid.tick(14);
samePose(laptopLid, beforeLidFocus, beforeLidFocusRotation);
assert.equal(lidPivot.rotation.x, Math.PI / 2, 'The lid must settle flat after returning to the scene');
laptopLid.click(0.5, 0.5);
laptopLid.key('Enter');
laptopLid.key(' ');
laptopLid.wheel(-120);
laptopLid.tick(14);
laptopLid.pinch(1.5);
laptopLid.tick(14);
assert.equal(laptopLid.focused, false, 'Clicks, keyboard, wheel, and pinch must not focus a closed screen');
send(lidCoverButton, 'click');
assert.equal(lidCoverButton.getAttribute('aria-pressed'), 'false');
lidClick('touch');
assert.equal(lidButton.getAttribute('aria-pressed'), 'false', 'The closed lid must leave the notch usable');
laptopLid.key('Enter');
assert.equal(laptopLid.focused, false, 'Focus must wait until reopening finishes');
laptopLid.tick(14);
laptopLid.click(0.5, 0.5);
laptopLid.tick(14);
assert.equal(laptopLid.focused, true, 'Screen picking must work again after reopening');
framedLaptop(laptopLid);
send(lidCoverButton, 'click');
assert.equal(lidCoverButton.getAttribute('aria-pressed'), 'true', 'Camera-cover control must work again after reopening');
laptopLid.key('Escape');
laptopLid.tick(14);

lidClick();
laptopLid.tick(2);
laptopLid.preference.matches = true;
send(laptopLid.preference, 'change');
assert.equal(lidPivot.rotation.x, Math.PI / 2, 'Enabling reduced motion must finish an active lid animation');
send(lidButton, 'click');
assert.equal(lidPivot.rotation.x, openAngle, 'The accessible button must reopen immediately with reduced motion');
assert.equal(lidCoverButton.disabled, false);
assert.equal(laptopLid.elements.get('announcement').textContent, 'Laptop lid open.');
laptopLid.preference.matches = false;
send(laptopLid.preference, 'change');
send(lidButton, 'click');
laptopLid.tick(2);
const beforeHidden = lidPivot.rotation.x;
laptopLid.document.hidden = true;
send(laptopLid.document, 'visibilitychange');
send(lidButton, 'click');
laptopLid.tick(20);
assert.equal(lidPivot.rotation.x, beforeHidden, 'Hidden tabs must pause lid motion and ignore button input');
assert.equal(lidButton.getAttribute('aria-pressed'), 'true');
laptopLid.document.hidden = false;
send(laptopLid.document, 'visibilitychange');
laptopLid.tick();
assert.equal(lidPivot.rotation.x, beforeHidden, 'Resuming must not jump the animation');
laptopLid.tick(14);
assert.equal(lidPivot.rotation.x, Math.PI / 2);
let lidDisposals = 0;
lidHit.geometry.addEventListener('dispose', () => lidDisposals++);
send(laptopLid.canvas, 'webglcontextlost');
assert.equal(lidButton.disabled, true, 'Context loss must disable the lid button');
send(lidButton, 'click');
assert.equal(lidButton.getAttribute('aria-pressed'), 'true');
laptopLid.close();
send(lidButton, 'click');
assert.equal(lidButton.getAttribute('aria-pressed'), 'true', 'Disposal must remove the lid button listener');
assert.equal(lidDisposals, 1, 'The notch hit geometry must be disposed exactly once');

for (const [width, height] of [[390, 844], [844, 390], [320, 568], [1440, 900]]) {
  const target = setup(width, height);
  const button = target.elements.get('laptop-lid-toggle');
  for (const [closed, offsetY] of [['true', -10], ['false', 21]]) {
    const [x, y] = lidPoint(target, width, height);
    assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, 'The notch must fit the viewport');
    const before = button.getAttribute('aria-pressed');
    for (const [dx, dy] of [[0, 23], [16, 16]]) {
      target.pointer('pointerdown', x + dx, y + dy, 1, 'touch');
      target.pointer('pointerup', x + dx, y + dy, 1, 'touch');
      target.tick();
      assert.equal(button.getAttribute('aria-pressed'), before, 'Touch outside the circular padding must not toggle the lid');
    }
    target.pointer('pointermove', x, y + offsetY);
    assert.equal(target.canvas.style.cursor, 'pointer', 'The padded notch must advertise its click action');
    target.pointer('pointerdown', x, y + offsetY, 1, 'touch');
    target.pointer('pointerup', x, y + offsetY, 1, 'touch');
    target.tick();
    assert.equal(button.getAttribute('aria-pressed'), closed, 'Touch within 22 CSS pixels must close and reopen the lid across viewport sizes');
  }
  target.click(0.5, 0.5);
  assert.equal(target.focused, true, 'Screen picking must work after reopening with padded touch input');
  target.close();
}

const occludedNotch = setup(390, 844);
const occludedButton = occludedNotch.elements.get('laptop-lid-toggle');
send(occludedButton, 'click');
occludedNotch.camera.position.set(0, 5, -8);
occludedNotch.tick();
const [hiddenX, hiddenY] = lidPoint(occludedNotch, 390, 844);
assert.ok(hiddenX >= 0 && hiddenX <= 390 && hiddenY >= 0 && hiddenY <= 844, 'The occluded notch must still project inside the viewport');
occludedNotch.pointer('pointerdown', hiddenX, hiddenY - 10, 1, 'touch');
occludedNotch.pointer('pointerup', hiddenX, hiddenY - 10, 1, 'touch');
assert.equal(occludedButton.getAttribute('aria-pressed'), 'true', 'Padding must not reach the notch through a closed lid');
occludedNotch.close();
console.log('PASS: lid click/touch/button, CSS-pixel touch padding and limits, reversal, shadows and screen light, gestures, occlusion, focus return/gating, reduced motion, viewports, visibility, context loss, and disposal.');

const displayPower = setup(1440, 900, false);
const displayButton = displayPower.elements.get('laptop-lid-toggle');
const displayMaterial = displayPower.screen.material;
const displayGlow = displayPower.screen.children.find((object) => object.isPointLight);
const desktopTextureVersion = displayMaterial.map.version;
assert.equal(displayMaterial.color.r, 1, 'The rendered desktop must start fully lit');
send(displayButton, 'click');
displayPower.tick(9);
assert.equal(displayMaterial.color.r, 1, 'Closing must preserve the lit display before reaching the sleep threshold');
displayPower.tick(1);
assert.ok(displayMaterial.color.r > 0 && displayMaterial.color.r < 1, 'The frame loop must dim the display after crossing the sleep threshold');
displayPower.tick(4);
assert.equal(displayMaterial.color.r, 0, 'A closed laptop must render a black display');
assert.equal(displayGlow.intensity, 0, 'A closed laptop must stop emitting display glow');
send(displayButton, 'click');
displayPower.tick(6);
assert.equal(displayMaterial.color.r, 0, 'The wake delay must keep the display black as the lid starts reopening');
displayPower.tick(8);
const pausedBrightness = displayMaterial.color.r;
const pausedGlow = displayGlow.intensity;
assert.ok(pausedBrightness > 0 && pausedBrightness < 1, 'Waking must still be gradual after the lid is fully open');
displayPower.renderer.shadowMap.needsUpdate = false;
displayPower.document.hidden = true;
send(displayPower.document, 'visibilitychange');
displayPower.tick(20);
assert.equal(displayMaterial.color.r, pausedBrightness, 'A hidden tab must pause the display fade');
assert.equal(displayGlow.intensity, pausedGlow, 'A hidden tab must pause the glow fade');
displayPower.document.hidden = false;
send(displayPower.document, 'visibilitychange');
displayPower.tick();
assert.equal(displayMaterial.color.r, pausedBrightness, 'Resuming a tab must not jump the display brightness');
displayPower.tick(2);
assert.ok(displayMaterial.color.r > pausedBrightness, 'The display fade must resume with the frame loop');
assert.equal(displayPower.renderer.shadowMap.needsUpdate, false, 'Display-only fading must not rebuild shadows');
assert.ok(Math.abs(displayGlow.intensity - 0.3 * displayMaterial.color.r) < 1e-7, 'The glow must track the rendered display brightness');
displayPower.key('Enter');
assert.equal(displayPower.focused, true, 'A fully open lid must allow screen focus during its display fade');
displayPower.tick(14);
assert.equal(displayMaterial.color.r, 1, 'The display must finish waking after the hinge stops moving');
assert.equal(displayMaterial.map.version, desktopTextureVersion, 'Display fading must preserve the desktop texture');
assert.equal(displayMaterial.opacity, 1);
send(displayButton, 'click');
displayPower.tick(14);
send(displayButton, 'click');
displayPower.tick(14);
assert.ok(displayMaterial.color.r > 0 && displayMaterial.color.r < 1);
displayPower.preference.matches = true;
send(displayPower.preference, 'change');
assert.equal(displayMaterial.color.r, 1, 'Enabling reduced motion must finish a fade with an already open lid');
assert.equal(displayGlow.intensity, 0.3);
send(displayButton, 'click');
assert.equal(displayMaterial.color.r, 0, 'Reduced motion must close and switch off immediately');
assert.equal(displayGlow.intensity, 0);
send(displayButton, 'click');
assert.equal(displayMaterial.color.r, 1, 'Reduced motion must reopen without a wake delay');
displayPower.preference.matches = false;
send(displayPower.preference, 'change');
send(displayButton, 'click');
displayPower.tick(14);
send(displayButton, 'click');
displayPower.tick(14);
const brightnessBeforeLoss = displayMaterial.color.r;
send(displayPower.canvas, 'webglcontextlost');
displayPower.tick(20);
assert.equal(displayMaterial.color.r, brightnessBeforeLoss, 'Context loss must stop the display fade');
let glowDisposals = 0;
const disposeGlow = displayGlow.dispose.bind(displayGlow);
displayGlow.dispose = () => { glowDisposals++; disposeGlow(); };
displayPower.close();
assert.equal(glowDisposals, 1, 'Scene disposal must release the model-owned display light exactly once');
console.log('PASS: rendered display sleep/wake, delayed gradual brightness and glow, fade after hinge settling, paused/resumed tabs, focus, reduced motion, texture preservation, context loss, and light disposal.');
console.log('NOT CHECKED: browser event ordering, GPU shaders/pixels, screen-reader output, or FPS.');
