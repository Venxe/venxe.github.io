import { SETTINGS } from './config.js';

// Capture physical power input before camera and desktop handlers see the gesture.
export function bindPowerInput({ canvas, button, system, keyboard, pickAt, isAvailable, hasTouchPointers, announce, signal }) {
  const listenerOptions = { signal };
  const captureOptions = { ...listenerOptions, capture: true, passive: false };
  let powerPress = null;
  let powerClickHandledAt = -Infinity;

  function cancelPowerPress() {
    system.send('cancel-press');
    keyboard.setPressed('Power', false);
    powerPress = null;
  }
  function beginPowerPress(source, event) {
    if (!isAvailable() || powerPress) return;
    powerPress = { source, id: event.pointerId, x: event.clientX, y: event.clientY };
    system.send('press');
    keyboard.setPressed('Power', true);
    announce(system.state.phase === 'off' ? 'Release to start up.' : 'Hold for two seconds to power off.');
  }
  function endPowerPress() {
    if (powerPress && powerPress.source !== 'canvas') powerClickHandledAt = Date.now();
    system.send('release');
    keyboard.setPressed('Power', false);
    powerPress = null;
  }
  // Own the power gesture before OrbitControls can interpret it as a camera drag.
  canvas.addEventListener('pointerdown', (event) => {
    if (powerPress) {
      cancelPowerPress();
      event.stopImmediatePropagation();
      return;
    }
    if (event.button !== 0 || hasTouchPointers() || !isAvailable() || pickAt(event.clientX, event.clientY)?.kind !== 'power') return;
    beginPowerPress('canvas', event);
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  }, captureOptions);
  canvas.addEventListener('pointermove', (event) => {
    if (powerPress?.source !== 'canvas' || powerPress.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - powerPress.x, event.clientY - powerPress.y) > SETTINGS.dragThreshold
      || pickAt(event.clientX, event.clientY)?.kind !== 'power') cancelPowerPress();
    event.preventDefault();
    event.stopImmediatePropagation();
  }, captureOptions);
  canvas.addEventListener('pointerup', (event) => {
    if (powerPress?.source !== 'canvas' || powerPress.id !== event.pointerId) return;
    if (isAvailable() && pickAt(event.clientX, event.clientY)?.kind === 'power') endPowerPress();
    else cancelPowerPress();
    canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, captureOptions);
  for (const type of ['pointercancel', 'lostpointercapture', 'pointerleave']) {
    canvas.addEventListener(type, () => { if (powerPress?.source === 'canvas') cancelPowerPress(); }, captureOptions);
  }
  button.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) beginPowerPress('keyboard', event);
  }, listenerOptions);
  button.addEventListener('keyup', (event) => {
    if (['Enter', ' '].includes(event.key) && powerPress?.source === 'keyboard') { event.preventDefault(); endPowerPress(); }
  }, listenerOptions);
  button.addEventListener('pointerdown', (event) => {
    if (powerPress) { cancelPowerPress(); return; }
    if (event.button === 0) { beginPowerPress('button', event); button.setPointerCapture(event.pointerId); }
  }, listenerOptions);
  button.addEventListener('pointerup', (event) => {
    if (powerPress?.source === 'button' && powerPress.id === event.pointerId) endPowerPress();
  }, listenerOptions);
  button.addEventListener('pointermove', (event) => {
    if (powerPress?.source === 'button' && Math.hypot(event.clientX - powerPress.x, event.clientY - powerPress.y) > SETTINGS.dragThreshold) cancelPowerPress();
  }, listenerOptions);
  for (const type of ['blur', 'pointercancel', 'lostpointercapture', 'pointerleave']) button.addEventListener(type, () => {
    if (powerPress && powerPress.source !== 'canvas') cancelPowerPress();
  }, listenerOptions);
  button.addEventListener('click', (event) => {
    if (Date.now() - powerClickHandledAt < 100) return;
    // Assistive technologies can activate a button without a preceding key/pointer event.
    if (event.detail === 0 && isAvailable() && system.state.phase === 'off') {
      system.send('press');
      system.send('release');
    }
  }, listenerOptions);
  return {
    cancel: cancelPowerPress,
    get active() { return powerPress !== null; },
  };
}
