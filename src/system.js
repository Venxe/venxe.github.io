// This is a local desktop simulation, not an authentication boundary.
const PASSWORD_DIGEST = '8cd6cb7e1601eb5dcd0a0d3d8f62c2dd8ee483819f9130a34259a217e927679f';
const DURATIONS = { 'shutting-down': 1400, off: 600, booting: 1800, 'signing-out': 350, 'signing-in': 350 };

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

  function duration() {
    const value = DURATIONS[phase] || 0;
    return reducedMotion ? Math.min(value, 400) : value;
  }
  function enter(next, at = now) {
    phase = next;
    started = at;
    error = '';
    verifying = false;
    generation++;
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
      else if (phase === 'booting') { restarting = false; enter('login', at); }
      else if (phase === 'signing-out') enter('login', at);
      else if (phase === 'signing-in') enter(closed ? 'login' : 'desktop', at);
      else break;
    }
  }
  async function login(password) {
    if (phase !== 'login' || closed || verifying || typeof password !== 'string' || !password.length || password.length > 128) return;
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
    if (matches) enter('signing-in');
    else error = unavailable ? 'Sign in is unavailable. Please try again.' : 'Incorrect password. Try again.';
  }
  function send(event, value) {
    if (disposed) return;
    update();
    if (event === 'lid') {
      closed = !!value;
      if (closed) {
        hold = null;
        if (phase === 'desktop' || phase === 'signing-in' || phase === 'login') enter('login');
      }
    } else if (event === 'press') {
      if (!closed && !hold) hold = { started: now, wasOff: phase === 'off' && !restarting };
    } else if (event === 'cancel-press') hold = null;
    else if (event === 'release') {
      const shouldBoot = hold?.wasOff && phase === 'off' && !restarting && !closed;
      hold = null;
      if (shouldBoot) enter('booting');
    } else if (event === 'login') return login(value);
    else if (event === 'logout' && phase === 'desktop') enter('signing-out');
    else if (['shutdown', 'restart'].includes(event) && ['desktop', 'login'].includes(phase)) {
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
      const brightness = phase === 'off' ? 0 : reducedMotion ? 1
        : phase === 'shutting-down' ? Math.min(1, (1 - progress) * 5)
          : phase === 'booting' ? Math.min(1, progress * 6) : 1;
      return Object.freeze({ phase, error, verifying, restarting, closed, brightness, reducedMotion });
    },
    dispose() { disposed = true; hold = null; verifying = false; generation++; },
  };
}
