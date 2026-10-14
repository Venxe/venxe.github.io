import { BOOT_ENTRIES, BOOT_STAGES, BOOT_ANIMATION } from './boot-profile.js';

// This is a local desktop simulation, not an authentication boundary.
const PASSWORD_DIGEST = '8cd6cb7e1601eb5dcd0a0d3d8f62c2dd8ee483819f9130a34259a217e927679f';
const DURATIONS = { 'shutting-down': 1400, off: 600, 'signing-out': 350, 'signing-in': 350, unlocking: 350 };

export function createSystem() {
  let phase = 'desktop';
  let started = Date.now();
  let now = started;
  let reducedMotion = false;
  let restarting = false;
  let closed = false;
  let error = '';
  let verifying = false;
  let generation = 0;
  let hold = null;
  let disposed = false;
  let bootStage = 0;
  let selectedEntry = 'normal';
  let bootInterrupted = false;
  let boot = null;
  let displayBrightness = 1;

  function duration() {
    if (phase === 'booting' && BOOT_STAGES[bootStage].id === 'limine') return bootInterrupted ? 0 : BOOT_STAGES[bootStage].duration;
    const value = phase === 'booting' ? BOOT_STAGES[bootStage].duration : DURATIONS[phase] || 0;
    return reducedMotion ? Math.min(value, 400) : value;
  }
  function refreshBoot() {
    if (phase !== 'booting') { boot = null; return; }
    const stage = BOOT_STAGES[bootStage];
    const entry = BOOT_ENTRIES.find((entry) => entry.id === selectedEntry);
    const lines = stage.id === 'loader' ? entry.loadingLines : stage.lines;
    const elapsed = Math.max(0, now - started) * stage.duration / (duration() || stage.duration);
    const count = lines.filter((line) => elapsed >= line.at).length;
    const frame = Math.floor(Math.max(0, now - started) * BOOT_ANIMATION.fps / 1000);
    const frameIndex = stage.id === 'plymouth-hold' || (stage.id.startsWith('plymouth-') && reducedMotion) ? BOOT_ANIMATION.logoFrames - 1
      : stage.id === 'plymouth-throbber' ? frame % BOOT_ANIMATION.throbberFrames
        : stage.id === 'plymouth-logo' ? Math.min(frame, BOOT_ANIMATION.logoFrames - 1) : null;
    const countdownSeconds = stage.id === 'limine' && !bootInterrupted ? Math.max(0, Math.ceil((duration() - (now - started)) / 1000)) : null;
    if (boot?.stage === stage.id && boot.selectedEntry === selectedEntry && boot.countdownSeconds === countdownSeconds && boot.lines.length === count && boot.frameIndex === frameIndex) return;
    const visibleLines = lines.slice(0, count);
    boot = Object.freeze({ stage: stage.id, selectedEntry, countdownSeconds, frameIndex, lines: Object.freeze(visibleLines) });
  }
  function enter(next, at = now) {
    phase = next;
    started = at;
    error = '';
    verifying = false;
    generation++;
    if (next === 'booting') { bootStage = 0; selectedEntry = 'normal'; bootInterrupted = false; }
    refreshBoot();
  }
  function update(time = Date.now(), reduce = reducedMotion) {
    if (disposed) return;
    now = time;
    reducedMotion = reduce;
    if (hold && !hold.wasOff && now - hold.started >= 2000) {
      hold = null;
      restarting = false;
      enter('off');
    }
    // Catch up after a background tab without depending on rendered frame count.
    while (duration() && now >= started + duration()) {
      const at = started + duration();
      if (phase === 'shutting-down') enter('off', at);
      else if (phase === 'off' && restarting) enter('booting', at);
      else if (phase === 'booting') {
        if (bootStage + 1 < BOOT_STAGES.length) { bootStage++; started = at; }
        else { restarting = false; enter('login', at); }
      }
      else if (phase === 'signing-out') enter('login', at);
      else if (phase === 'signing-in') enter(closed ? 'login' : 'desktop', at);
      else if (phase === 'unlocking') enter(closed ? 'locked' : 'desktop', at);
      else break;
    }
    refreshBoot();
  }
  async function login(password) {
    if (!['login', 'locked'].includes(phase) || closed || verifying || typeof password !== 'string' || !password.length || password.length > 128) return;
    const unlocking = phase === 'locked';
    error = '';
    verifying = true;
    const attempt = ++generation;
    let matches = false;
    let unavailable = false;
    const bytes = new TextEncoder().encode(password);
    password = '';
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      matches = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') === PASSWORD_DIGEST;
    } catch {
      unavailable = true;
    } finally {
      bytes.fill(0);
    }
    if (disposed || attempt !== generation) return;
    verifying = false;
    now = Date.now();
    if (matches) enter(unlocking ? 'unlocking' : 'signing-in');
    else error = unavailable ? 'Sign in is unavailable. Please try again.' : 'Incorrect password. Try again.';
  }
  function send(event, value) {
    if (disposed || typeof event !== 'string') return;
    update();
    if (event === 'lid') {
      closed = !!value;
      if (closed) {
        hold = null;
        if (['desktop', 'locked', 'unlocking'].includes(phase)) enter('locked');
        else if (phase === 'signing-in' || phase === 'login') enter('login');
      }
    } else if (event === 'press') {
      if (!closed && !hold) hold = { started: now, wasOff: phase === 'off' && !restarting };
    } else if (event === 'cancel-press') hold = null;
    else if (event === 'release') {
      const shouldBoot = hold?.wasOff && phase === 'off' && !restarting && !closed;
      hold = null;
      if (shouldBoot) enter('booting');
    } else if (event.startsWith('boot-') && phase === 'booting' && boot.stage === 'limine' && !closed) {
      if (event === 'boot-select' && BOOT_ENTRIES.some((entry) => entry.id === value)) {
        selectedEntry = value;
        bootInterrupted = true;
      } else if (event === 'boot-interrupt') bootInterrupted = true;
      else if (event === 'boot-confirm') { bootStage++; started = now; }
      refreshBoot();
    } else if (event === 'login') return login(value);
    else if (event === 'lock' && phase === 'desktop') enter('locked');
    else if (event === 'brightness' && Number.isFinite(value)) displayBrightness = Math.max(0.1, Math.min(1, value));
    else if (event === 'logout' && phase === 'desktop') enter('signing-out');
    else if (['shutdown', 'restart'].includes(event) && ['desktop', 'login', 'locked', 'signing-in', 'unlocking'].includes(phase)) {
      restarting = event === 'restart';
      hold = null;
      enter('shutting-down');
    }
  }
  return {
    send,
    update,
    get state() {
      const progress = duration() ? Math.min(1, Math.max(0, (now - started) / duration())) : 0;
      const brightness = phase === 'off' || boot?.stage === 'firmware' ? 0 : reducedMotion ? 1
        : phase === 'shutting-down' ? Math.min(1, (1 - progress) * 5)
          : 1;
      return Object.freeze({ phase, boot, error, verifying, restarting, closed, brightness: brightness * displayBrightness, reducedMotion });
    },
    dispose() { disposed = true; hold = null; verifying = false; generation++; },
  };
}
