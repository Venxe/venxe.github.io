import * as THREE from 'three';

const NETWORKS = ['Venxe Studio', 'Coffee Corner'];
const ICON_NAMES = ['audio-volume-high', 'audio-volume-medium', 'audio-volume-low', 'audio-volume-muted',
  'battery-level-80', 'network-wireless-signal-excellent', 'network-wireless-disabled', 'pan-start', 'pan-end'];
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
  for (let i = 0; i < 3; i++) {
    const ribbon = context.createLinearGradient(0, 210 + i * 105, 1000, height);
    ribbon.addColorStop(0, ['#7394b3', '#496b96', '#1f355c'][i]);
    ribbon.addColorStop(1, ['#7499c1', '#435f8d', '#263752'][i]);
    context.fillStyle = ribbon;
    context.beginPath();
    context.moveTo(0, 480 + i * 70);
    context.bezierCurveTo(270, 130 + i * 110, 610, 610 + i * 30, 1200, 210 + i * 155);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.fill();
  }
}

// One desktop state serves the texture, UV picking and native keyboard controls.
export function createScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 790;
  const context = canvas.getContext('2d');
  const wallpaper = document.createElement('canvas');
  wallpaper.width = canvas.width;
  wallpaper.height = canvas.height;
  drawWallpaper(wallpaper.getContext('2d'), wallpaper.width, wallpaper.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const imageEvents = new AbortController();
  const icons = new Map();
  const failedIcons = new Set();
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
  let panelScale = 1;
  let width = canvas.width;
  let height = canvas.height;
  const barHeight = 36;
  let scroll = 0;
  let maxScroll = 0;
  let panelBox = null;
  let items = [];
  let gesture = null;
  let hover = null;
  let focused = null;
  let root = null;
  let announce = () => {};
  const controls = new Map();

  for (const name of ICON_NAMES) {
    const image = new Image();
    image.addEventListener('load', () => { failedIcons.delete(name); dirty = true; }, { signal: imageEvents.signal });
    image.addEventListener('error', () => { failedIcons.add(name); dirty = true; }, { signal: imageEvents.signal });
    image.src = new URL(`../assets/icons/${name}.svg`, import.meta.url).href;
    icons.set(name, image);
  }
  function item(id, label, x, y, w, h = 44, extra = {}) {
    items.push({ id, label, x, y, w, h, type: 'button', inPanel: true, ...extra });
  }
  function layout() {
    items = [];
    // The bar stays in desktop pixels; only popovers adapt to the projected display.
    item('clock', clock, (canvas.width - 140) / 2, 0, 140, barHeight, { inPanel: false });
    item('settings', 'Quick settings', canvas.width - 84, 0, 76, barHeight, { inPanel: false });
    panelBox = null;
    maxScroll = 0;
    if (!panel) return;
    const w = Math.min(360, width - 16);
    const contentHeight = panel === 'calendar' ? 384 : expanded && wifi ? 324 : 236;
    const barBottom = barHeight / panelScale;
    panelBox = { x: panel === 'calendar' ? (width - w) / 2 : width - w - 8, y: barBottom + 8, w, h: Math.max(1, Math.min(contentHeight, height - barBottom - 16)) };
    maxScroll = Math.max(0, contentHeight - panelBox.h);
    scroll = Math.min(scroll, maxScroll);
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
      item('battery', '82% · Discharging', x, y + 12, inner, 28, { type: 'text', icon: 'battery-level-80', align: 'left' });
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
    context.globalAlpha = opacity;
    context.drawImage(image, x, y, 16, 16);
    context.restore();
  }
  function drawItem(entry) {
    const box = { ...entry, y: entry.y - (entry.inPanel ? scroll : 0) };
    const activeTrigger = panel === 'calendar' ? 'clock' : panel === 'system' ? 'settings' : null;
    if (entry.type === 'button' && (entry.inPanel || entry.id === activeTrigger || hover === entry.id)) rounded(box, entry.selected ? '#3b5f89' : hover === entry.id ? '#ffffff20' : '#ffffff0b');
    if (entry.today || focused === entry.id) {
      context.strokeStyle = '#b8c9ef';
      context.lineWidth = focused === entry.id ? 2 : 1;
      context.beginPath();
      context.roundRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6, 8);
      context.stroke();
    }
    if (entry.id === 'settings') {
      const names = [wifiIcon(), volumeIcon(), 'battery-level-80'];
      if (names.some((name) => failedIcons.has(name))) {
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
      if (entry.iconOnly && failedIcons.has(entry.icon)) {
        context.font = '12px "Segoe UI", Arial, sans-serif';
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.fillText({ previous: 'Prev', next: 'Next', mute: 'Sound', networks: 'More' }[entry.id], box.x + box.w / 2, box.y + box.h / 2, box.w - 8);
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
    context.fillStyle = '#101624f0';
    context.fillRect(0, 0, canvas.width, barHeight);
    context.fillStyle = '#ffffff16';
    context.fillRect(0, barHeight - 1, canvas.width, 1);
    context.fillStyle = '#e8edf7';
    context.font = '600 14px "Segoe UI", Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText('venxe', 16, barHeight / 2);
    items.filter((entry) => !entry.inPanel).forEach(drawItem);
    if (panelBox) {
      context.setTransform(panelScale, 0, 0, panelScale, 0, 0);
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
      if (maxScroll) {
        const thumb = Math.max(20, panelBox.h * panelBox.h / (panelBox.h + maxScroll));
        rounded({ x: panelBox.x + panelBox.w - 5, y: panelBox.y + scroll / maxScroll * (panelBox.h - thumb), w: 3, h: thumb }, '#ffffff50', 1);
      }
      context.restore();
    }
    syncControls();
    texture.needsUpdate = true;
    dirty = false;
  }
  function pointAt(uv) { return uv ? { x: uv.x * canvas.width / panelScale, y: (1 - uv.y) * canvas.height / panelScale } : null; }
  function hitTest(uv) {
    const point = pointAt(uv);
    const barPoint = uv ? { x: uv.x * canvas.width, y: (1 - uv.y) * canvas.height } : null;
    for (const entry of items) {
      if (entry.type === 'text' || entry.disabled) continue;
      if (entry.inPanel && !inside(point, panelBox)) continue;
      if (inside(entry.inPanel ? point : barPoint, { ...entry, y: entry.y - (entry.inPanel ? scroll : 0) })) return entry.id;
    }
    return inside(point, panelBox) ? 'panel' : panel ? 'dismiss' : null;
  }
  function ensureVisible(id) {
    const entry = items.find((entry) => entry.id === id);
    if (!entry?.inPanel || !panelBox) return;
    const relativeY = entry.y - panelBox.y;
    const next = Math.max(0, Math.min(maxScroll, relativeY < scroll ? relativeY : relativeY + entry.h > scroll + panelBox.h ? relativeY + entry.h - panelBox.h : scroll));
    if (next !== scroll) { scroll = next; dirty = true; }
  }
  function closePanel(restoreFocus = true) {
    if (!panel) return false;
    const trigger = panel === 'calendar' ? 'clock' : 'settings';
    panel = null;
    expanded = false;
    scroll = 0;
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
    if (disposed) return;
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
    layout();
    syncControls();
  }
  function handleInput(event, uv) {
    if (disposed) return false;
    const point = pointAt(uv);
    const target = hitTest(uv);
    if (event.type === 'wheel') {
      if (!inside(point, panelBox)) return false;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panelBox.h : 1);
      scroll = THREE.MathUtils.clamp(scroll + delta, 0, maxScroll);
      dirty = true;
      return true;
    }
    if (event.type === 'pointerdown') {
      if (!target) return false;
      gesture = { id: target, startY: point?.y, startX: point?.x, scroll, moved: false };
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
      else if (gesture.moved && point && panelBox && !['clock', 'settings', 'dismiss'].includes(gesture.id)) {
        scroll = THREE.MathUtils.clamp(gesture.scroll + gesture.startY - point.y, 0, maxScroll);
        dirty = true;
      }
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
    layout();
    syncControls();
  }
  function syncControls() {
    if (!root) return;
    root.querySelector('[data-panel="calendar"]').hidden = panel !== 'calendar';
    root.querySelector('[data-panel="system"]').hidden = panel !== 'system';
    for (const [id, element] of controls) {
      const entry = items.find((entry) => entry.id === id);
      element.hidden = !entry;
      if (!entry) continue;
      if (id === 'volume') {
        element.value = String(volume);
        element.setAttribute('aria-valuetext', volume ? `${volume}%` : 'Muted');
      } else if (element.textContent !== entry.label) element.textContent = entry.label;
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
      if (element.tagName !== 'BUTTON' && element.type !== 'range') continue;
      const options = { signal };
      element.addEventListener(element.type === 'range' ? 'input' : 'click', () => {
        if (disposed || !root || root.hidden || document.hidden) return;
        if (id === 'volume') { setVolume(element.value); layout(); syncControls(); }
        else {
          activate(id);
          if ((id === 'clock' || id === 'settings') && panel) controls.get(panel === 'calendar' ? 'previous' : 'volume').focus({ preventScroll: true });
        }
      }, options);
      element.addEventListener('focus', () => { focused = id; ensureVisible(id); dirty = true; }, options);
      element.addEventListener('blur', () => { if (focused === id) { focused = null; dirty = true; } }, options);
      if (id.startsWith('day-')) element.addEventListener('keydown', (event) => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!offset || disposed || root.hidden || document.hidden) return;
        event.preventDefault();
        selectDate(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + offset));
        layout();
        syncControls();
        const next = items.find((entry) => entry.date && entry.selected);
        controls.get(next.id).focus({ preventScroll: true });
      }, options);
    }
    syncControls();
  }
  function update(time = Date.now(), displaySize = null) {
    if (disposed) return;
    now = time;
    const nextWidth = displaySize ? Math.max(240, Math.round(displaySize.width)) : canvas.width;
    const nextHeight = displaySize ? Math.max(72, Math.min(canvas.height * nextWidth / canvas.width, Math.round(displaySize.height))) : canvas.height;
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      panelScale = canvas.width / width;
      if (panel) dirty = true;
      layout();
      ensureVisible(focused);
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
    controls.clear();
    icons.clear();
    root = null;
  }
  update(now);
  return { texture, update, hitTest, handleInput, closePanel, bindControls, dispose };
}
