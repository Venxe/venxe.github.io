import * as THREE from 'three';
import { createScene } from './scene.js';
import { SETTINGS } from './config.js';

export function start(showError) {
  const container = document.querySelector('#scene');
  const app = createScene(container);
  const { renderer, scene, camera, controls, steam, keyboard, webcam, lid } = app;
  const canvas = renderer.domElement;
  const hint = document.querySelector('#hint');
  const announcement = document.querySelector('#announcement');
  const cameraCoverButton = document.querySelector('#camera-cover-toggle');
  const lidButton = document.querySelector('#laptop-lid-toggle');
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
  let lastDistance = controls.getDistance();
  let focusDistance = initialFocusPose.position.distanceTo(initialFocusPose.target);
  let enterDistance = initialHomePose.position.distanceTo(initialHomePose.target) * SETTINGS.focusEnterRatio;
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
      from: { target: controls.target.clone() },
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
    if (focused || transition || contextLost || lid.closed || lid.moving) return;
    previousPose = { position: pose.position.clone(), target: pose.target.clone() };
    clearDamping();
    touchedCamera = true;
    focused = true;
    hint.textContent = 'Zoom out to return';
    updateControls();
    moveTo(app.focusPose());
    announce('The empty laptop desktop is now in focus. Zoom out or press Escape to return to the scene.');
  }
  function leaveLaptop() {
    if (!focused || contextLost) return;
    if (!transition) clearDamping();
    focused = false;
    hint.textContent = 'Drag · Zoom · Select screen';
    updateControls();
    moveTo(returnPose());
    announce('Returned to the previous scene view.');
  }
  function actionAt(x, y) {
    const hit = app.pickAt(x, y);
    if (hit?.kind === 'lid') return 'lid';
    return hit?.kind === 'webcam' ? 'webcam' : !focused && hit?.kind === 'screen' ? 'screen' : null;
  }
  function toggleCameraCover() {
    if (transition || contextLost || disposed || document.hidden || lid.closed || lid.moving) return;
    webcam.setClosed(!webcam.closed);
    cameraCoverButton.setAttribute('aria-pressed', String(webcam.closed));
    if (webcam.update(0, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    announce(webcam.closed ? 'Camera privacy cover closed.' : 'Camera privacy cover open.');
  }
  cameraCoverButton.addEventListener('click', toggleCameraCover, listenerOptions);
  function toggleLaptopLid() {
    if (contextLost || disposed || document.hidden) return;
    lid.setClosed(!lid.closed);
    if (lid.closed && focused) leaveLaptop();
    lidButton.setAttribute('aria-pressed', String(lid.closed));
    if (lid.update(0, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    cameraCoverButton.disabled = lid.closed || lid.moving;
    announce(lid.closed ? 'Laptop lid closed.' : 'Laptop lid open.');
  }
  lidButton.addEventListener('click', toggleLaptopLid, listenerOptions);
  function resetKeyboard() {
    if (keyboard.reset()) renderer.shadowMap.needsUpdate = true;
  }
  document.addEventListener('keydown', (event) => {
    if (contextLost || disposed || document.hidden) return;
    if (!event.repeat) keyboard.setPressed(event.code, true);
    if (event.key === 'Escape' && focused) {
      event.preventDefault();
      leaveLaptop();
    }
  }, listenerOptions);
  document.addEventListener('keyup', (event) => keyboard.setPressed(event.code, false), listenerOptions);
  window.addEventListener('blur', resetKeyboard, listenerOptions);
  canvas.addEventListener('keydown', (event) => {
    if (transition || contextLost) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!focused) openLaptop();
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
    if (contextLost || event.button !== 0) return;
    const action = actionAt(event.clientX, event.clientY);
    if (transition && action !== 'lid') return;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, moved: false,
      action,
    });
    if (pointers.size > 1) for (const pointer of pointers.values()) pointer.moved = true;
  }, listenerOptions);
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) pointer.moved = true;
    if (!contextLost && event.pointerType === 'mouse' && pointers.size === 0) {
      const action = actionAt(event.clientX, event.clientY);
      canvas.style.cursor = action && (!transition || action === 'lid') ? 'pointer' : focused ? 'default' : 'grab';
    }
  }, listenerOptions);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointer || pointer.moved || contextLost || (transition && pointer.action !== 'lid')) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) return;
    if (!pointer.action || pointer.action !== actionAt(event.clientX, event.clientY)) return;
    canvas.focus({ preventScroll: true });
    if (pointer.action === 'webcam') toggleCameraCover();
    else if (pointer.action === 'lid') toggleLaptopLid();
    else openLaptop();
  }, listenerOptions);
  for (const event of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, (pointerEvent) => pointers.delete(pointerEvent.pointerId), listenerOptions);
  }
  canvas.addEventListener('pointerleave', () => {
    canvas.style.cursor = focused ? 'default' : 'grab';
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
      if (!focused && !lid.closed && !lid.moving && distance < lastDistance - 1e-6 && distance <= enterDistance) openLaptop(lastFreePose);
      else if (focused && distance > lastDistance + 1e-6 && distance >= focusDistance * SETTINGS.focusExitRatio) leaveLaptop();
      else rememberCamera();
    }
    if (keyboard.update(delta, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    if (webcam.update(delta, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    if (lid.update(delta, reducedMotion.matches)) {
      renderer.shadowMap.needsUpdate = true;
      cameraCoverButton.disabled = lid.closed || lid.moving;
    }
    if (!reducedMotion.matches) steam.update(elapsed);
    scene.fog.near = controls.getDistance() + 6;
    scene.fog.far = scene.fog.near + 20;
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
    if (webcam.update(0, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    if (lid.update(0, reducedMotion.matches)) {
      renderer.shadowMap.needsUpdate = true;
      cameraCoverButton.disabled = lid.closed || lid.moving;
    }
  }, listenerOptions);
  updateControls();
  steam.points.visible = !reducedMotion.matches;
  document.addEventListener('visibilitychange', () => {
    previousTime = null;
    pointers.clear();
    if (document.hidden) resetKeyboard();
    renderer.setAnimationLoop(document.hidden || contextLost ? null : frame);
  }, listenerOptions);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cameraCoverButton.disabled = true;
    lidButton.disabled = true;
    resetKeyboard();
    renderer.setAnimationLoop(null);
    showError('Graphics rendering was interrupted. Reload the scene to continue.');
  }, listenerOptions);
  window.addEventListener('pagehide', (event) => {
    renderer.setAnimationLoop(null);
    resetKeyboard();
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
