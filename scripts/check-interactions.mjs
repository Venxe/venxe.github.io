import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), properties));
}

function setup(width, height, reduceMotion = true) {
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => ({ getContext: () => drawing }) });
  const canvas = Object.assign(new EventTarget(), {
    style: {}, getRootNode: () => document, focus() { document.activeElement = this; },
    setAttribute() {}, setPointerCapture() {}, releasePointerCapture() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  });
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const elements = new Map(['scene', 'hint', 'announcement', 'loading'].map((id) => [id, { setAttribute() {}, textContent: '', hidden: false }]));
  Object.assign(elements.get('scene'), { append() {}, getBoundingClientRect: canvas.getBoundingClientRect });
  document.querySelector = (selector) => elements.get(selector.slice(1)) || null;
  globalThis.document = document;
  globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
  const window = globalThis.window;
  const preference = Object.assign(new EventTarget(), { matches: reduceMotion });
  globalThis.matchMedia = () => preference;
  let resizeCallback;
  globalThis.ResizeObserver = class {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    disconnect() {}
  };
  const renderer = {
    domElement: canvas, shadowMap: {}, loop: null,
    setClearColor(color, alpha) { this.clearAlpha = alpha; },
    setPixelRatio() {}, setSize() {}, dispose() {},
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
  const key = (value) => send(canvas, 'keydown', { key: value });
  const wheel = (deltaY) => send(canvas, 'wheel', { deltaY, deltaMode: 0, clientX: width / 2, clientY: height / 2 });
  const pointer = (type, x, y, id = 1, pointerType = 'mouse') => send(canvas, type, { clientX: x, clientY: y, pageX: x, pageY: y, pointerId: id, pointerType, button: 0 });
  tick();
  let screen;
  renderer.scene.traverse((object) => {
    if (object.geometry?.parameters?.width === 3.29) screen = object;
  });
  assert.ok(screen, 'The rendered scene must contain the laptop screen');
  const screenPoint = (u, v) => {
    renderer.camera.updateMatrixWorld();
    const point = screen.localToWorld(new THREE.Vector3((u - 0.5) * 3.29, (v - 0.5) * 1.974, 0)).project(renderer.camera);
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
  return { renderer, screen, elements, document, canvas, preference, errors, tick, key, wheel, pointer, click, pinch, screenPoint,
    get camera() { return renderer.camera; },
    get focused() { return elements.get('hint').textContent === 'Uzaklaşarak geri dön'; },
    resize(w, h) { width = w; height = h; resizeCallback(); },
    close() { send(window, 'pagehide', { persisted: false }); },
  };
}

function samePose(test, position, rotation) {
  assert.ok(test.camera.position.distanceTo(position) < 1e-8, 'Return must restore the saved camera position');
  assert.ok(test.camera.quaternion.angleTo(rotation) < 1e-7, 'Return must restore the saved viewing direction');
}

function centeredScreen(test) {
  const point = test.screen.getWorldPosition(new THREE.Vector3()).project(test.camera);
  assert.ok(Math.abs(point.x) < 1e-8 && Math.abs(point.y) < 1e-8, 'Focus must center the laptop screen');
  const normal = test.screen.getWorldDirection(new THREE.Vector3());
  assert.ok(test.camera.getWorldDirection(new THREE.Vector3()).dot(normal) < -0.999999, 'Focus must face the screen');
}

for (const [width, height] of [[1440, 900], [390, 844], [844, 390], [320, 568]]) {
  const test = setup(width, height);
  assert.equal(test.renderer.options.alpha, true, 'The canvas must be transparent');
  assert.equal(test.renderer.clearAlpha, 0);
  assert.equal(test.renderer.scene.background, null, 'CSS must provide the background');
  assert.ok(test.renderer.scene.children.some((object) => object.material?.isShadowMaterial), 'The floor must only draw shadows');
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
  centeredScreen(test);
  const focusPosition = test.camera.position.clone();
  if (width >= height) {
    const center = test.screen.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(test.camera.position.distanceTo(center) - 3.7) < 1e-8, 'OrbitControls must not push the focused camera out to the free-view minimum');
  }
  const [left, top] = test.screenPoint(356 / 1200, 1 - 504 / 720);
  const [right, bottom] = test.screenPoint(588 / 1200, 1 - 696 / 720);
  assert.ok(right - left >= 44 && bottom - top >= 44, 'Focused actions must have usable touch areas');
  assert.equal(test.document.activeElement, undefined, 'Automatic focus must not steal keyboard focus');
  test.wheel(120);
  test.tick();
  assert.equal(test.focused, true, 'Small outward zoom must stay in focus');
  assert.ok(test.camera.position.distanceTo(focusPosition) > 0.01, 'Wheel zoom must remain active in focus');
  test.wheel(240);
  test.tick();
  assert.equal(test.focused, false, 'Zooming outward must return to free view');
  samePose(test, position, rotation);
  test.tick(3);
  assert.equal(test.focused, false, 'Return must not immediately refocus');

  test.click(0.5, 0.5);
  assert.equal(test.focused, true, 'Clicking the screen must focus it');
  test.click(472 / 1200, 1 - 600 / 720);
  assert.match(test.elements.get('announcement').textContent, /Gün batımı/);
  test.click(0.5, 0.5);
  assert.equal(test.focused, true, 'Blank screen clicks must do nothing');
  test.click(728 / 1200, 1 - 600 / 720);
  samePose(test, position, rotation);
  test.key('Enter');
  test.key('ArrowLeft');
  test.key(' ');
  assert.match(test.elements.get('announcement').textContent, /Sessiz saatler/);
  test.key('ArrowRight');
  test.key('Enter');
  samePose(test, position, rotation);
  test.key('Enter');
  send(test.document, 'keydown', { key: 'Escape' });
  samePose(test, position, rotation);
  test.pinch(1.25);
  assert.equal(test.focused, true, 'A pinch inward must focus the screen');
  test.pinch(0.8);
  assert.equal(test.focused, false, 'A pinch outward must return to free view');
  samePose(test, position, rotation);
  test.close();
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
centeredScreen(animated);
animated.key('-');
animated.tick();
assert.equal(animated.focused, true);
animated.resize(844, 390);
animated.tick();
assert.equal(animated.focused, true, 'Resizing must not exit focus');
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
centeredScreen(animated);
send(animated.canvas, 'webglcontextlost');
assert.equal(animated.errors.length, 1);
assert.equal(animated.renderer.loop, null, 'Context loss must stop rendering');
animated.close();

console.log('PASS: transparent scene, screen picking, wheel/pinch and keyboard input, saved camera poses, gestures, resize, transitions, and context loss.');
console.log('NOT CHECKED: browser event ordering, GPU shaders/pixels, screen-reader output, or FPS.');
