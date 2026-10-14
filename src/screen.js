import * as THREE from 'three';
import { DESKTOP_SIZE } from './config.js';
import { createSystem } from './system.js';
import { createDesktopShell } from './desktop-shell.js';
import { desktopLayout, inside } from './desktop-layout.js';
import { createScreenPainter } from './screen-painter.js';
import { THEME, WALLPAPERS, FONTS, fullDate, isTextInput } from './desktop-theme.js';
import { BOOT_ENTRIES, BOOT_MENU, BOOT_ANIMATION } from './boot-profile.js';

export function createScreen(system = createSystem()) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas, DESKTOP_SIZE);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const assets = new Map(), controls = new Map(), controlEvents = new Map();
  const events = new AbortController();
  const shell = createDesktopShell();
  const paint = createScreenPainter(canvas, assets);
  const bootLogo = [], bootThrobber = [];
  let bootAnimationsRequested = false, disposed = false, dirty = true;
  let root = null, announce = () => {}, layout = { items: [], surfaces: [] };
  let now = Date.now(), lastMinute = -1, lastAnimation = -1, inputAt = 0, errorAt = 0;
  let phase = system.state.phase, closed = system.state.closed, lastBoot = null, lastError = '', lastVerifying = false;
  let revealed = false, revealAt = 0, revealProgress = 0, panelAt = 0, lastPanel = null;
  let gesture = null, hover = null, focused = null, hoverPanel = null;
  let bootExpanded = true, snapshotsExpanded = false, bootCursor = 'boot-normal';

  function loadImage(path, boot = false) {
    const image = new Image();
    for (const type of ['load', 'error']) image.addEventListener(type, () => { if (!boot || system.state.phase === 'booting') dirty = true; }, { signal: events.signal });
    image.src = new URL(path, import.meta.url).href; return image;
  }
  for (const name of [...WALLPAPERS, 'avatar.jpg', 'dino.png']) assets.set(name, loadImage(`../assets/desktop/${name}`));
  if (document.fonts) {
    Promise.allSettled(Object.values(FONTS).map(font => document.fonts.load(`16px "${font}"`))).then(() => { if (!disposed) dirty = true; });
    document.fonts.addEventListener('loadingdone', () => { dirty = true; }, { signal: events.signal });
  }
  function bootArtwork(state) {
    if (state.phase !== 'booting') return null;
    const final = BOOT_ANIMATION.logoFrames - 1;
    const load = name => loadImage(`../assets/boot/cachyos/${name}.png`, true);
    bootLogo[final] ||= load(`animation-${final}`);
    if (!state.reducedMotion && !bootAnimationsRequested) {
      bootAnimationsRequested = true;
      for (let i = 0; i < final; i++) bootLogo[i] = load(`animation-${String(i).padStart(2, '0')}`);
      for (let i = 0; i < BOOT_ANIMATION.throbberFrames; i++) bootThrobber[i] = load(`throbber-${String(i).padStart(2, '0')}`);
    }
    if (!state.boot.stage.startsWith('plymouth-')) return null;
    const loaded = image => image?.complete && image.naturalWidth > 0;
    const throbber = state.boot.stage === 'plymouth-throbber' && !state.reducedMotion;
    const frames = throbber ? bootThrobber : bootLogo;
    if (!state.reducedMotion && frames.length && frames.every(loaded)) return { image: frames[state.boot.frameIndex], size: throbber ? BOOT_ANIMATION.throbberSize : BOOT_ANIMATION.logoSize };
    return loaded(bootLogo[final]) ? { image: bootLogo[final], size: BOOT_ANIMATION.logoSize } : null;
  }
  function arrange() {
    layout = desktopLayout(system.state, shell.state, new Date(now), revealed);
    if (system.state.boot?.stage !== 'limine') return;
    const { x, y, width, rowHeight } = BOOT_MENU;
    const row = (id, label, prefix, extra = {}) => layout.items.push({ id, label, prefix, x, y: y + layout.items.length * rowHeight, w: width, h: rowHeight, type: 'button', selected: bootCursor === id, ...extra });
    row('boot-cachyos', 'CachyOS', bootExpanded ? '[-] ' : '[+] ', { expanded: bootExpanded });
    if (bootExpanded) {
      BOOT_ENTRIES.forEach(entry => row(`boot-${entry.id}`, entry.label, ' ├──► '));
      row('boot-snapshots', 'Snapshots', snapshotsExpanded ? ' └[-] ' : ' └[+] ', { expanded: snapshotsExpanded });
      if (snapshotsExpanded) row('boot-empty', 'No snapshots available', '      ', { type: 'text' });
    }
  }
  function focusControl(id) {
    if (!root || root.hidden || document.hidden) return;
    const active = document.activeElement;
    if (active && !root.contains(active) && !['CANVAS', 'BODY'].includes(active.tagName)) return;
    controls.get(id)?.focus({ preventScroll: true });
  }
  function createControl(entry) {
    const input = ['password', 'search', 'range'].includes(entry.type);
    const element = document.createElement(input ? 'input' : 'button');
    element.setAttribute('data-control', entry.id);
    element.setAttribute('type', input ? entry.type : 'button');
    if (input) element.value = '';
    const lifetime = new AbortController(); controlEvents.set(entry.id, lifetime);
    const options = { signal: lifetime.signal };
    if (entry.type === 'password') {
      element.setAttribute('maxlength', '128'); element.setAttribute('autocomplete', 'current-password');
      element.setAttribute('aria-describedby', 'desktop-login-error'); element.spellcheck = false;
    } else if (entry.type === 'search') { element.setAttribute('maxlength', '80'); element.setAttribute('autocomplete', 'off'); element.spellcheck = false; }
    else if (entry.type === 'range') { element.min = entry.min ?? 0; element.max = 100; element.step = 1; }
    element.addEventListener('focus', () => { focused = entry.id; dirty = true; }, options);
    element.addEventListener('blur', () => { if (focused === entry.id) focused = null; dirty = true; }, options);
    element.addEventListener(input ? 'input' : 'click', () => {
      if (!enabled()) return;
      inputAt = now;
      if (entry.type === 'password') dirty = true;
      else if (entry.type === 'search') { shell.send('search', element.value, now); refresh(); }
      else if (entry.type === 'range') { changeRange(entry.id, Number(element.value)); refresh(); }
      else activate(entry.id);
    }, options);
    element.addEventListener('keydown', event => {
      if (!enabled() || event.isComposing) return;
      if (entry.type === 'password' && event.key === 'Enter') { event.preventDefault(); submitLogin(); }
      if (entry.date !== undefined) {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        const current = layout.items.find(item => item.id === entry.id);
        if (offset && current) { event.preventDefault(); const date = new Date(current.date); date.setDate(date.getDate() + offset); shell.send('date', date.getTime(), now); refresh(); focusControl(layout.items.find(item => item.date === shell.state.selected)?.id); }
      }
    }, options);
    root.querySelector('[data-native]').append(element); controls.set(entry.id, element); return element;
  }
  function enabled() { return !disposed && root && !root.hidden && !document.hidden && !system.state.closed; }
  function syncControls() {
    if (!root) return;
    root.setAttribute('aria-label', system.state.phase === 'login' ? 'SDDM Locklike sign in' : system.state.phase === 'locked' ? 'Caelestia session lock' : 'Caelestia desktop');
    const ids = new Set(layout.items.filter(e => e.type !== 'text').map(e => e.id));
    for (const [id, element] of controls) {
      element.hidden = !ids.has(id);
      if (element.hidden && /^(focus|close|fullscreen|notification)-/.test(id)) {
        if (document.activeElement === element) focusControl('launcher');
        controlEvents.get(id).abort(); controlEvents.delete(id); element.remove(); controls.delete(id);
      }
    }
    for (const entry of layout.items) {
      if (entry.type === 'text') continue;
      const element = controls.get(entry.id) || createControl(entry);
      element.hidden = false; element.disabled = !!entry.disabled;
      element.setAttribute('aria-label', entry.dateLabel || entry.label);
      if (entry.type === 'range') { element.value = String(entry.value); element.setAttribute('aria-valuetext', `${entry.value}%`); }
      else if (entry.type === 'search') { if (element.value !== shell.state.query) element.value = shell.state.query; }
      else if (entry.type !== 'password') element.textContent = entry.label;
      if (entry.selected !== undefined) element.setAttribute('aria-pressed', String(entry.selected));
      if (entry.date !== undefined) { element.setAttribute('aria-current', entry.today ? 'date' : 'false'); element.tabIndex = entry.selected ? 0 : -1; }
      if (entry.expanded !== undefined) element.setAttribute('aria-expanded', String(entry.expanded));
      if (['launcher', 'dashboard', 'utilities', 'network', 'battery', 'session', 'sidebar'].includes(entry.id)) element.setAttribute('aria-expanded', String(shell.state.panel === entry.id));
      if (entry.type === 'password') element.setAttribute('aria-invalid', String(!!system.state.error));
    }
    root.querySelector('[data-login-error]').textContent = system.state.error;
  }
  function refresh() { dirty = true; arrange(); syncControls(); }
  function clearPassword() { const input = controls.get('password'); if (input) input.value = ''; }
  function closePanel(restoreFocus = true) {
    const panel = shell.state.panel;
    if (!panel) return false;
    shell.send('dismiss'); gesture = null; hover = null; refresh();
    if (restoreFocus) focusControl(panel === 'audio' ? 'utilities' : panel);
    return true;
  }
  function revealLogin() {
    if (system.state.phase !== 'login' || system.state.closed || revealed) return false;
    revealed = true; revealAt = now; revealProgress = system.state.reducedMotion ? 1 : 0; refresh(); focusControl('password'); announce('Enter your password to sign in.'); return true;
  }
  async function submitLogin() {
    const input = controls.get('password');
    if (!enabled() || !input || input.hidden || !['login', 'locked'].includes(system.state.phase) || system.state.verifying) return;
    if (!input.value) { focusControl('password'); return; }
    const result = system.send('login', input.value); clearPassword(); refresh(); await result;
    if (!disposed) { update(); focusControl('password'); }
  }
  function activate(id) {
    hoverPanel = null;
    const entry = layout.items.find(item => item.id === id && !item.disabled);
    if (!entry && id !== 'dismiss') return;
    if (id.startsWith('boot-')) {
      system.send('boot-interrupt'); bootCursor = id;
      if (id === 'boot-cachyos') bootExpanded = !bootExpanded;
      else if (id === 'boot-snapshots') snapshotsExpanded = !snapshotsExpanded;
      else { system.send('boot-select', id.slice(5)); system.send('boot-confirm'); }
    } else if (id === 'unlock') revealLogin();
    else if (id === 'password' || id === 'search') focusControl(id);
    else if (id === 'login') submitLogin();
    else if (['lock', 'logout', 'restart', 'shutdown'].includes(id)) { closePanel(false); system.send(id); }
    else if (id === 'dismiss') closePanel();
    else if (['launcher', 'dashboard', 'utilities', 'session', 'network', 'battery', 'sidebar'].includes(id)) {
      shell.send('toggle', id, now); panelAt = now; refresh();
      if (shell.state.panel) focusControl(id === 'launcher' ? 'search' : id === 'dashboard' ? 'tab-0' : id === 'session' ? 'lock' : id === 'utilities' ? 'volume' : id);
    } else if (id === 'network-open') { shell.send('toggle', 'network', now); panelAt = now; }
    else if (id.startsWith('tab-')) shell.send('tab', Number(id.slice(4)), now);
    else if (id.startsWith('workspace-')) shell.send('workspace', Number(id.slice(10)), now);
    else if (id.startsWith('app-')) {
      const app = id.slice(4);
      if (['terminal', 'wallpapers'].includes(app)) shell.send('open', app, now);
      else if (app === 'lock') { closePanel(false); system.send('lock'); }
      else { shell.send('toggle', app, now); panelAt = now; }
    } else if (id.startsWith('focus-')) shell.send('focus', Number(id.slice(6)), now);
    else if (id.startsWith('close-')) shell.send('close', Number(id.slice(6)), now);
    else if (id.startsWith('fullscreen-')) shell.send('fullscreen', Number(id.slice(11)), now);
    else if (id.startsWith('wallpaper-')) shell.send('wallpaper', Number(id.slice(10)), now);
    else if (id.startsWith('network-')) shell.send('network', Number(id.slice(8)), now);
    else if (id.startsWith('notification-')) shell.send('remove-notification', Number(id.slice(13)), now);
    else if (id.startsWith('day-')) { shell.send('date', entry.date, now); announce(fullDate(new Date(entry.date))); }
    else if (id === 'previous' || id === 'next') shell.send('month', id === 'previous' ? -1 : 1, now);
    else if (id === 'today') shell.send('date', now, now);
    else if (['wifi', 'mute', 'power', 'dnd', 'media', 'clear-notifications'].includes(id)) shell.send(id, null, now);
    else if (id === 'active-window') focusControl(`focus-${shell.state.focus}`);
    refresh();
    if (id === 'app-terminal' || id === 'app-wallpapers') focusControl(`focus-${shell.state.focus}`);
    update();
  }
  function changeRange(id, value) { shell.send(id, value, now); if (id === 'brightness') system.send('brightness', shell.state.brightness / 100); }
  const pointAt = uv => uv ? { x: uv.x * canvas.width, y: (1 - uv.y) * canvas.height } : null;
  function hitTest(uv) {
    const point = pointAt(uv);
    const inPanel = layout.surfaces.some(box => inside(point, box));
    for (const entry of [...layout.items].reverse()) {
      if (entry.type === 'text' || entry.disabled || inPanel && !entry.panel) continue;
      if (inside(point, entry)) return entry.id;
    }
    return inPanel ? 'panel' : shell.state.panel && point ? 'dismiss' : null;
  }
  function handleKey(event) {
    if (!enabled() || event.isComposing) return false;
    if (event.key === 'Escape') {
      if (closePanel()) return true;
      if (system.state.phase === 'login' && revealed) { revealed = false; clearPassword(); refresh(); focusControl('unlock'); return true; }
      return false;
    }
    if (system.state.boot?.stage === 'limine') {
      system.send('boot-interrupt');
      const rows = layout.items.filter(item => item.type === 'button');
      const target = event.target?.dataset?.control;
      const index = Math.max(0, rows.findIndex(item => item.id === (rows.some(row => row.id === target) ? target : bootCursor)));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : event.key === 'ArrowUp' ? (index + rows.length - 1) % rows.length : event.key === 'ArrowDown' ? (index + 1) % rows.length : null;
      if (next !== null) { bootCursor = rows[next].id; if (['boot-normal', 'boot-lts'].includes(bootCursor)) system.send('boot-select', bootCursor.slice(5)); refresh(); focusControl(bootCursor); return true; }
      if (['Enter', ' ', 'ArrowRight'].includes(event.key)) { if (!event.repeat) activate(rows[index].id); return true; }
      if (event.key === 'ArrowLeft') { bootExpanded = false; bootCursor = 'boot-cachyos'; refresh(); focusControl(bootCursor); return true; }
      update(); return !['Tab', '+', '=', '-'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey;
    }
    if (system.state.phase === 'login' && !revealed && event.key !== 'Tab') { if (!event.repeat) revealLogin(); return true; }
    if (shell.state.panel === 'launcher' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      if (event.key === 'Enter') { const app = shell.state.results[shell.state.choice]; if (app && !event.repeat) activate(`app-${app.id}`); }
      else { shell.send('choice', shell.state.choice + (event.key === 'ArrowDown' ? 1 : -1)); refresh(); }
      return true;
    }
    if (isTextInput(event.target) || isTextInput(document.activeElement)) return false;
    if (system.state.phase === 'desktop' && event.altKey && /^[1-5]$/.test(event.key)) { shell.send(event.shiftKey ? 'move' : 'workspace', Number(event.key), now); refresh(); return true; }
    if (system.state.phase === 'desktop' && event.altKey && event.key.toLowerCase() === 'd') { if (!event.repeat) activate('launcher'); return true; }
    return false;
  }
  function handleInput(event, uv) {
    if (disposed) return false;
    const point = pointAt(uv), target = hitTest(uv);
    if (system.state.boot?.stage === 'limine' && point && ['pointerdown', 'pointermove', 'wheel'].includes(event.type)) {
      system.send('boot-interrupt');
      if (event.type === 'pointermove' && !gesture && target?.startsWith('boot-')) {
        bootCursor = target;
        if (['boot-normal', 'boot-lts'].includes(target)) system.send('boot-select', target.slice(5));
      }
      if (event.type === 'wheel') {
        const rows = layout.items.filter(e => e.type === 'button');
        bootCursor = rows[Math.max(0, Math.min(rows.length - 1, rows.findIndex(e => e.id === bootCursor) + Math.sign(event.deltaY)))].id;
        if (['boot-normal', 'boot-lts'].includes(bootCursor)) system.send('boot-select', bootCursor.slice(5)); refresh(); update(); return true;
      }
      refresh();
    }
    if (event.type === 'wheel') {
      if (target?.startsWith('workspace-')) { shell.send('workspace', Math.max(1, Math.min(5, shell.state.workspace + Math.sign(event.deltaY))), now); refresh(); return true; }
      return layout.surfaces.some(box => inside(point, box));
    }
    if (event.type === 'pointerdown') {
      if (!target) return false;
      gesture = { id: target, x: point.x, y: point.y, moved: false };
      if (['volume', 'brightness'].includes(target)) slide(target, point);
      return true;
    }
    if (event.type === 'pointermove') {
      if (gesture) { if (point && Math.hypot(point.x - gesture.x, point.y - gesture.y) > 6) gesture.moved = true; if (point && ['volume', 'brightness'].includes(gesture.id)) slide(gesture.id, point); return true; }
      if (hover !== target) { hover = target; dirty = true; }
      if (event.pointerType !== 'touch' && system.state.phase === 'desktop') {
        if (['network', 'battery'].includes(target) && !shell.state.panel) { hoverPanel = target; shell.send('toggle', target, now); refresh(); }
        else if (hoverPanel && target !== hoverPanel && !layout.surfaces.some(box => inside(point, box))) { shell.send('dismiss'); hoverPanel = null; refresh(); }
      }
      return false;
    }
    if (event.type === 'pointerup') {
      if (!gesture) return false;
      const previous = gesture; gesture = null;
      if (['volume', 'brightness'].includes(previous.id)) announce(`${previous.id} ${shell.state[previous.id]}%.`);
      else if (!previous.moved && target === previous.id) activate(target);
      return true;
    }
    if (['pointercancel', 'lostpointercapture', 'pointerleave'].includes(event.type)) { gesture = null; if (hover !== null) { hover = null; dirty = true; } }
    return false;
  }
  function slide(id, point) { const entry = layout.items.find(item => item.id === id); if (entry) { changeRange(id, (point.x - entry.x) / entry.w * 100); refresh(); } }
  function update(time = Date.now()) {
    if (disposed) return;
    now = time;
    const state = system.state, beforeRevision = shell.state.revision;
    const resourcesVisible = root && !root.hidden && !document.hidden && !state.closed
      && (state.phase === 'locked' || state.phase === 'desktop' && shell.state.panel === 'dashboard' && [0, 2].includes(shell.state.tab));
    shell.update(now, resourcesVisible && !state.reducedMotion);
    if (shell.state.revision !== beforeRevision) dirty = true;
    if (phase !== state.phase || closed !== state.closed) {
      if (['signing-out', 'booting', 'off', 'signing-in'].includes(state.phase)) shell.send('reset', null, now);
      phase = state.phase; closed = state.closed; shell.send('dismiss'); clearPassword(); gesture = null; hover = null; focused = null;
      revealed = state.phase === 'locked'; revealProgress = revealed ? 1 : 0;
      if (state.phase === 'booting') { bootExpanded = true; snapshotsExpanded = false; bootCursor = 'boot-normal'; }
      refresh(); focusControl(state.phase === 'locked' ? 'password' : state.phase === 'login' ? 'unlock' : 'launcher');
      announce({ locked: 'Session locked.', login: 'SDDM sign in.', desktop: 'Hyprland workspace ready.', off: 'Computer powered off. Use the power key to start.', booting: 'Starting CachyOS.' }[phase] || phase.replaceAll('-', ' '));
    }
    if (lastBoot !== state.boot) { lastBoot = state.boot; refresh(); if (state.boot?.stage === 'limine') focusControl(bootCursor); }
    if (lastError !== state.error || lastVerifying !== state.verifying) { if (lastError !== state.error) errorAt = now; lastError = state.error; lastVerifying = state.verifying; refresh(); if (state.error) announce(state.error); }
    if (lastPanel !== shell.state.panel) { lastPanel = shell.state.panel; panelAt = now; dirty = true; }
    if (Math.floor(now / 60000) !== lastMinute) { lastMinute = Math.floor(now / 60000); if (phase !== 'booting') dirty = true; }
    if (revealed && revealProgress < 1) { revealProgress = state.reducedMotion ? 1 : Math.min(1, (now - revealAt) / 400); dirty = true; }
    const authAnimating = ['login', 'locked'].includes(phase) && (state.verifying || state.error && now - errorAt < 400 || now - inputAt < 500);
    const animating = !state.reducedMotion && (shell.state.panel && now - panelAt < THEME.duration || authAnimating || !['desktop', 'login', 'locked', 'off', 'booting'].includes(phase));
    const mediaAnimating = shell.state.playing && shell.state.panel === 'dashboard' && shell.state.tab === 1;
    if ((animating || mediaAnimating) && Math.floor(now / (mediaAnimating ? 1000 : 33)) !== lastAnimation) { lastAnimation = Math.floor(now / (mediaAnimating ? 1000 : 33)); dirty = true; }
    if (!dirty) return;
    arrange(); syncControls();
    paint({ layout, state, shell: shell.state, today: new Date(now), now, focused, hover, revealed, revealProgress, panelAt, inputAt, errorAt,
      passwordLength: controls.get('password')?.value?.length || 0, bootArtwork: bootArtwork(state) });
    texture.needsUpdate = true; dirty = false;
  }
  function bindControls(element, report, signal) {
    root = element; announce = report; signal?.addEventListener('abort', () => { for (const lifetime of controlEvents.values()) lifetime.abort(); }, { once: true }); refresh();
  }
  function dispose() {
    disposed = true; events.abort(); clearPassword(); for (const lifetime of controlEvents.values()) lifetime.abort(); controlEvents.clear(); controls.clear(); assets.clear(); bootLogo.length = 0; bootThrobber.length = 0; gesture = null; root = null;
  }
  update(now);
  return { texture, update, hitTest, handleInput, handleKey, closePanel, bindControls, dispose };
}
