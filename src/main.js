import * as THREE from 'three';
import { createScene } from './scene.js';
import { SETTINGS } from './config.js';

export function start(showError) {
  const container = document.querySelector('#scene');
  const app = createScene(container);
  const { renderer, scene, camera, controls, laptop, steam } = app;
  const canvas = renderer.domElement;
  const hint = document.querySelector('#hint');
  const announcement = document.querySelector('#announcement');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const pointers = new Map();
  const motionOffset = new THREE.Vector3();
  const motionSpherical = new THREE.Spherical();
  const lastFreePose = { position: camera.position.clone(), target: controls.target.clone() };
  const initialFocusPose = app.focusPose();
  const initialHomePose = app.homePose();
  let focused = false;
  let transition = null;
  let previousPose = null;
  let selectedAction = null;
  let lastDistance = controls.getDistance();
  let focusDistance = initialFocusPose.position.distanceTo(initialFocusPose.target);
  let enterDistance = initialHomePose.position.distanceTo(initialHomePose.target) * SETTINGS.focusEnterRatio;
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
  function rememberCamera() {
    lastDistance = controls.getDistance();
    if (!focused) {
      lastFreePose.position.copy(camera.position);
      lastFreePose.target.copy(controls.target);
    }
  }
  function updateControls() {
    controls.enableRotate = !focused;
    controls.minDistance = focused ? focusDistance * SETTINGS.focusMinRatio : SETTINGS.minSceneDistance;
    controls.enableDamping = !reducedMotion.matches;
  }
  function returnPose() {
    const pose = previousPose || app.homePose();
    const offset = pose.position.clone().sub(pose.target).clampLength(SETTINGS.minSceneDistance, controls.maxDistance);
    return { target: pose.target.clone(), position: pose.target.clone().add(offset) };
  }
  function finishTransition() {
    if (!transition) return;
    applyPose(transition.to);
    transition = null;
    controls.enabled = true;
    updateControls();
    controls.update();
    rememberCamera();
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
    pointers.clear();
    canvas.style.cursor = focused ? 'default' : 'grab';
    if (reducedMotion.matches) finishTransition();
  }
  function clearDamping() {
    controls.enableDamping = false;
    controls.update();
  }
  function openLaptop(pose = { position: camera.position, target: controls.target }) {
    if (focused || transition || contextLost) return;
    previousPose = { position: pose.position.clone(), target: pose.target.clone() };
    clearDamping();
    touchedCamera = true;
    focused = true;
    selectedAction = null;
    hint.textContent = 'Uzaklaşarak geri dön';
    laptop.drawScreen(theme, true);
    updateControls();
    moveTo(app.focusPose());
    announce('Laptop ekranı odaklandı. Sağ ve sol oklarla Tema veya Geri öğesini seçin; Enter ile çalıştırın. Uzaklaşarak veya Escape ile sahneye dönün.');
  }
  function leaveLaptop() {
    if (!focused || contextLost) return;
    if (!transition) clearDamping();
    focused = false;
    selectedAction = null;
    hint.textContent = 'Sürükle · Yaklaş · Ekrana tıkla';
    laptop.drawScreen(theme, false);
    updateControls();
    moveTo(returnPose());
    announce('Önceki sahne görünümüne dönüldü.');
  }
  function selectAction(action) {
    if (selectedAction === action) return;
    selectedAction = action;
    laptop.drawScreen(theme, focused, selectedAction);
  }
  function runAction(action) {
    if (action === 'back') leaveLaptop();
    else if (action === 'theme') {
      theme = 1 - theme;
      laptop.drawScreen(theme, true, selectedAction);
      announce(theme ? 'Gün batımı teması açıldı.' : 'Sessiz saatler teması açıldı.');
    }
  }
  function screenActionAt(x, y) {
    const uv = app.screenAt(x, y);
    return focused ? laptop.actionAt(uv) : uv ? 'open' : null;
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focused) {
      event.preventDefault();
      leaveLaptop();
    }
  }, listenerOptions);
  canvas.addEventListener('keydown', (event) => {
    if (transition || contextLost) return;
    if (focused && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      selectAction(event.key === 'ArrowLeft' ? 'theme' : 'back');
      announce(selectedAction === 'theme' ? 'Tema seçildi. Enter ile değiştirin.' : 'Geri seçildi. Enter ile sahneye dönün.');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (focused) runAction(selectedAction || 'theme');
      else {
        openLaptop();
        selectAction('theme');
      }
      return;
    }
    if (focused && event.key.startsWith('Arrow')) return;
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
    if (transition || contextLost || event.button !== 0) return;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, moved: false,
      action: screenActionAt(event.clientX, event.clientY),
    });
    if (pointers.size > 1) for (const pointer of pointers.values()) pointer.moved = true;
  }, listenerOptions);
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) pointer.moved = true;
    if (!transition && !contextLost && event.pointerType === 'mouse' && pointers.size === 0) {
      const action = screenActionAt(event.clientX, event.clientY);
      if (focused) selectAction(action);
      canvas.style.cursor = action ? 'pointer' : focused ? 'default' : 'grab';
    }
  }, listenerOptions);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointer || pointer.moved || transition || contextLost) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) return;
    const action = screenActionAt(event.clientX, event.clientY);
    if (!action || action !== pointer.action) return;
    canvas.focus({ preventScroll: true });
    if (action === 'open') openLaptop();
    else {
      selectAction(action);
      runAction(action);
    }
  }, listenerOptions);
  for (const event of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, (pointerEvent) => pointers.delete(pointerEvent.pointerId), listenerOptions);
  }
  canvas.addEventListener('pointerleave', () => {
    canvas.style.cursor = focused ? 'default' : 'grab';
    if (focused) selectAction(null);
  }, listenerOptions);
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
    } else {
      controls.update(delta);
      const distance = controls.getDistance();
      if (!focused && distance < lastDistance - 1e-6 && distance <= enterDistance) openLaptop(lastFreePose);
      else if (focused && distance > lastDistance + 1e-6 && distance >= focusDistance * SETTINGS.focusExitRatio) leaveLaptop();
      else rememberCamera();
    }
    if (!reducedMotion.matches) steam.update(elapsed);
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(() => {
    if (disposed || contextLost) return;
    const zoomRatio = focused && !transition ? controls.getDistance() / focusDistance : 1;
    app.resize();
    const focusPose = app.focusPose();
    const homePose = app.homePose();
    focusDistance = focusPose.position.distanceTo(focusPose.target);
    enterDistance = homePose.position.distanceTo(homePose.target) * SETTINGS.focusEnterRatio;
    updateControls();
    if (transition) moveTo(focused ? focusPose : returnPose());
    else {
      if (focused) {
        focusPose.position.sub(focusPose.target).multiplyScalar(zoomRatio).add(focusPose.target);
        applyPose(focusPose);
      } else if (!touchedCamera) applyPose(homePose);
      controls.update();
      rememberCamera();
    }
  });
  observer.observe(container);
  reducedMotion.addEventListener('change', () => {
    controls.enableDamping = !reducedMotion.matches;
    steam.points.visible = !reducedMotion.matches;
    if (reducedMotion.matches) finishTransition();
  }, listenerOptions);
  updateControls();
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
  if (!document.hidden) renderer.setAnimationLoop(frame);
}
