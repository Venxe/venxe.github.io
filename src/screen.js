import * as THREE from 'three';
import { DESKTOP_SIZE } from './config.js';
import { createSystem } from './system.js';

const NETWORKS = ['Venxe Studio', 'Coffee Corner'];
const ICON_NAMES = ['audio-volume-high', 'audio-volume-medium', 'audio-volume-low', 'audio-volume-muted',
  'battery-level-80', 'network-wireless-signal-excellent', 'network-wireless-disabled', 'pan-start', 'pan-end',
  'system-shutdown', 'system-reboot', 'system-log-out', 'avatar-default'];
const inside = (point, box) => point && box && point.x >= box.x && point.x < box.x + box.w && point.y >= box.y && point.y < box.y + box.h;
const dateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const fullDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function drawWallpaper(context, width, height) {
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#111a32');
  background.addColorStop(0.55, '#334a72');
  background.addColorStop(1, '#3e587d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  // Normalize the original wallpaper artwork independently of desktop controls.
  const y = (value) => height * value / 790;
  for (let i = 0; i < 3; i++) {
    const ribbon = context.createLinearGradient(0, y(210 + i * 105), width * 5 / 6, height);
    ribbon.addColorStop(0, ['#7394b3', '#496b96', '#1f355c'][i]);
    ribbon.addColorStop(1, ['#7499c1', '#435f8d', '#263752'][i]);
    context.fillStyle = ribbon;
    context.beginPath();
    context.moveTo(0, y(480 + i * 70));
    context.bezierCurveTo(width * 0.225, y(130 + i * 110),
      width * 61 / 120, y(610 + i * 30), width, y(210 + i * 155));
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.fill();
  }
}

// One desktop state serves the texture, UV picking and native keyboard controls.
export function createScreen(system = createSystem()) {
  const canvas = document.createElement('canvas');
  canvas.width = DESKTOP_SIZE.width;
  canvas.height = DESKTOP_SIZE.height;
  const context = canvas.getContext('2d');
  const wallpaper = document.createElement('canvas');
  wallpaper.width = canvas.width;
  wallpaper.height = canvas.height;
  drawWallpaper(wallpaper.getContext('2d'), wallpaper.width, wallpaper.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const imageEvents = new AbortController();
  const icons = new Map();
  let dirty = true;
  let disposed = false;
  let now = Date.now();
  let minute = null;
  let today = new Date(now);
  let selected = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
  let clock = '';
  let panel = null;
  let expanded = false;
  let volume = 50;
  let lastVolume = 50;
  let wifi = true;
  let network = 0;
  let pendingNetwork = null;
  let connectedAt = 0;
  let powerSaver = false;
  const barHeight = 36;
  let panelBox = null;
  let items = [];
  let gesture = null;
  let hover = null;
  let focused = null;
  let root = null;
  let announce = () => {};
  const controls = new Map();
  let lastPhase = system.state.phase;
  let lastError = '';
  let lastVerifying = false;
  let lastClosed = system.state.closed;
  let animationFrame = -1;
  let loginRevealed = false;
  let revealStarted = 0;
  let revealProgress = 0;

  function loginMotion() {
    const eased = 1 - (1 - revealProgress) ** 3;
    return { eased, offset: 22 * (1 - eased), opacity: Math.max(0, (eased - 0.15) / 0.85) };
  }

  for (const name of ICON_NAMES) {
    const image = new Image();
    for (const type of ['load', 'error']) image.addEventListener(type, () => { dirty = true; }, { signal: imageEvents.signal });
    image.src = new URL(`../assets/icons/${name}.svg`, import.meta.url).href;
    icons.set(name, image);
  }
  function item(id, label, x, y, w, h = 44, extra = {}) {
    items.push({ id, label, x, y, w, h, type: 'button', inPanel: true, ...extra });
  }
  function layout() {
    items = [];
    panelBox = null;
    const state = system.state;
    if (!['desktop', 'login'].includes(state.phase)) return;
    if (state.phase === 'login') {
      if (loginRevealed) {
        const { offset } = loginMotion();
        item('password', 'Password', 420, 416 + offset, 302, 52, { inPanel: false, type: 'password', disabled: state.verifying });
        item('login', state.verifying ? 'Signing in…' : 'Sign In', 730, 416 + offset, 50, 52,
          { inPanel: false, selected: true, icon: 'pan-end', iconOnly: true, disabled: state.verifying });
        item('power-menu', 'Power options', canvas.width - 52, 0, 44, barHeight,
          { inPanel: false, icon: 'system-shutdown', iconOnly: true });
      } else item('unlock', 'Sign in', 0, 0, canvas.width, canvas.height, { inPanel: false });
    } else {
      // The bar, panels and hit regions share fixed desktop coordinates.
      item('clock', clock, (canvas.width - 140) / 2, 0, 140, barHeight, { inPanel: false });
      item('settings', 'Quick settings', canvas.width - 84, 0, 76, barHeight, { inPanel: false });
    }
    if (!panel) return;
    if (panel === 'power') {
      const actions = state.phase === 'desktop' ? ['logout', 'restart', 'shutdown'] : ['restart', 'shutdown'];
      panelBox = { x: canvas.width - 258, y: barHeight + 8, w: 250, h: 24 + actions.length * 44 };
      actions.forEach((id, index) => item(id, { logout: 'Log Out', restart: 'Restart', shutdown: 'Power Off' }[id],
        panelBox.x + 12, panelBox.y + 12 + index * 44, 226, 44,
        { align: 'left', icon: { logout: 'system-log-out', restart: 'system-reboot', shutdown: 'system-shutdown' }[id] }));
      return;
    }
    const w = 360;
    panelBox = { x: panel === 'calendar' ? (canvas.width - w) / 2 : canvas.width - w - 8, y: barHeight + 8, w,
      h: panel === 'calendar' ? 384 : expanded && wifi ? 324 : 236 };
    const x = panelBox.x + 12;
    const y = panelBox.y;
    const inner = w - 24;
    if (panel === 'calendar') {
      item('date-heading', fullDate(selected), x, y + 12, inner, 24, { type: 'text' });
      item('previous', 'Previous month', x, y + 40, 44, 44, { icon: 'pan-start', iconOnly: true });
      item('month', month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), x + 44, y + 40, inner - 88, 44, { type: 'text' });
      item('next', 'Next month', x + inner - 44, y + 40, 44, 44, { icon: 'pan-end', iconOnly: true });
      const cellWidth = inner / 7;
      for (let day = 0; day < 7; day++) item(`weekday-${day}`, ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][day], x + day * cellWidth, y + 84, cellWidth, 24, { type: 'text', muted: true });
      const offset = (month.getDay() + 6) % 7;
      for (let index = 0; index < 42; index++) {
        const date = new Date(month.getFullYear(), month.getMonth(), index - offset + 1);
        item(`day-${index}`, String(date.getDate()), x + index % 7 * cellWidth, y + 108 + Math.floor(index / 7) * 36, cellWidth, 36,
          { date, selected: dateKey(date) === dateKey(selected), today: dateKey(date) === dateKey(today), muted: date.getMonth() !== month.getMonth() });
      }
      item('today', 'Today', x, y + 328, inner);
    } else {
      item('battery', '82% · Discharging', x, y + 12, inner - 48, 28, { type: 'text', icon: 'battery-level-80', align: 'left' });
      item('power-menu', 'Power options', x + inner - 44, y + 4, 44, 44, { icon: 'system-shutdown', iconOnly: true });
      item('volume-label', `Volume · ${volume}%`, x, y + 44, inner, 24, { type: 'text', align: 'left', muted: true });
      item('mute', volume ? 'Mute sound' : 'Unmute sound', x, y + 68, 44, 44, { icon: volumeIcon(), iconOnly: true });
      item('volume', 'Volume', x + 52, y + 68, inner - 52, 44, { type: 'range' });
      item('wifi', wifi ? pendingNetwork === null ? NETWORKS[network] : 'Connecting…' : 'Wi-Fi Off', x, y + 124, inner - 48, 44,
        { icon: wifiIcon(), align: 'left', selected: wifi });
      item('networks', 'Choose a Wi-Fi network', x + inner - 44, y + 124, 44, 44, { icon: 'pan-end', iconOnly: true, disabled: !wifi });
      if (expanded && wifi) NETWORKS.forEach((name, index) => item(`network-${index}`, `${name}${pendingNetwork === index ? ' · Connecting…' : pendingNetwork === null && network === index ? ' · Connected' : ''}`,
        x, y + 172 + index * 44, inner, 44, { selected: pendingNetwork === null && network === index, align: 'left' }));
      item('power', powerSaver ? 'Power Saver' : 'Balanced', x, y + (expanded && wifi ? 272 : 184), inner, 44, { selected: powerSaver });
    }
  }
  function volumeIcon() { return `audio-volume-${volume === 0 ? 'muted' : volume <= 33 ? 'low' : volume <= 66 ? 'medium' : 'high'}`; }
  function wifiIcon() { return wifi ? 'network-wireless-signal-excellent' : 'network-wireless-disabled'; }
  function iconFailed(name) { const image = icons.get(name); return image.complete && image.naturalWidth === 0; }
  function rounded(box, color, radius = 10) {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(box.x, box.y, box.w, box.h, radius);
    context.fill();
  }
  function icon(name, x, y, opacity = 1) {
    const image = icons.get(name);
    if (!image?.complete || !image.naturalWidth) return;
    context.save();
    context.globalAlpha *= opacity;
    context.drawImage(image, x, y, 16, 16);
    context.restore();
  }
  function drawItem(entry) {
    // The clock screen is an unlabeled activation surface with a native accessible button.
    if (entry.id === 'unlock') return;
    const box = entry;
    const activeTrigger = panel === 'calendar' ? 'clock' : panel === 'system' ? 'settings' : null;
    if (entry.type === 'button' && (entry.inPanel || entry.selected || entry.id === activeTrigger || hover === entry.id)) rounded(box, entry.selected ? '#3b5f89' : hover === entry.id ? '#ffffff20' : '#ffffff0b', entry.id === 'login' ? 14 : 10);
    if (entry.today || (focused === entry.id && entry.type !== 'password')) {
      context.strokeStyle = '#b8c9ef';
      context.lineWidth = focused === entry.id ? 2 : 1;
      context.beginPath();
      context.roundRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6, 8);
      context.stroke();
    }
    if (entry.type === 'password') {
      rounded(box, '#ffffff12', 14);
      context.font = '16px "Segoe UI", Arial, sans-serif';
      context.fillStyle = '#c5cee0';
      context.textAlign = 'left';
      const length = controls.get('password')?.value?.length || 0;
      context.fillText(length ? '•'.repeat(Math.min(length, 24)) : 'Password', box.x + 14, box.y + box.h / 2, box.w - 28);
      context.strokeStyle = system.state.error ? '#efb2b8' : focused === entry.id ? '#b8c9ef' : '#ffffff30';
      context.lineWidth = focused === entry.id ? 2 : 1;
      context.beginPath();
      context.roundRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2, 14);
      context.stroke();
    } else if (entry.id === 'settings') {
      const names = [wifiIcon(), volumeIcon(), 'battery-level-80'];
      if (names.some(iconFailed)) {
        context.font = '600 14px "Segoe UI", Arial, sans-serif';
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.fillText('Settings', box.x + box.w / 2, box.y + box.h / 2);
      } else names.forEach((name, index) => icon(name, box.x + 8 + index * 22, box.y + (box.h - 16) / 2, pendingNetwork !== null && index === 0 ? 0.5 : 1));
    } else if (entry.type === 'range') {
      rounded({ x: box.x + 8, y: box.y + 19, w: box.w - 16, h: 6 }, '#ffffff30', 3);
      const length = (box.w - 16) * volume / 100;
      if (length) rounded({ x: box.x + 8, y: box.y + 19, w: length, h: 6 }, '#b8c9ef', 3);
      context.fillStyle = '#e8edf7';
      context.beginPath();
      context.arc(box.x + 8 + length, box.y + 22, 7, 0, Math.PI * 2);
      context.fill();
    } else {
      if (entry.icon) icon(entry.icon, box.x + (entry.iconOnly ? (box.w - 16) / 2 : 12), box.y + (box.h - 16) / 2, entry.disabled ? 0.35 : 1);
      if (entry.iconOnly && iconFailed(entry.icon)) {
        context.font = '12px "Segoe UI", Arial, sans-serif';
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.fillText({ previous: 'Prev', next: 'Next', mute: 'Sound', networks: 'More', 'power-menu': 'Power', login: 'Sign In' }[entry.id], box.x + box.w / 2, box.y + box.h / 2, box.w - 8);
      }
      if (!entry.iconOnly) {
        context.fillStyle = entry.muted ? '#a5afc0' : '#e8edf7';
        context.font = `${entry.selected || entry.id === 'clock' || entry.id === 'month' ? 600 : 400} ${entry.type === 'text' && entry.muted ? 12 : 14}px "Segoe UI", Arial, sans-serif`;
        context.textAlign = entry.align === 'left' ? 'left' : 'center';
        context.fillText(entry.label, entry.align === 'left' ? box.x + (entry.icon ? 40 : 12) : box.x + box.w / 2, box.y + box.h / 2, box.w - (entry.icon ? 52 : 12));
      }
    }
  }
  function draw() {
    layout();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(wallpaper, 0, 0);
    context.textBaseline = 'middle';
    const state = system.state;
    if (state.phase !== 'desktop') {
      context.fillStyle = state.phase === 'off' ? '#000000' : '#0d1329c9';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (state.phase === 'login') {
        const { eased, offset, opacity } = loginMotion();
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.font = `300 ${110 - 54 * eased}px "Segoe UI", Arial, sans-serif`;
        context.fillText(today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), 600, 300 - 175 * eased);
        context.font = `${20 - 5 * eased}px "Segoe UI", Arial, sans-serif`;
        context.fillStyle = '#b8c9df';
        context.fillText(fullDate(today), 600, 382 - 202 * eased);
        if (loginRevealed) {
          context.save();
          context.globalAlpha = opacity;
          const avatar = context.createLinearGradient(552, 237 + offset, 648, 333 + offset);
          avatar.addColorStop(0, '#7795ba');
          avatar.addColorStop(1, '#3c5278');
          rounded({ x: 552, y: 237 + offset, w: 96, h: 96 }, avatar, 48);
          const image = icons.get('avatar-default');
          if (image.complete && image.naturalWidth) context.drawImage(image, 574, 259 + offset, 52, 52);
          else {
            context.fillStyle = '#e8edf7';
            context.font = '500 36px "Segoe UI", Arial, sans-serif';
            context.fillText('V', 600, 285 + offset);
          }
          context.fillStyle = '#e8edf7';
          context.font = '600 25px "Segoe UI", Arial, sans-serif';
          context.fillText('venxe', 600, 362 + offset);
          context.font = '13px "Segoe UI", Arial, sans-serif';
          context.fillStyle = '#efb2b8';
          context.fillText(state.error, 600, 492 + offset, 360);
          if (state.verifying) {
            context.fillStyle = '#a5afc0';
            context.font = '12px "Segoe UI", Arial, sans-serif';
            context.fillText('Signing in…', 600, 529 + offset);
          }
          context.restore();
        }
      } else if (state.phase !== 'off') {
        context.textAlign = 'center';
        context.fillStyle = '#e8edf7';
        context.font = '600 38px "Segoe UI", Arial, sans-serif';
        context.fillText('venxe', 600, 291);
        context.font = '15px "Segoe UI", Arial, sans-serif';
        context.fillStyle = '#b8c9df';
        context.fillText({ booting: 'Starting up…', 'shutting-down': state.restarting ? 'Restarting…' : 'Shutting down…',
          'signing-out': 'Signing out…', 'signing-in': 'Welcome back' }[state.phase], 600, 344);
        if (!state.reducedMotion) {
          context.strokeStyle = '#b8c9ef';
          context.lineWidth = 2;
          context.beginPath();
          const angle = now / 220;
          context.arc(600, 394, 10, angle, angle + Math.PI * 1.4);
          context.stroke();
        }
      }
    } else {
      context.fillStyle = '#101624f0';
      context.fillRect(0, 0, canvas.width, barHeight);
      context.fillStyle = '#ffffff16';
      context.fillRect(0, barHeight - 1, canvas.width, 1);
      context.fillStyle = '#e8edf7';
      context.font = '600 14px "Segoe UI", Arial, sans-serif';
      context.textAlign = 'left';
      context.fillText('venxe', 16, barHeight / 2);
    }
    items.filter((entry) => !entry.inPanel).forEach((entry) => {
      context.save();
      if (entry.id === 'password' || entry.id === 'login') context.globalAlpha = loginMotion().opacity;
      drawItem(entry);
      context.restore();
    });
    if (panelBox) {
      context.save();
      context.shadowColor = '#00000070';
      context.shadowBlur = 18;
      context.shadowOffsetY = 6;
      rounded(panelBox, '#20242df7', 16);
      context.restore();
      context.save();
      context.beginPath();
      context.roundRect(panelBox.x, panelBox.y, panelBox.w, panelBox.h, 16);
      context.clip();
      items.filter((entry) => entry.inPanel).forEach(drawItem);
      context.restore();
    }
    syncControls();
    texture.needsUpdate = true;
    dirty = false;
  }
  function pointAt(uv) { return uv ? { x: uv.x * canvas.width, y: (1 - uv.y) * canvas.height } : null; }
  function hitTest(uv) {
    const point = pointAt(uv);
    for (const entry of items) {
      if (entry.type === 'text' || entry.disabled) continue;
      if (entry.inPanel && !inside(point, panelBox)) continue;
      if (inside(point, entry)) return entry.id;
    }
    return inside(point, panelBox) ? 'panel' : panel ? 'dismiss' : null;
  }
  function closePanel(restoreFocus = true) {
    if (!panel) return false;
    const trigger = system.state.phase === 'login' ? 'power-menu' : panel === 'calendar' ? 'clock' : 'settings';
    panel = null;
    expanded = false;
    gesture = null;
    focused = null;
    dirty = true;
    layout();
    if (root) {
      if (restoreFocus && root.contains(document.activeElement)) controls.get(trigger).focus({ preventScroll: true });
      syncControls();
    }
    announce('Panel closed.');
    return true;
  }
  function setVolume(value) {
    const next = Math.round(THREE.MathUtils.clamp(Number(value), 0, 100));
    if (!Number.isFinite(next) || next === volume) return;
    volume = next;
    if (volume) lastVolume = volume;
    dirty = true;
  }
  function selectDate(date) {
    selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    month = new Date(selected.getFullYear(), selected.getMonth(), 1);
    dirty = true;
    announce(fullDate(selected));
  }
  function activate(id) {
    if (disposed || (!items.some((entry) => entry.id === id && !entry.disabled) && id !== 'dismiss')) return;
    if (id === 'unlock') { revealLogin(); return; }
    if (id === 'password') { controls.get('password')?.focus({ preventScroll: true }); return; }
    if (id === 'login') { submitLogin(); return; }
    if (['shutdown', 'restart', 'logout'].includes(id)) {
      closePanel(false);
      system.send(id);
      update();
      return;
    }
    if (id === 'power-menu') {
      if (panel === 'power') { closePanel(); return; }
      closePanel(false);
      panel = 'power';
      announce('Power options open.');
      dirty = true;
      refreshControls();
      controls.get(system.state.phase === 'desktop' ? 'logout' : 'restart')?.focus({ preventScroll: true });
      return;
    }
    if (id === 'clock' || id === 'settings') {
      const next = id === 'clock' ? 'calendar' : 'system';
      if (panel === next) { closePanel(); return; }
      closePanel(false);
      panel = next;
      if (next === 'calendar') selectDate(today);
      announce(next === 'calendar' ? 'Calendar open.' : 'Quick settings open.');
    } else if (id === 'dismiss') { closePanel(); return; }
    else if (id === 'previous' || id === 'next') selectDate(new Date(month.getFullYear(), month.getMonth() + (id === 'next' ? 1 : -1), 1));
    else if (id === 'today') selectDate(today);
    else if (id.startsWith('day-')) selectDate(items.find((entry) => entry.id === id).date);
    else if (id === 'mute') { setVolume(volume ? 0 : lastVolume); announce(volume ? `Volume ${volume}%.` : 'Sound muted.'); }
    else if (id === 'wifi') {
      wifi = !wifi;
      if (!wifi && pendingNetwork !== null) network = pendingNetwork;
      pendingNetwork = wifi ? network : null;
      connectedAt = now + 700;
      if (!wifi) expanded = false;
      announce(wifi ? `Connecting to ${NETWORKS[network]}.` : 'Wi-Fi off.');
    } else if (id === 'networks' && wifi) expanded = !expanded;
    else if (id.startsWith('network-') && wifi) {
      const index = Number(id.slice(8));
      if (NETWORKS[index] && (pendingNetwork !== null || network !== index)) {
        pendingNetwork = index;
        connectedAt = now + 700;
        announce(`Connecting to ${NETWORKS[index]}.`);
      }
    } else if (id === 'power') { powerSaver = !powerSaver; announce(powerSaver ? 'Power Saver enabled.' : 'Balanced power mode.'); }
    dirty = true;
    refreshControls();
  }
  function revealLogin() {
    if (disposed || system.state.phase !== 'login' || system.state.closed || loginRevealed) return false;
    loginRevealed = true;
    revealStarted = now;
    revealProgress = system.state.reducedMotion ? 1 : 0;
    dirty = true;
    refreshControls();
    if (root && !root.hidden && !document.hidden) controls.get('password')?.focus({ preventScroll: true });
    announce('Enter your password to sign in.');
    return true;
  }
  function handleKey(event) {
    if (disposed || document.hidden || root?.hidden || panel || system.state.phase !== 'login' || system.state.closed || loginRevealed) return false;
    if (event.target?.dataset?.control === 'power-menu') return false;
    if (!event.repeat) revealLogin();
    return true;
  }
  function handleInput(event, uv) {
    if (disposed) return false;
    const point = pointAt(uv);
    const target = hitTest(uv);
    if (event.type === 'wheel') return !!inside(point, panelBox);
    if (event.type === 'pointerdown') {
      if (!target) return false;
      gesture = { id: target, startY: point?.y, startX: point?.x, moved: false };
      if (target === 'volume') slide(point);
      return true;
    }
    if (event.type === 'pointermove') {
      if (!gesture) {
        const next = target === 'dismiss' || target === 'panel' ? null : target;
        if (next !== hover) { hover = next; dirty = true; }
        return false;
      }
      if (point && Math.hypot(point.x - gesture.startX, point.y - gesture.startY) > 6) gesture.moved = true;
      if (gesture.id === 'volume' && point) slide(point);
      return true;
    }
    if (event.type === 'pointerup') {
      if (!gesture) return false;
      const previous = gesture;
      gesture = null;
      if (previous.id === 'volume') announce(`Volume ${volume}%.`);
      else if (!previous.moved && target === previous.id) activate(target);
      return true;
    }
    if (['pointercancel', 'lostpointercapture', 'pointerleave'].includes(event.type)) {
      gesture = null;
      if (hover) { hover = null; dirty = true; }
    }
    return false;
  }
  function slide(point) {
    const range = items.find((entry) => entry.id === 'volume');
    setVolume((point.x - range.x - 8) / (range.w - 16) * 100);
    refreshControls();
  }
  function refreshControls() { layout(); syncControls(); }
  function syncControls() {
    if (!root) return;
    root.querySelector('[data-panel="calendar"]').hidden = panel !== 'calendar';
    root.querySelector('[data-panel="system"]').hidden = panel !== 'system';
    root.querySelector('[data-panel="power"]').hidden = panel !== 'power';
    root.querySelector('[data-login]').hidden = system.state.phase !== 'login' || !loginRevealed;
    for (const [id, element] of controls) {
      const entry = items.find((entry) => entry.id === id);
      element.hidden = !entry;
      if (!entry) continue;
      if (id === 'volume') {
        element.value = String(volume);
        element.setAttribute('aria-valuetext', volume ? `${volume}%` : 'Muted');
      } else if (entry.type !== 'password' && element.textContent !== entry.label) element.textContent = entry.label;
      if (id === 'password') {
        element.setAttribute('aria-invalid', String(!!system.state.error));
        root.querySelector('[data-login-error]').textContent = system.state.error;
      }
      if (id === 'power-menu') element.setAttribute('aria-expanded', String(panel === 'power'));
      if (entry.date) {
        element.setAttribute('aria-label', fullDate(entry.date));
        element.setAttribute('aria-pressed', String(entry.selected));
        element.setAttribute('aria-current', entry.today ? 'date' : 'false');
        element.tabIndex = entry.selected ? 0 : -1;
      }
      if (['clock', 'settings', 'networks'].includes(id)) element.setAttribute('aria-expanded', String(id === 'clock' ? panel === 'calendar' : id === 'settings' ? panel === 'system' : expanded));
      if (id === 'clock') element.setAttribute('aria-label', `Date and time, ${clock}`);
      if (['mute', 'wifi', 'power'].includes(id)) element.setAttribute('aria-pressed', String(id === 'mute' ? volume === 0 : id === 'wifi' ? wifi : powerSaver));
      element.disabled = !!entry.disabled;
    }
  }
  function bindControls(element, report, signal) {
    root = element;
    announce = report;
    const days = root.querySelector('[data-days]');
    for (let row = 0; row < 6; row++) {
      const tr = document.createElement('tr');
      for (let column = 0; column < 7; column++) {
        const td = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.control = `day-${row * 7 + column}`;
        td.append(button);
        tr.append(td);
      }
      days.append(tr);
    }
    for (const element of root.querySelectorAll('[data-control]')) {
      const id = element.dataset.control;
      controls.set(id, element);
      if (element.tagName !== 'BUTTON' && !['range', 'password'].includes(element.type)) continue;
      const options = { signal };
      if (element.type === 'password') {
        element.addEventListener('input', () => { dirty = true; }, options);
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); submitLogin(); }
        }, options);
        element.addEventListener('focus', () => { focused = id; dirty = true; }, options);
        element.addEventListener('blur', () => { if (focused === id) { focused = null; dirty = true; } }, options);
        continue;
      }
      element.addEventListener(element.type === 'range' ? 'input' : 'click', () => {
        if (disposed || !root || root.hidden || document.hidden) return;
        if (id === 'volume') { setVolume(element.value); refreshControls(); }
        else {
          activate(id);
          if ((id === 'clock' || id === 'settings') && panel) controls.get(panel === 'calendar' ? 'previous' : 'volume').focus({ preventScroll: true });
        }
      }, options);
      element.addEventListener('focus', () => { focused = id; dirty = true; }, options);
      element.addEventListener('blur', () => { if (focused === id) { focused = null; dirty = true; } }, options);
      if (id.startsWith('day-')) element.addEventListener('keydown', (event) => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!offset || disposed || root.hidden || document.hidden) return;
        event.preventDefault();
        selectDate(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + offset));
        refreshControls();
        const next = items.find((entry) => entry.date && entry.selected);
        controls.get(next.id).focus({ preventScroll: true });
      }, options);
    }
    syncControls();
  }
  async function submitLogin() {
    const input = controls.get('password');
    if (!input || !root || root.hidden || document.hidden || !loginRevealed || system.state.phase !== 'login' || system.state.verifying) return;
    if (!input.value) { input.focus({ preventScroll: true }); return; }
    const result = system.send('login', input.value);
    input.value = '';
    dirty = true;
    refreshControls();
    await result;
    if (disposed) return;
    update();
    if (system.state.phase === 'login' && !root.hidden && !document.hidden) input.focus({ preventScroll: true });
  }
  function update(time = Date.now()) {
    if (disposed) return;
    now = time;
    const state = system.state;
    if (lastClosed !== state.closed) {
      lastClosed = state.closed;
      if (state.closed) {
        closePanel(false);
        loginRevealed = false;
        revealProgress = 0;
        const password = controls.get('password');
        if (password) password.value = '';
        dirty = true;
      }
    }
    if (lastPhase !== state.phase || lastError !== state.error || lastVerifying !== state.verifying) {
      if (lastPhase !== state.phase) {
        closePanel(false);
        gesture = null;
        hover = null;
        focused = null;
        loginRevealed = false;
        revealProgress = 0;
        const password = controls.get('password');
        if (password) password.value = '';
        lastPhase = state.phase;
        refreshControls();
        if (state.phase === 'login' && root && !root.hidden) controls.get('unlock')?.focus({ preventScroll: true });
        else if (state.phase === 'desktop' && root && !root.hidden) controls.get('settings')?.focus({ preventScroll: true });
        announce({ desktop: 'Signed in.', login: 'Screen locked.', off: 'Computer powered off. Use the power key to start up.',
          booting: 'Starting up.', 'shutting-down': state.restarting ? 'Restarting.' : 'Shutting down.',
          'signing-out': 'Signing out.', 'signing-in': 'Signing in.' }[state.phase]);
      }
      if (state.error && state.error !== lastError) announce(state.error);
      lastError = state.error;
      lastVerifying = state.verifying;
      dirty = true;
    }
    if (state.phase === 'login' && loginRevealed && revealProgress < 1) {
      revealProgress = state.reducedMotion ? 1 : Math.max(revealProgress, Math.min(1, (now - revealStarted) / 480));
      dirty = true;
    }
    if (!['desktop', 'login', 'off'].includes(state.phase) && !state.reducedMotion && Math.floor(now / 50) !== animationFrame) {
      animationFrame = Math.floor(now / 50);
      dirty = true;
    }
    if (Math.floor(now / 60000) !== minute) {
      minute = Math.floor(now / 60000);
      today = new Date(now);
      clock = `${today.getDate()} ${today.toLocaleDateString('en-GB', { month: 'short' })}. ${today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
      dirty = true;
    }
    if (wifi && pendingNetwork !== null && now >= connectedAt) {
      network = pendingNetwork;
      pendingNetwork = null;
      dirty = true;
      announce(`Connected to ${NETWORKS[network]}.`);
    }
    if (dirty) draw();
  }
  function dispose() {
    disposed = true;
    imageEvents.abort();
    gesture = null;
    if (controls.has('password')) controls.get('password').value = '';
    controls.clear();
    icons.clear();
    root = null;
  }
  update(now);
  return { texture, update, hitTest, handleInput, handleKey, closePanel, bindControls, dispose };
}
