import { THEME, NETWORKS, fullDate, timeLabel } from './desktop-theme.js';

export const inside = (point, box) => !!(point && box && point.x >= box.x && point.x < box.x + box.w && point.y >= box.y && point.y < box.y + box.h);

// All coordinates are desktop pixels, shared by painting and both input paths.
export function desktopLayout(state, shell, today, revealed) {
  const items = [];
  const surfaces = [];
  const windows = [];
  let calendar = null;
  const add = (id, label, x, y, w = 44, h = 44, extra = {}) => items.push({ id, label, x, y, w, h, type: 'button', ...extra });
  const surface = (x, y, w, h, edge, extra = {}) => { const box = { x, y, w, h, edge, ...extra }; surfaces.push(box); return box; };
  if (['login', 'locked'].includes(state.phase)) {
    if (!revealed && state.phase === 'login') add('unlock', 'Open sign in', 0, 0, 1200, 675, { invisible: true });
    else {
      add('password', 'Password', 491, 465, 202, 44, { type: 'password', disabled: state.verifying });
      add('login', state.verifying ? 'Verifying…' : state.phase === 'locked' ? 'Unlock session' : 'Sign in', 693, 465, 44, 44, { icon: 'arrow_forward', disabled: state.verifying });
      if (state.phase === 'login') {
        add('shutdown', 'Power off', 188, 445, 118, 118, { icon: 'power_settings_new', big: true });
        add('restart', 'Restart', 313, 445, 118, 118, { icon: 'restart_alt', big: true });
      }
    }
    return { items, surfaces, windows, calendar };
  }
  if (state.phase !== 'desktop') return { items, surfaces, windows, calendar };
  const visible = shell.windows.filter(w => w.workspace === shell.workspace);
  const fullscreen = visible.find(w => w.id === shell.focus && w.fullscreen);
  for (const [index, window] of (fullscreen ? [fullscreen] : visible).entries()) {
    const box = fullscreen ? { x: 0, y: 0, w: 1200, h: 675 } : { x: 76 + index * (1110 / visible.length), y: 26, w: 1110 / visible.length - 12, h: 623 };
    windows.push({ ...window, ...box });
    add(`focus-${window.id}`, `${window.app === 'terminal' ? 'Terminal' : 'Wallpapers'} window`, box.x, box.y, box.w, box.h, { invisible: true, window: true });
    add(`fullscreen-${window.id}`, 'Toggle fullscreen', box.x + box.w - 82, box.y, 38, 40, { icon: 'fullscreen' });
    add(`close-${window.id}`, 'Close window', box.x + box.w - 42, box.y, 38, 40, { icon: 'close' });
    if (window.app === 'wallpapers') for (let i = 0; i < 2; i++) add(`wallpaper-${i}`, ['Lunar voyage', 'Caelestia landscape'][i], box.x + 20 + i * ((box.w - 50) / 2), box.y + 100, (box.w - 60) / 2, 170, { image: true, selected: shell.wallpaper === i });
  }
  if (!fullscreen) {
    add('launcher', 'Open launcher', 8, 12, 44, 44, { icon: 'logo', bar: true });
    for (let i = 1; i <= 5; i++) add(`workspace-${i}`, `Workspace ${i}`, 8, 68 + (i - 1) * 36, 44, 34, { bar: true, workspace: i, selected: shell.workspace === i, occupied: shell.windows.some(w => w.workspace === i) });
    if (shell.focus) add('active-window', 'Focus active window', 8, 280, 44, 44, { bar: true, icon: visible.find(w => w.id === shell.focus)?.app === 'terminal' ? 'terminal' : 'folder_open' });
    add('dashboard', `${fullDate(today)}, ${timeLabel(today)}`, 8, 410, 44, 82, { bar: true, clock: true });
    add('network', 'Network', 8, 502, 44, 44, { bar: true, icon: shell.wifi ? 'wifi' : 'wifi_off' });
    add('battery', 'Battery · 82%', 8, 550, 44, 44, { bar: true, icon: 'battery_5_bar' });
    add('session', 'Session options', 8, 610, 44, 44, { bar: true, icon: 'power_settings_new' });
    add('sidebar', 'Notifications', 1146, 14, 44, 44, { edge: true, icon: shell.dnd ? 'notifications_off' : 'notifications' });
    add('utilities', 'Utilities', 1146, 616, 44, 44, { edge: true, icon: 'tune' });
  }
  if (shell.panel === 'dashboard') {
    surface(174, 10, 910, 410, 'top');
    ['Dashboard', 'Media', 'Performance', 'Weather'].forEach((label, i) => add(`tab-${i}`, label, 194 + i * 215, 24, 205, 44, { selected: shell.tab === i, panel: true }));
    if (shell.tab === 0) {
      const x = 450, y = 158, w = 320;
      calendar = { x, y, w, h: 230 };
      add('previous', 'Previous month', x, y, 36, 36, { icon: 'chevron_left', panel: true });
      add('next', 'Next month', x + w - 36, y, 36, 36, { icon: 'chevron_right', panel: true });
      const month = new Date(shell.month);
      const start = new Date(month.getFullYear(), month.getMonth(), 1 - (month.getDay() + 6) % 7);
      for (let i = 0; i < 42; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        add(`day-${i}`, String(date.getDate()), x + i % 7 * w / 7, y + 62 + Math.floor(i / 7) * 26, w / 7, 26,
          { panel: true, date: date.getTime(), dateLabel: fullDate(date), selected: date.getTime() === shell.selected,
            today: date.toDateString() === today.toDateString(), muted: date.getMonth() !== month.getMonth() });
      }
      add('today', 'Today', 320, 324, 96, 44, { panel: true });
      add('media', shell.playing ? 'Pause preview' : 'Play preview', 942, 316, 56, 56, { icon: shell.playing ? 'pause' : 'play_arrow', panel: true });
    } else if (shell.tab === 1) add('media', shell.playing ? 'Pause preview' : 'Play preview', 582, 300, 72, 64, { icon: shell.playing ? 'pause' : 'play_arrow', panel: true });
  } else if (shell.panel === 'launcher') {
    const h = 120 + Math.max(1, shell.results.length) * 64;
    const top = 665 - h;
    surface(360, top, 540, h, 'bottom');
    shell.results.forEach((app, i) => add(`app-${app.id}`, app.title, 376, top + 18 + i * 64, 508, 60, { icon: app.icon, detail: app.detail, selected: shell.choice === i, panel: true }));
    add('search', 'Search apps and actions', 376, 589, 508, 56, { type: 'search', panel: true });
  } else if (shell.panel === 'utilities' || shell.panel === 'audio') {
    surface(832, 327, 358, 338, 'right');
    add('mute', shell.volume ? 'Mute sound' : 'Unmute sound', 850, 382, 44, 44, { icon: shell.volume ? 'volume_up' : 'volume_off', panel: true });
    add('volume', 'Volume', 906, 382, 256, 44, { type: 'range', value: shell.volume, icon: 'volume_up', panel: true });
    add('brightness', 'Brightness', 906, 436, 256, 44, { type: 'range', value: shell.brightness, min: 10, icon: 'brightness_6', panel: true });
    add('wifi', shell.wifi ? 'Wi-Fi on' : 'Wi-Fi off', 850, 496, 146, 52, { icon: 'wifi', selected: shell.wifi, panel: true });
    add('dnd', 'Do not disturb', 1008, 496, 154, 52, { icon: 'do_not_disturb_on', selected: shell.dnd, panel: true });
    add('power', shell.powerSaver ? 'Power Saver' : 'Balanced', 850, 560, 146, 52, { icon: 'eco', selected: shell.powerSaver, panel: true });
    add('lock', 'Lock session', 1008, 560, 154, 52, { icon: 'lock', panel: true });
    add('network-open', 'Choose network', 850, 618, 312, 36, { icon: 'wifi_find', panel: true });
  } else if (shell.panel === 'network') {
    surface(60, 386, 330, 249, 'left');
    add('wifi', shell.wifi ? 'Wi-Fi on' : 'Wi-Fi off', 78, 435, 294, 44, { icon: 'wifi', selected: shell.wifi, panel: true });
    NETWORKS.forEach((name, i) => add(`network-${i}`, name, 78, 489 + i * 56, 294, 52, { detail: shell.pending === i ? 'Connecting…' : shell.network === i && shell.wifi ? 'Connected' : 'Saved network', icon: 'wifi', selected: shell.network === i && shell.wifi && shell.pending === null, disabled: !shell.wifi, panel: true }));
  } else if (shell.panel === 'battery') {
    surface(60, 423, 272, 200, 'left');
    add('power', shell.powerSaver ? 'Power Saver' : 'Balanced', 78, 559, 236, 44, { icon: 'eco', selected: shell.powerSaver, panel: true });
  } else if (shell.panel === 'session') {
    surface(1080, 185, 110, 324, 'right');
    [['lock', 'Lock session', 'lock'], ['logout', 'Log out', 'logout'], ['restart', 'Restart', 'restart_alt'], ['shutdown', 'Power off', 'power_settings_new']].forEach(([id, label, icon], i) => add(id, label, 1098, 203 + i * 73, 74, 66, { icon, panel: true, big: true }));
  } else if (shell.panel === 'sidebar') {
    surface(822, 10, 368, 595, 'right');
    add('clear-notifications', 'Clear all', 1066, 30, 102, 44, { panel: true, disabled: !shell.notifications.length });
    shell.notifications.slice(0, 5).forEach((n, i) => add(`notification-${n.id}`, `Dismiss ${n.title}`, 1118, 101 + i * 92, 44, 44, { icon: 'close', panel: true }));
  }
  return { items, surfaces, windows, calendar, fullscreen: !!fullscreen };
}
