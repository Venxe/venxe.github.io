import * as THREE from 'three';
import { createScene } from './scene.js';
import { SETTINGS } from './config.js';

export function start(showError) {
  const container = document.querySelector('#scene');
  const app = createScene(container);
  const { renderer, scene, camera, controls, laptop, steam } = app;
  const canvas = renderer.domElement;
  const openButton = document.querySelector('#open');
  const resetButton = document.querySelector('#reset');
  const backButton = document.querySelector('#back');
  const themeButton = document.querySelector('#theme');
  const panel = document.querySelector('#focus-panel');
  const announcement = document.querySelector('#announcement');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const pointers = new Map();
  const motionOffset = new THREE.Vector3();
  const motionSpherical = new THREE.Spherical();
  let focused = false;
  let transition = null;
  let previousPose = null;
  let returnFocus = openButton;
  let theme = 0;
  let elapsed = 0;
  let previousTime = null;
  let contextLost = false;
  let disposed = false;
  let touchedCamera = false;

  function announce(message) { announcement.textContent = message; }
  function applyPose(pose) {
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
  }
  function finishTransition() {
    if (!transition) return;
    applyPose(transition.to);
    transition = null;
    controls.enabled = !focused;
    controls.enableDamping = !reducedMotion.matches;
    if (!focused) controls.update();
  }
  function moveTo(pose) {
    const fromOrbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const toOrbit = new THREE.Spherical().setFromVector3(pose.position.clone().sub(pose.target));
    // Take the short arc around the scene instead of a line through the laptop.
    toOrbit.theta = fromOrbit.theta + Math.atan2(Math.sin(toOrbit.theta - fromOrbit.theta), Math.cos(toOrbit.theta - fromOrbit.theta));
    transition = {
      from: { position: camera.position.clone(), target: controls.target.clone() },
      to: pose,
      fromOrbit,
      toOrbit,
      started: elapsed,
    };
    controls.enabled = false;
    if (reducedMotion.matches) finishTransition();
  }
  function clearDamping() {
    controls.enableDamping = false;
    controls.update();
  }
  function openLaptop() {
    if (focused || transition || contextLost) return;
    clearDamping();
    previousPose = { position: camera.position.clone(), target: controls.target.clone() };
    returnFocus = document.activeElement === canvas ? canvas : openButton;
    focused = true;
    document.body.classList.add('focused');
    panel.hidden = false;
    openButton.disabled = true;
    laptop.drawScreen(theme, true);
    app.resize();
    moveTo(app.focusPose());
    themeButton.focus({ preventScroll: true });
    announce('Laptop açıldı. Ekran temasını değiştirebilir veya Escape ile sahneye dönebilirsiniz.');
  }
  function leaveLaptop(reset = false) {
    if (contextLost) return;
    focused = false;
    document.body.classList.remove('focused');
    panel.hidden = true;
    openButton.disabled = false;
    laptop.drawScreen(theme, false);
    app.resize();
    moveTo(reset ? app.homePose() : previousPose || app.homePose());
    returnFocus.focus({ preventScroll: true });
    announce(reset ? 'Başlangıç görünümüne dönüldü.' : 'Sahneye dönüldü.');
  }
  openButton.addEventListener('click', openLaptop, listenerOptions);
  backButton.addEventListener('click', () => leaveLaptop(), listenerOptions);
  resetButton.addEventListener('click', () => {
    if (!focused && !transition) clearDamping();
    touchedCamera = false;
    leaveLaptop(true);
  }, listenerOptions);
  themeButton.addEventListener('click', () => {
    theme = 1 - theme;
    laptop.drawScreen(theme, true);
    announce(theme ? 'Gün batımı teması açıldı.' : 'Sessiz saatler teması açıldı.');
  }, listenerOptions);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focused) {
      event.preventDefault();
      leaveLaptop();
    }
  }, listenerOptions);
  canvas.addEventListener('keydown', (event) => {
    if (focused || transition || contextLost) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLaptop();
      return;
    }
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    switch (event.key) {
      case 'ArrowLeft': spherical.theta -= 0.12; break;
      case 'ArrowRight': spherical.theta += 0.12; break;
      case 'ArrowUp': spherical.phi -= 0.09; break;
      case 'ArrowDown': spherical.phi += 0.09; break;
      case '+': case '=': spherical.radius *= 0.9; break;
      case '-': spherical.radius *= 1.1; break;
      default: return;
    }
    event.preventDefault();
    touchedCamera = true;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    controls.update();
  }, listenerOptions);
  controls.addEventListener('start', () => { touchedCamera = true; });
  canvas.addEventListener('pointerdown', (event) => {
    if (focused || transition || event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
    if (pointers.size > 1) for (const pointer of pointers.values()) pointer.moved = true;
  }, listenerOptions);
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) pointer.moved = true;
    if (!focused && !transition && event.pointerType === 'mouse' && pointers.size === 0) {
      canvas.style.cursor = app.screenAt(event.clientX, event.clientY) ? 'pointer' : 'grab';
    }
  }, listenerOptions);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointer || pointer.moved || focused || transition) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) return;
    if (app.screenAt(event.clientX, event.clientY)) openLaptop();
  }, listenerOptions);
  for (const event of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, (pointerEvent) => pointers.delete(pointerEvent.pointerId), listenerOptions);
  }
  canvas.addEventListener('pointerleave', () => { canvas.style.cursor = 'grab'; }, listenerOptions);
  function frame(time) {
    if (contextLost || disposed || document.hidden) return;
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    elapsed += delta;
    if (transition) {
      const progress = Math.min((elapsed - transition.started) / SETTINGS.transitionSeconds, 1);
      const eased = progress * progress * (3 - 2 * progress);
      controls.target.lerpVectors(transition.from.target, transition.to.target, eased);
      motionSpherical.set(
        THREE.MathUtils.lerp(transition.fromOrbit.radius, transition.toOrbit.radius, eased),
        THREE.MathUtils.lerp(transition.fromOrbit.phi, transition.toOrbit.phi, eased),
        THREE.MathUtils.lerp(transition.fromOrbit.theta, transition.toOrbit.theta, eased),
      );
      camera.position.copy(controls.target).add(motionOffset.setFromSpherical(motionSpherical));
      camera.lookAt(controls.target);
      if (progress === 1) finishTransition();
    } else if (!focused) controls.update(delta);
    if (!reducedMotion.matches) steam.update(elapsed);
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(() => {
    if (disposed || contextLost) return;
    app.resize();
    if (focused) {
      if (transition) {
        transition.to = app.focusPose();
        transition.toOrbit.radius = transition.to.position.distanceTo(transition.to.target);
      }
      else applyPose(app.focusPose());
    } else if (!transition && !touchedCamera) applyPose(app.homePose());
  });
  observer.observe(container);
  reducedMotion.addEventListener('change', () => {
    controls.enableDamping = !reducedMotion.matches;
    steam.points.visible = !reducedMotion.matches;
    if (reducedMotion.matches) finishTransition();
  }, listenerOptions);
  controls.enableDamping = !reducedMotion.matches;
  steam.points.visible = !reducedMotion.matches;
  document.addEventListener('visibilitychange', () => {
    previousTime = null;
    pointers.clear();
    renderer.setAnimationLoop(document.hidden || contextLost ? null : frame);
  }, listenerOptions);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    renderer.setAnimationLoop(null);
    showError('Grafik bağlantısı kesildi. Sahneyi yeniden yükleyerek devam edebilirsiniz.');
  }, listenerOptions);
  window.addEventListener('pagehide', (event) => {
    renderer.setAnimationLoop(null);
    if (event.persisted) return;
    disposed = true;
    observer.disconnect();
    events.abort();
    app.dispose();
  }, listenerOptions);
  window.addEventListener('pageshow', () => {
    previousTime = null;
    if (!contextLost && !disposed && !document.hidden) renderer.setAnimationLoop(frame);
  }, listenerOptions);
  document.querySelector('#loading').hidden = true;
  container.setAttribute('aria-busy', 'false');
  openButton.disabled = false;
  resetButton.disabled = false;
  if (!document.hidden) renderer.setAnimationLoop(frame);
}
