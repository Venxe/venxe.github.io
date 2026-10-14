import { THEME as T, FONTS, DEMO, WALLPAPERS, timeLabel, greeting } from './desktop-theme.js';
import { drawing } from './desktop-paint.js';
import { createLoginPainter } from './login-painter.js';
import { createBootPainter } from './boot-painter.js';

export function createScreenPainter(canvas, assets) {
  const context = canvas.getContext('2d');
  const d = drawing(context), paintBoot = createBootPainter(canvas), paintLogin = createLoginPainter(context, assets);
  const background = document.createElement('canvas'), blurred = document.createElement('canvas');
  for (const layer of [background, blurred]) { layer.width = canvas.width; layer.height = canvas.height; }
  let backgroundKey = '';
  function wallpaper(index) {
    const asset = assets.get(WALLPAPERS[index]);
    const key = `${index}:${asset?.complete}:${asset?.naturalWidth}`;
    if (key === backgroundKey) return;
    backgroundKey = key;
    const b = drawing(background.getContext('2d'));
    b.rect({ x: 0, y: 0, w: 1200, h: 675 }, '#222735', 0); b.image(asset, { x: 0, y: 0, w: 1200, h: 675 });
    const blur = blurred.getContext('2d');
    blur.filter = 'blur(20px)'; blur.drawImage(background, -24, -24, 1248, 723); blur.filter = 'none';
  }
  function panelSurface(box, progress) {
    const bulge = Math.sin(progress * Math.PI) * 8;
    const horizontal = box.edge === 'left' || box.edge === 'right';
    d.rect({ ...box, x: box.x - (box.edge === 'right' ? bulge : 0), y: box.y - (box.edge === 'bottom' ? bulge : 0), w: box.w + (horizontal ? bulge : 0), h: box.h + (horizontal ? 0 : bulge) }, T.background, 28 + bulge);
    // Concave joins connect the drawers to the shell frame.
    const r = 24; context.fillStyle = T.background; context.beginPath();
    if (box.edge === 'top' || box.edge === 'bottom') {
      const y = box.edge === 'top' ? box.y : box.y + box.h, sign = box.edge === 'top' ? 1 : -1;
      context.moveTo(box.x - r, y); context.quadraticCurveTo(box.x, y, box.x, y + sign * r);
      context.lineTo(box.x + box.w, y + sign * r); context.quadraticCurveTo(box.x + box.w, y, box.x + box.w + r, y);
    } else {
      const x = box.edge === 'left' ? box.x : box.x + box.w, sign = box.edge === 'left' ? 1 : -1;
      context.moveTo(x, box.y - r); context.quadraticCurveTo(x, box.y, x + sign * r, box.y);
      context.lineTo(x + sign * r, box.y + box.h); context.quadraticCurveTo(x, box.y + box.h, x, box.y + box.h + r);
    }
    context.closePath(); context.fill();
  }
  function dashboard({ shell, today, layout, now }) {
    if (shell.tab === 0) {
      d.rect({ x: 194, y: 85, w: 236, h: 110 }, T.surface, 32); d.avatar(assets.get('avatar.jpg'), 210, 108, 64, 64);
      d.text(greeting(today), 288, 118, 13, T.muted); d.text('venxe', 288, 143, 24, T.text, 500); d.text('CachyOS · Hyprland', 288, 170, 11, T.secondary);
      d.rect({ x: 450, y: 85, w: 320, h: 62 }, T.surface, 24); d.icon('clear_day', 484, 115, 31, T.tertiary);
      d.text(`${DEMO.temperature}°`, 512, 118, 32, T.secondary, 500); d.text(DEMO.weather, 591, 107, 13); d.text(`${DEMO.location} · sample`, 591, 128, 10, T.muted);
      d.rect({ x: 194, y: 207, w: 236, h: 181 }, T.surface, 24); d.text(timeLabel(today), 216, 251, 47, T.secondary, 500, 'left', FONTS.clock);
      d.text(today.toLocaleDateString('en-GB', { weekday: 'long' }), 216, 291, 17); d.text(today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }), 216, 316, 13, T.muted);
      d.rect(layout.calendar, T.surface, 24); d.text(new Date(shell.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), 610, 177, 14, T.text, 500, 'center');
      ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((day, i) => d.text(day, 450 + (i + 0.5) * 320 / 7, 205, 10, T.muted, 500, 'center'));
      d.rect({ x: 790, y: 85, w: 274, h: 303 }, T.surface, 40); d.shape(927, 174, 64, 8, 0.3); context.fillStyle = T.primary; context.fill(); d.icon('music_note', 927, 174, 54, T.tertiary);
      d.text(DEMO.track, 927, 256, 18, T.text, 500, 'center'); d.text(DEMO.artist, 927, 280, 12, T.muted, 400, 'center');
      d.ring(861, 343, 18, shell.resources.cpu / 100); d.text(`${Math.round(shell.resources.cpu)}% CPU`, 891, 344, 11, T.muted);
    } else if (shell.tab === 1) {
      d.rect({ x: 194, y: 85, w: 260, h: 303 }, T.surface, 36); d.shape(324, 230, 88, 8, 0.35); context.fillStyle = T.primary; context.fill(); d.icon('music_note', 324, 230, 72, T.tertiary);
      d.text(DEMO.track, 490, 144, 32, T.text, 500); d.text(DEMO.artist, 490, 181, 17, T.muted); d.text('Local visual preview · no audio playback', 490, 222, 12, T.muted);
      const position = (shell.position + (shell.playing ? (now - shell.playStarted) / 1000 : 0)) % DEMO.duration;
      d.rect({ x: 490, y: 268, w: 530, h: 5 }, T.variant, 3); d.rect({ x: 490, y: 268, w: Math.max(1, 530 * position / DEMO.duration), h: 5 }, T.secondary, 3);
      d.text(`${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')}`, 490, 289, 11, T.muted); d.text('3:24', 1020, 289, 11, T.muted, 400, 'right');
    } else if (shell.tab === 2) {
      [['CPU', `${Math.round(shell.resources.cpu)}%`, '8 logical cores', shell.resources.cpu / 100],
        ['Memory', `${shell.resources.memory.toFixed(1)} GB`, `${DEMO.totalMemory} GB total`, shell.resources.memory / DEMO.totalMemory],
        ['Storage', `${DEMO.storage} GB`, `${DEMO.totalStorage} GB NVMe`, DEMO.storage / DEMO.totalStorage],
        ['Battery', `${DEMO.battery}%`, 'Discharging · 4h 12m', DEMO.battery / 100]].forEach(([label, value, detail, fraction], i) => {
        const x = 194 + i * 220; d.rect({ x, y: 85, w: 210, h: 303 }, T.surface, 28); d.text(label, x + 20, 116, 17, T.secondary, 500);
        d.ring(x + 105, 211, 56, fraction, i % 2 ? T.tertiary : T.accent); d.text(value, x + 105, 211, 22, T.text, 500, 'center'); d.text(detail, x + 105, 309, 12, T.muted, 400, 'center');
      });
      d.text('Simulated laptop resources', 1062, 400, 10, T.muted, 400, 'right');
    } else {
      d.rect({ x: 194, y: 85, w: 870, h: 303 }, T.surface, 32); d.icon('clear_day', 304, 218, 102, T.tertiary); d.text('21°', 398, 198, 90, T.secondary);
      d.text(DEMO.weather, 403, 278, 22); d.text(`${DEMO.location} · sample forecast`, 403, 311, 13, T.muted);
      ['Now', '15:00', '18:00', '21:00'].forEach((label, i) => { const x = 712 + i * 84; d.text(label, x, 160, 12, T.muted, 400, 'center'); d.icon(i > 1 ? 'partly_cloudy_night' : 'partly_cloudy_day', x, 219, 31); d.text(`${21 - i}°`, x, 275, 18, T.text, 500, 'center'); });
    }
  }
  function drawWindow(window, { shell }) {
    const { x, y, w, h } = window;
    d.rect(window, '#101216f5', 16); context.save(); context.beginPath(); context.roundRect(x, y, w, h, 16); context.clip();
    d.rect({ x, y, w, h: 40 }, shell.focus === window.id ? T.high : T.low, 0); d.icon(window.app === 'terminal' ? 'terminal' : 'folder_open', x + 23, y + 20, 18);
    d.text(window.app === 'terminal' ? 'foot — venxe@venxe-laptop' : 'Wallpapers — Pictures', x + 45, y + 20, 12, T.secondary);
    if (window.app === 'terminal') {
      d.text('venxe@venxe-laptop ~', x + 24, y + 78, 15, T.accent, 500, 'left', FONTS.mono); d.text('❯ caelestiafetch', x + 24, y + 107, 14, T.text, 400, 'left', FONTS.mono);
      d.logo(x + Math.min(120, w / 4), y + 238, Math.min(130, w / 3));
      const left = x + Math.min(240, w * 0.43);
      [['OS', DEMO.os], ['Host', DEMO.host], ['WM', DEMO.wm], ['Shell', 'Caelestia'], ['Terminal', 'foot'], ['Memory', `${shell.resources.memory.toFixed(1)} GiB / ${DEMO.totalMemory} GiB`]].forEach(([key, value], i) => {
        d.text(key, left, y + 161 + i * 27, 12, T.accent, 500, 'left', FONTS.mono); d.text(value, left + 85, y + 161 + i * 27, 12, T.text, 400, 'left', FONTS.mono, Math.max(50, w - (left - x) - 100));
      });
      d.text('Local simulation. Commands are not executed.', x + 24, y + h - 67, 11, T.muted, 400, 'left', FONTS.mono, w - 48);
      d.text('Alt + 1…5 workspace · Alt + Shift + 1…5 move window', x + 24, y + h - 40, 10, T.muted, 400, 'left', FONTS.mono, w - 48);
    } else { d.text('Pictures / Wallpapers', x + 24, y + 69, 17, T.text, 500); d.text('Applies to the desktop, greeter and lock screen.', x + 24, y + 310, 12, T.muted, 400, 'left', FONTS.body, w - 48); }
    context.restore();
    if (shell.focus === window.id) { context.strokeStyle = T.primary; context.lineWidth = 2; context.beginPath(); context.roundRect(x, y, w, h, 16); context.stroke(); }
  }
  function item(e, { shell, focused, hover, today }) {
    if (e.invisible || e.type === 'password') return;
    const hot = focused === e.id || hover === e.id;
    const track = e.type === 'range' ? { x: e.x, y: e.y + (e.h - 30) / 2, w: e.w, h: 30 } : null;
    if (e.image) {
      d.image(assets.get(WALLPAPERS[Number(e.id.slice(10))]), e, 16); d.rect({ x: e.x, y: e.y + e.h - 36, w: e.w, h: 36 }, '#0d0e12d9', 12); d.text(e.label, e.x + 12, e.y + e.h - 18, 12, T.text, 500, 'left', FONTS.body, e.w - 24);
    } else if (e.workspace) {
      if (e.selected) d.rect({ x: e.x + 3, y: e.y + 1, w: e.w - 6, h: e.h - 2 }, T.secondary, 13);
      d.shape(e.x + e.w / 2, e.y + e.h / 2, e.selected ? 10 : 6, e.workspace + 3, e.selected ? 0.2 : 1); context.fillStyle = e.selected ? T.background : e.occupied ? T.accent : T.outline; context.fill();
    } else if (e.clock) {
      const [hours, minutes] = timeLabel(today).split(':'); d.icon('calendar_month', 30, e.y + 12, 17, T.tertiary); d.text(hours, 30, e.y + 39, 23, T.tertiary, 500, 'center', FONTS.clock); d.text(minutes, 30, e.y + 64, 23, T.tertiary, 500, 'center', FONTS.clock);
    } else if (e.type === 'range') {
      d.rect(track, T.variant, track.h / 2);
      d.rect({ ...track, w: Math.max(track.h, track.w * e.value / 100) }, T.secondary, track.h / 2);
      d.text(`${e.value}%`, track.x + track.w - 12, track.y + track.h / 2, 11, T.text, 500, 'right');
    } else if (e.type === 'search') {
      d.rect(e, T.surface, 28); d.icon('search', e.x + 27, e.y + 28, 23); d.text(shell.query || 'Search apps and actions…', e.x + 54, e.y + 28, 16, shell.query ? T.text : T.muted);
    } else {
      if (e.panel && !e.date || hot) d.rect(e, e.selected ? T.primary : hot ? T.high : T.surface, e.id.startsWith('tab-') ? 22 : 16);
      if (e.date && (e.selected || e.today)) d.rect({ x: e.x + 7, y: e.y + 1, w: e.w - 14, h: e.h - 2 }, e.selected ? T.secondary : T.variant, 13);
      if (e.icon) {
        const iconOnly = e.bar || e.edge || e.big || ['previous', 'next', 'mute', 'media'].includes(e.id) || /^(close|fullscreen|notification)-/.test(e.id);
        d.icon(e.icon, iconOnly ? e.x + e.w / 2 : e.x + 25, e.y + e.h / 2, e.big ? 30 : 22, e.selected ? T.text : T.secondary);
        if (!iconOnly) { d.text(e.label, e.x + 51, e.y + e.h / 2 - (e.detail ? 9 : 0), e.id.startsWith('app-') ? 16 : 12, T.text, 500, 'left', FONTS.body, e.w - 62); if (e.detail) d.text(e.detail, e.x + 51, e.y + e.h / 2 + 12, 11, T.muted, 400, 'left', FONTS.body, e.w - 62); }
      } else d.text(e.label, e.x + e.w / 2, e.y + e.h / 2, e.date ? 12 : 13, e.date && e.selected ? T.background : e.muted ? T.muted : T.text, e.selected ? 600 : 400, 'center');
    }
    if (focused === e.id || e.image && e.selected) {
      const outline = track
        ? { x: track.x - 3, y: track.y - 3, w: track.w + 6, h: track.h + 6 }
        : { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 4 };
      context.strokeStyle = T.accent; context.lineWidth = 2; context.beginPath();
      context.roundRect(outline.x, outline.y, outline.w, outline.h, track ? outline.h / 2 : 14); context.stroke();
    }
  }
  return function paint(frame) {
    const { state, shell, layout, now } = frame;
    context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1; context.textBaseline = 'middle';
    if (state.phase === 'booting') { paintBoot({ ...frame, items: layout.items }); return; }
    wallpaper(shell.wallpaper); context.drawImage(background, 0, 0);
    if (['login', 'locked'].includes(state.phase)) {
      if (frame.revealed || state.phase === 'locked') { context.save(); context.globalAlpha = state.reducedMotion ? 1 : frame.revealProgress; context.drawImage(blurred, 0, 0); context.fillStyle = '#00000066'; context.fillRect(0, 0, 1200, 675); context.restore(); }
      paintLogin(frame); return;
    }
    if (state.phase !== 'desktop') {
      context.fillStyle = state.phase === 'off' ? '#000000' : '#0d0e12ee'; context.fillRect(0, 0, 1200, 675);
      if (state.phase !== 'off') { d.logo(600, 279, 64, T.accent); d.text({ 'shutting-down': state.restarting ? 'Restarting…' : 'Shutting down…', 'signing-out': 'Signing out…', 'signing-in': 'Starting Hyprland session…', unlocking: 'Unlocking your workspace…' }[state.phase], 600, 352, 18, T.secondary, 500, 'center'); }
      return;
    }
    if (!layout.fullscreen) { context.fillStyle = T.background; context.fillRect(0, 0, T.barWidth, 675); context.lineWidth = 20; context.strokeStyle = T.background; context.beginPath(); context.roundRect(50, 0, 1150, 675, T.rounding + 10); context.stroke(); d.rect({ x: 16, y: 63, w: 28, h: 184 }, T.surface, 16); }
    layout.windows.forEach(window => drawWindow(window, frame)); layout.items.filter(e => !e.panel).forEach(e => item(e, frame));
    if (shell.panel) {
      if (shell.panel === 'session') { context.fillStyle = '#00000066'; context.fillRect(60, 10, 1130, 655); }
      const progress = state.reducedMotion ? 1 : Math.min(1, (now - frame.panelAt) / T.duration);
      context.save(); context.globalAlpha = progress; layout.surfaces.forEach(box => panelSurface(box, progress));
      if (shell.panel === 'dashboard') dashboard(frame);
      else if (['utilities', 'audio'].includes(shell.panel)) { d.text('Quick toggles', 852, 356, 19, T.text, 500); d.icon('brightness_6', 872, 458, 24); }
      else if (shell.panel === 'network') d.text('Networks', 82, 414, 19, T.text, 500);
      else if (shell.panel === 'battery') { d.text('Laptop battery', 80, 456, 18, T.text, 500); d.text('82%', 80, 505, 38, T.secondary, 500); d.text('Discharging · 4h 12m', 80, 539, 12, T.muted); }
      else if (shell.panel === 'sidebar') {
        d.text('Notifications', 844, 52, 20, T.text, 500);
        if (!shell.notifications.length) { d.icon('notifications_none', 1006, 270, 64, T.outline); d.text('All caught up', 1006, 329, 18, T.secondary, 400, 'center'); }
        shell.notifications.slice(0, 5).forEach((n, i) => { d.rect({ x: 840, y: 94 + i * 92, w: 332, h: 80 }, T.surface, 20); d.text(n.title, 858, 118 + i * 92, 14, T.text, 500); d.text(n.message, 858, 148 + i * 92, 11, T.muted, 400, 'left', FONTS.body, 256); });
      }
      if (shell.panel === 'launcher' && !shell.results.length) d.text('No matching apps or actions', 630, 548, 16, T.muted, 400, 'center');
      layout.items.filter(e => e.panel).forEach(e => { context.save(); if (e.disabled) context.globalAlpha *= 0.4; item(e, frame); context.restore(); }); context.restore();
    }
    if (shell.osd && !['utilities', 'audio', 'session'].includes(shell.panel)) {
      const value = shell.osd.type === 'volume' ? shell.volume : shell.brightness; d.rect({ x: 1120, y: 250, w: 70, h: 230 }, T.background, 24); d.icon(shell.osd.type === 'volume' ? 'volume_up' : 'brightness_6', 1155, 280, 24);
      d.rect({ x: 1144, y: 310, w: 22, h: 125 }, T.variant, 11); d.rect({ x: 1144, y: 435 - value * 1.25, w: 22, h: Math.max(1, value * 1.25) }, T.secondary, 11); d.text(String(value), 1155, 457, 12, T.text, 400, 'center');
    }
    if (shell.toast && shell.panel !== 'sidebar') { d.rect({ x: 854, y: 18, w: 314, h: 78 }, T.background, 22); d.icon('wifi', 882, 45, 22, T.accent); d.text(shell.toast.title, 909, 42, 14, T.text, 500); d.text(shell.toast.message, 878, 72, 11, T.muted, 400, 'left', FONTS.body, 270); }
  };
}
