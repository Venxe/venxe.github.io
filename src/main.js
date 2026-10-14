import * as THREE from 'three';
import { createScene } from './scene.js';
import { SETTINGS } from './config.js';
import { bindPowerInput } from './power-input.js';
import { isTextInput } from './desktop-theme.js';

export function start(showError) {
  const container = document.querySelector('#scene');
  const app = createScene(container);
  const { renderer, scene, camera, controls, steam, keyboard, webcam, lid, desktop, system } = app;
  const canvas = renderer.domElement;
  const hint = document.querySelector('#hint');
  const masthead = document.querySelector('.masthead');
  const announcement = document.querySelector('#announcement');
  const cameraCoverButton = document.querySelector('#camera-cover-toggle');
  const lidButton = document.querySelector('#laptop-lid-toggle');
  const powerButton = document.querySelector('#laptop-power');
  const desktopControls = document.querySelector('#desktop-controls');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const pointers = new Map();
  const eventHits = new WeakMap();
  const touchPointers = new Set();
  const zoomKeys = new Map();
  const captureOptions = { ...listenerOptions, capture: true, passive: false };
  const motionOffset = new THREE.Vector3();
  const motionSpherical = new THREE.Spherical();
  const lastFreePose = { position: camera.position.clone(), target: controls.target.clone() };
  const initialLaptopPose = app.laptopPose();
  const initialScreenPose = app.screenPose();
  const initialHomePose = app.homePose();
  let viewMode = 'free';
  let transition = null;
  let previousPose = null;
  let lastDistance = controls.getDistance();
  let laptopDistance = initialLaptopPose.position.distanceTo(initialLaptopPose.target);
  let screenDistance = initialScreenPose.position.distanceTo(initialScreenPose.target);
  let enterDistance = Math.max(initialHomePose.position.distanceTo(initialHomePose.target) * SETTINGS.focusEnterRatio, laptopDistance * SETTINGS.focusApproachRatio);
  let wheelTime = -Infinity;
  let wheelGesture = null;
  let touchGesture = null;
  let activeZoomGesture = null;
  let elapsed = 0;
  let previousTime = null;
  let contextLost = false;
  let disposed = false;
  let touchedCamera = false;
  let desktopPointer = null;
  let pendingHover = null;
  let lastSystemPhase = system.state.phase;
  let animationFrame = null, wakeTimer = null, inFrame = false, suspended = false;
  let renderRequested = true, lastScreenOnly = false, lastDisplayBrightness = lid.brightness;
  let motionPausedAt = null;

  function pauseMotion() { motionPausedAt ??= performance.now(); }
  function resumeMotion() {
    if (transition && motionPausedAt !== null) transition.started += performance.now() - motionPausedAt;
    motionPausedAt = null;
  }

  function cancelFrame() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    if (wakeTimer !== null) window.clearTimeout(wakeTimer);
    animationFrame = wakeTimer = null;
    previousTime = null;
  }
  function requestFrame(forceRender = false) {
    if (contextLost || disposed || suspended || document.hidden) return;
    renderRequested ||= forceRender;
    if (wakeTimer !== null) { window.clearTimeout(wakeTimer); wakeTimer = null; }
    if (!inFrame && animationFrame === null) animationFrame = requestAnimationFrame(frame);
  }
  desktop.setInvalidate(() => requestFrame(true));
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'wheel', 'keydown']) {
    canvas.addEventListener(type, () => requestFrame(), captureOptions);
  }
  for (const type of ['keydown', 'keyup']) document.addEventListener(type, () => requestFrame(), { ...listenerOptions, capture: true });
  for (const button of [cameraCoverButton, lidButton, powerButton]) {
    for (const type of ['click', 'pointerdown', 'pointerup', 'keydown', 'keyup']) button.addEventListener(type, () => requestFrame(true), listenerOptions);
  }

  function announce(message) { announcement.textContent = message; }
  desktop.bindControls(desktopControls, announce, events.signal);
  function desktopInputEnabled() {
    return viewMode !== 'free' && !transition && !contextLost && !disposed && !document.hidden && !lid.closed && !lid.moving
      && (['desktop', 'login', 'locked'].includes(system.state.phase) || system.state.boot?.stage === 'limine');
  }
  function updateDesktopControls() {
    const hidden = !desktopInputEnabled();
    if (hidden && desktopControls.contains(document.activeElement)) canvas.focus({ preventScroll: true });
    desktopControls.hidden = hidden;
  }
  function desktopUv(event) {
    const hit = pickEvent(event);
    return hit?.kind === 'screen' ? hit.uv : null;
  }
  function pickEvent(event) {
    if (!eventHits.has(event)) eventHits.set(event, app.pickAt(event.clientX, event.clientY));
    return eventHits.get(event);
  }
  function applyPose(pose) {
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
  }
  function rememberCamera() {
    lastDistance = controls.getDistance();
    if (viewMode === 'free') {
      lastFreePose.position.copy(camera.position);
      lastFreePose.target.copy(controls.target);
    }
  }
  function updateControls() {
    controls.enableRotate = viewMode === 'free';
    controls.minDistance = viewMode === 'free' ? SETTINGS.minSceneDistance : viewMode === 'laptop' ? laptopDistance * SETTINGS.focusMinRatio : screenDistance;
    controls.enableDamping = !reducedMotion.matches;
  }
  function updateHud() {
    const immersive = viewMode === 'screen';
    if (immersive && document.activeElement && (document.activeElement === cameraCoverButton || document.activeElement === lidButton || document.activeElement === powerButton || masthead.contains(document.activeElement))) {
      canvas.focus({ preventScroll: true });
    }
    container.setAttribute('data-view-mode', viewMode);
    for (const element of [masthead, hint, cameraCoverButton, lidButton, powerButton]) element.hidden = immersive;
    hint.textContent = viewMode === 'free' ? 'Drag · Zoom · Select screen' : 'Zoom in to view screen · Zoom out to return';
    updateDesktopControls();
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
    updateDesktopControls();
  }
  function moveTo(pose) {
    powerInput.cancel();
    const fromOrbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const toOrbit = new THREE.Spherical().setFromVector3(pose.position.clone().sub(pose.target));
    // Take the short arc around the scene instead of a line through the laptop.
    toOrbit.theta = fromOrbit.theta + Math.atan2(Math.sin(toOrbit.theta - fromOrbit.theta), Math.cos(toOrbit.theta - fromOrbit.theta));
    transition = {
      from: { target: controls.target.clone() },
      to: pose,
      fromOrbit,
      toOrbit,
      started: performance.now(),
    };
    if (motionPausedAt !== null) motionPausedAt = transition.started;
    controls.enabled = false;
    pointers.clear();
    desktopPointer = null;
    desktop.handleInput({ type: 'pointercancel' }, null);
    pendingHover = null;
    updateDesktopControls();
    canvas.style.cursor = viewMode === 'free' ? 'grab' : 'default';
    if (reducedMotion.matches) finishTransition();
  }
  function clearDamping() {
    controls.enableDamping = false;
    controls.update();
  }
  function changeView(mode, pose) {
    desktop.closePanel(false);
    if (activeZoomGesture) activeZoomGesture.consumed = true;
    activeZoomGesture = null;
    if (!transition) clearDamping();
    touchedCamera = true;
    viewMode = mode;
    updateHud();
    updateControls();
    moveTo(pose);
    announce(mode === 'free' ? 'Returned to the previous scene view.' : mode === 'laptop'
      ? 'The laptop and keyboard are now in focus. Zoom in again to view the entire desktop. Zoom out or press Escape to return to the scene.'
      : 'The entire laptop desktop is now in view. Zoom out or press Escape to return to the laptop view.');
  }
  function openLaptop(pose = { position: camera.position, target: controls.target }) {
    if (viewMode !== 'free' || transition || contextLost || lid.closed || lid.moving) return;
    previousPose = { position: pose.position.clone(), target: pose.target.clone() };
    changeView('laptop', app.laptopPose());
  }
  function leaveLaptop() {
    if (viewMode === 'free' || contextLost) return;
    changeView('free', returnPose());
  }
  function stepBack() {
    if (viewMode === 'screen') changeView('laptop', app.laptopPose());
    else leaveLaptop();
  }
  function prepareZoom(gesture) {
    if (gesture.consumed || transition || contextLost || disposed || document.hidden) {
      gesture.consumed = true;
      return false;
    }
    activeZoomGesture = gesture;
    if (viewMode === 'free') rememberCamera();
    return true;
  }
  function checkZoom() {
    if (transition || !activeZoomGesture || activeZoomGesture.consumed) return;
    const distance = controls.getDistance();
    if (distance < lastDistance - 1e-6) {
      if (viewMode === 'free' && distance <= enterDistance) openLaptop(lastFreePose);
      else if (viewMode === 'laptop' && distance <= laptopDistance * SETTINGS.focusMinRatio + 1e-6) changeView('screen', app.screenPose());
    } else if (viewMode !== 'free' && distance > lastDistance + 1e-6) stepBack();
    if (!transition && activeZoomGesture && viewMode === 'laptop') applyPose(app.laptopPose(distance / laptopDistance));
    rememberCamera();
  }
  // Capture input before OrbitControls so inertia cannot skip a settled stage.
  function powerAvailable() {
    return !transition && !contextLost && !disposed && !document.hidden && !lid.closed && !lid.moving;
  }
  const powerInput = bindPowerInput({
    canvas, button: powerButton, system, keyboard,
    pickAt: (x, y, event) => pickEvent(event),
    isAvailable: powerAvailable,
    hasTouchPointers: () => touchPointers.size > 0,
    announce,
    signal: events.signal,
  });
  canvas.addEventListener('wheel', (event) => {
    if (powerInput.active) powerInput.cancel();
    if (event.deltaY === 0) return;
    if (desktopInputEnabled() && desktop.handleInput(event, desktopUv(event))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!wheelGesture || event.timeStamp - wheelTime >= SETTINGS.zoomGestureIdleMs) wheelGesture = { consumed: false };
    wheelTime = event.timeStamp;
    if (!prepareZoom(wheelGesture)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, captureOptions);
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    if (touchPointers.size === 0) touchGesture = { consumed: false };
    touchPointers.add(event.pointerId);
    if (transition) touchGesture.consumed = true;
  }, captureOptions);
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' || touchPointers.size < 2) return;
    if (!prepareZoom(touchGesture)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, captureOptions);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      touchPointers.delete(event.pointerId);
      if (touchPointers.size === 0) touchGesture = null;
    }, captureOptions);
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (touchPointers.size > 1) {
      desktop.handleInput({ type: 'pointercancel' }, null);
      desktopPointer = null;
      return;
    }
    if (event.button === 0 && desktopInputEnabled() && desktop.handleInput(event, desktopUv(event))) desktopPointer = event.pointerId;
    // OrbitControls still records pointers so a second finger can start a pinch.
  }, captureOptions);
  canvas.addEventListener('pointermove', (event) => {
    if (!desktopInputEnabled() || touchPointers.size > 1) return;
    if (desktopPointer === event.pointerId) {
      desktop.handleInput(event, desktopUv(event));
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (pointers.size === 0) pendingHover = event;
  }, captureOptions);
  canvas.addEventListener('pointerup', (event) => {
    if (desktopPointer !== event.pointerId) return;
    desktopPointer = null;
    pendingHover = null;
    if (desktopInputEnabled()) {
      canvas.focus({ preventScroll: true });
      desktop.handleInput(event, desktopUv(event));
    }
    // Let OrbitControls release its pointer capture on every pointerup.
  }, captureOptions);
  for (const type of ['pointercancel', 'lostpointercapture', 'pointerleave']) {
    canvas.addEventListener(type, (event) => {
      if (desktopPointer !== event.pointerId && type !== 'pointerleave') return;
      desktopPointer = null;
      desktop.handleInput(event, null);
    }, captureOptions);
  }
  function actionAt(event) {
    const hit = pickEvent(event);
    if (desktopInputEnabled() && hit?.kind === 'screen' && desktop.hitTest(hit.uv)) return 'desktop';
    if (viewMode === 'screen') return null;
    if (hit?.kind === 'lid') return 'lid';
    if (hit?.kind === 'power') return 'power';
    return hit?.kind === 'webcam' ? 'webcam' : viewMode === 'free' && hit?.kind === 'screen' ? 'screen' : null;
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
    powerInput.cancel();
    lid.setClosed(!lid.closed);
    if (lid.closed && viewMode !== 'free') leaveLaptop();
    lidButton.setAttribute('aria-pressed', String(lid.closed));
    if (lid.update(0, reducedMotion.matches)) renderer.shadowMap.needsUpdate = true;
    cameraCoverButton.disabled = lid.closed || lid.moving;
    announce(lid.closed ? 'Laptop lid closed.' : 'Laptop lid open.');
  }
  lidButton.addEventListener('click', toggleLaptopLid, listenerOptions);
  function resetKeyboard() {
    if (keyboard.reset()) renderer.shadowMap.needsUpdate = true;
  }
  function resetInput() {
    powerInput.cancel();
    resetKeyboard();
    desktopPointer = null;
    pendingHover = null;
    desktop.handleInput({ type: 'pointercancel' }, null);
    pointers.clear();
    touchPointers.clear();
    zoomKeys.clear();
    wheelGesture = null;
    touchGesture = null;
    activeZoomGesture = null;
    requestFrame(true);
  }
  function handleScreenKey(event) {
    if (!desktopInputEnabled() || !desktop.handleKey(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  canvas.addEventListener('keydown', handleScreenKey, captureOptions);
  desktopControls.addEventListener('keydown', handleScreenKey, captureOptions);
  document.addEventListener('keydown', (event) => {
    if (contextLost || disposed || document.hidden) return;
    if (isTextInput(document.activeElement) && event.key !== 'Escape') return;
    if (document.activeElement === powerButton && ['Enter', ' '].includes(event.key)) return;
    if (!event.repeat && event.code !== 'Power') keyboard.setPressed(event.code, true);
    if (event.key === 'Escape' && !event.repeat && viewMode !== 'free' && !transition) {
      event.preventDefault();
      if (!desktop.closePanel()) stepBack();
    }
  }, listenerOptions);
  document.addEventListener('keyup', (event) => {
    keyboard.setPressed(event.code, false);
    zoomKeys.delete(event.code || event.key);
  }, listenerOptions);
  window.addEventListener('blur', resetInput, listenerOptions);
  canvas.addEventListener('keydown', (event) => {
    const zoomKey = ['+', '=', '-'].includes(event.key);
    if (zoomKey) {
      const id = event.code || event.key;
      if (!zoomKeys.has(id)) zoomKeys.set(id, { consumed: false });
      event.preventDefault();
      if (!prepareZoom(zoomKeys.get(id))) return;
    }
    if (transition || contextLost || disposed || document.hidden) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (viewMode === 'free') openLaptop();
      return;
    }
    if (viewMode !== 'free' && event.key.startsWith('Arrow')) return;
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
  controls.addEventListener('change', () => { checkZoom(); requestFrame(true); });
  canvas.addEventListener('pointerdown', (event) => {
    if (contextLost || event.button !== 0 || desktopPointer === event.pointerId) return;
    const action = actionAt(event);
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
      pendingHover = event;
    }
  }, listenerOptions);
  canvas.addEventListener('pointerup', (event) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointer || pointer.moved || contextLost || (transition && pointer.action !== 'lid')) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SETTINGS.dragThreshold) return;
    if (!pointer.action || pointer.action !== actionAt(event)) return;
    canvas.focus({ preventScroll: true });
    if (pointer.action === 'webcam') toggleCameraCover();
    else if (pointer.action === 'lid') toggleLaptopLid();
    else openLaptop();
  }, listenerOptions);
  for (const event of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, (pointerEvent) => pointers.delete(pointerEvent.pointerId), listenerOptions);
  }
  canvas.addEventListener('pointerleave', () => {
    pendingHover = null;
    canvas.style.cursor = viewMode === 'free' ? 'grab' : 'default';
  }, listenerOptions);
  function frame(time) {
    animationFrame = null;
    if (contextLost || disposed || suspended || document.hidden) return;
    inFrame = true;
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    elapsed += delta;
    system.update(Date.now(), reducedMotion.matches);
    if (lastSystemPhase !== system.state.phase) {
      lastSystemPhase = system.state.phase;
      resetKeyboard();
      if (system.state.phase === 'off' && !system.state.restarting && viewMode === 'screen') changeView('laptop', app.laptopPose());
    }
    powerButton.disabled = !powerAvailable();
    const wasTransitioning = !!transition;
    let cameraChanged = false;
    if (transition) {
      const progress = Math.min((time - transition.started) / (SETTINGS.transitionSeconds * 1000), 1);
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
      // The immersive screen pose is fixed; gestures leave it before orbiting.
      if (viewMode !== 'screen') cameraChanged = controls.update(delta);
      rememberCamera();
    }
    const keysChanged = keyboard.update(delta, reducedMotion.matches);
    const coverChanged = webcam.update(delta, reducedMotion.matches);
    const lidChanged = lid.update(delta, reducedMotion.matches);
    if (keysChanged || coverChanged || lidChanged) renderer.shadowMap.needsUpdate = true;
    if (lidChanged) {
      cameraCoverButton.disabled = lid.closed || lid.moving;
    }
    const screenOnly = viewMode === 'screen' && !transition;
    if (pendingHover) {
      const event = pendingHover; pendingHover = null;
      if (pointers.size === 0 && touchPointers.size < 2) {
        if (desktopInputEnabled()) desktop.handleInput(event, desktopUv(event));
        if (event.pointerType === 'mouse') {
          const action = actionAt(event);
          canvas.style.cursor = action && (!transition || action === 'lid') ? 'pointer' : viewMode === 'free' ? 'grab' : 'default';
        }
      }
    }
    const steamVisible = !reducedMotion.matches && !screenOnly;
    if (steamVisible) steam.update(elapsed);
    scene.fog.near = controls.getDistance() + 6;
    scene.fog.far = scene.fog.near + 20;
    updateDesktopControls();
    const painted = desktop.update();
    const displayChanged = lastDisplayBrightness !== lid.brightness;
    lastDisplayBrightness = lid.brightness;
    if (renderRequested || cameraChanged || wasTransitioning || painted || displayChanged || steamVisible
      || screenOnly !== lastScreenOnly || !screenOnly && (keysChanged || coverChanged || lidChanged)) app.render(screenOnly);
    lastScreenOnly = screenOnly;
    renderRequested = false;
    inFrame = false;
    if (transition || cameraChanged || keyboard.moving || webcam.moving || lid.animating || desktop.animating || system.animating || steamVisible) requestFrame();
    else {
      previousTime = null;
      const next = Math.min(system.nextUpdateAt ?? Infinity, desktop.nextUpdateAt ?? Infinity);
      if (Number.isFinite(next)) wakeTimer = window.setTimeout(() => { wakeTimer = null; requestFrame(); }, Math.max(1, Math.ceil(next - Date.now())));
    }
  }
  const observer = new ResizeObserver(() => {
    if (disposed || contextLost) return;
    const zoomRatio = viewMode === 'laptop' && !transition ? controls.getDistance() / laptopDistance : 1;
    activeZoomGesture = null;
    app.resize();
    const laptopPose = app.laptopPose();
    const screenPose = app.screenPose();
    const homePose = app.homePose();
    laptopDistance = laptopPose.position.distanceTo(laptopPose.target);
    screenDistance = screenPose.position.distanceTo(screenPose.target);
    enterDistance = Math.max(homePose.position.distanceTo(homePose.target) * SETTINGS.focusEnterRatio, laptopDistance * SETTINGS.focusApproachRatio);
    updateControls();
    if (transition) moveTo(viewMode === 'free' ? returnPose() : viewMode === 'laptop' ? laptopPose : screenPose);
    else {
      if (viewMode === 'screen') applyPose(screenPose);
      else if (viewMode === 'laptop') {
        applyPose(app.laptopPose(zoomRatio));
      } else if (!touchedCamera) applyPose(homePose);
      controls.update();
      rememberCamera();
    }
    requestFrame(true);
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
    requestFrame(true);
  }, listenerOptions);
  updateControls();
  updateHud();
  steam.points.visible = !reducedMotion.matches;
  document.addEventListener('visibilitychange', () => {
    previousTime = null;
    if (document.hidden) { pauseMotion(); resetInput(); }
    else if (!suspended) resumeMotion();
    updateDesktopControls();
    cancelFrame();
    if (!document.hidden) requestFrame(true);
  }, listenerOptions);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cameraCoverButton.disabled = true;
    lidButton.disabled = true;
    desktop.closePanel(false);
    updateDesktopControls();
    resetInput();
    cancelFrame();
    showError('Graphics rendering was interrupted. Reload the scene to continue.');
  }, listenerOptions);
  window.addEventListener('pagehide', (event) => {
    suspended = true;
    pauseMotion();
    cancelFrame();
    resetInput();
    if (event.persisted) return;
    disposed = true;
    observer.disconnect();
    events.abort();
    app.dispose();
  }, listenerOptions);
  window.addEventListener('pageshow', () => {
    suspended = false;
    if (!document.hidden) resumeMotion();
    previousTime = null;
    requestFrame(true);
  }, listenerOptions);
  document.querySelector('#loading').hidden = true;
  container.setAttribute('aria-busy', 'false');
  requestFrame(true);
}
