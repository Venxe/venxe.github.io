import { APPS, DEMO, NETWORKS, WALLPAPERS } from './desktop-theme.js';

const STARTUP_CPU = 40;
const STARTUP_DECAY_SECONDS = 6;

// A single local model backs the canvas, UV controls and native accessibility tree.
export function createDesktopShell(time = Date.now()) {
  let revision = 0;
  let panel = null;
  let tab = 0;
  let query = '';
  let choice = 0;
  let workspace = 1;
  let windows = [];
  let focus = null;
  let nextWindow = 1;
  let volume = 50;
  let lastVolume = 50;
  let brightness = 100;
  let wifi = true;
  let network = 0;
  let pending = null;
  let connectedAt = 0;
  let powerSaver = false;
  let dnd = false;
  let wallpaper = 0;
  let notifications = [];
  let nextNotification = 1;
  let toast = null;
  let osd = null;
  let playing = false;
  let position = 42;
  let playStarted = time;
  let resources = Object.freeze({ cpu: DEMO.cpu + STARTUP_CPU, memory: DEMO.memory });
  let resourcesAt = time;
  let sessionStartedAt = time;
  let selected = new Date(time).setHours(0, 0, 0, 0);
  let month = new Date(new Date(time).getFullYear(), new Date(time).getMonth(), 1).getTime();
  const results = () => APPS.filter(app => (app.title + ' ' + app.detail).toLowerCase().includes(query.trim().toLowerCase()));
  function notify(title, message, at) {
    const record = Object.freeze({ id: nextNotification++, title, message, at });
    notifications = [record, ...notifications].slice(0, 12);
    if (!dnd) toast = { ...record, until: at + 3500 };
  }
  function send(event, value, at = Date.now()) {
    const before = JSON.stringify(snapshot());
    if (event === 'toggle') {
      if (!['launcher', 'dashboard', 'utilities', 'sidebar', 'session', 'network', 'battery', 'audio'].includes(value)) return;
      panel = panel === value ? null : value;
      query = ''; choice = 0;
    } else if (event === 'dismiss') panel = null;
    else if (event === 'tab' && Number.isInteger(value)) tab = Math.max(0, Math.min(3, value));
    else if (event === 'search' && typeof value === 'string') { query = value.slice(0, 80); choice = 0; }
    else if (event === 'choice' && Number.isInteger(value)) choice = Math.max(0, Math.min(results().length - 1, value));
    else if (event === 'workspace' && Number.isInteger(value) && value >= 1 && value <= 5) {
      workspace = value; focus = windows.findLast(w => w.workspace === workspace)?.id ?? null;
    } else if (event === 'open' && APPS.some(app => app.id === value && app.resources)) {
      const existing = windows.find(w => w.app === value && w.workspace === workspace);
      if (existing) focus = existing.id;
      else { focus = nextWindow++; windows = [...windows, { id: focus, app: value, workspace, fullscreen: false, openedAt: at }]; }
      panel = null;
    } else if (event === 'focus' && windows.some(w => w.id === value && w.workspace === workspace)) focus = value;
    else if (event === 'close') {
      windows = windows.filter(w => w.id !== value);
      if (focus === value) focus = windows.findLast(w => w.workspace === workspace)?.id ?? null;
    } else if (event === 'fullscreen') windows = windows.map(w => w.id === value ? { ...w, fullscreen: !w.fullscreen } : w);
    else if (event === 'move' && Number.isInteger(value) && value >= 1 && value <= 5) {
      windows = windows.map(w => w.id === focus ? { ...w, workspace: value, fullscreen: false } : w);
      focus = windows.findLast(w => w.workspace === workspace)?.id ?? null;
    } else if (event === 'volume' && Number.isFinite(value)) {
      volume = Math.max(0, Math.min(100, Math.round(value))); if (volume) lastVolume = volume;
      osd = { type: 'volume', until: at + 1800 };
    } else if (event === 'mute') { volume = volume ? 0 : lastVolume; osd = { type: 'volume', until: at + 1800 }; }
    else if (event === 'brightness' && Number.isFinite(value)) {
      brightness = Math.max(10, Math.min(100, Math.round(value))); osd = { type: 'brightness', until: at + 1800 };
    } else if (event === 'wifi') {
      wifi = !wifi; pending = wifi ? network : null; connectedAt = at + 700;
      if (!wifi) notify('Network', 'Wi-Fi turned off', at);
    } else if (event === 'network' && wifi && Number.isInteger(value) && NETWORKS[value]) { pending = value; connectedAt = at + 700; }
    else if (event === 'power') powerSaver = !powerSaver;
    else if (event === 'dnd') { dnd = !dnd; if (dnd) toast = null; }
    else if (event === 'wallpaper' && Number.isInteger(value) && WALLPAPERS[value]) wallpaper = value;
    else if (event === 'remove-notification') notifications = notifications.filter(n => n.id !== value);
    else if (event === 'clear-notifications') { notifications = []; toast = null; }
    else if (event === 'media') { position = playing ? (position + (at - playStarted) / 1000) % 204 : position; playing = !playing; playStarted = at; }
    else if (event === 'month' && [-1, 1].includes(value)) { const d = new Date(month); month = new Date(d.getFullYear(), d.getMonth() + value, 1).getTime(); }
    else if (event === 'date' && Number.isFinite(value)) { const d = new Date(value); if (!Number.isNaN(d.getTime())) { selected = d.setHours(0, 0, 0, 0); month = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); } }
    else if (event === 'reset') {
      panel = null; windows = []; focus = null; workspace = 1; notifications = []; toast = null; osd = null; playing = false; position = 42; query = ''; choice = 0;
      resources = Object.freeze({ cpu: (DEMO.cpu + STARTUP_CPU) * (powerSaver ? 0.75 : 1), memory: DEMO.memory });
      resourcesAt = at; sessionStartedAt = at;
    }
    if (JSON.stringify(snapshot()) !== before) revision++;
  }
  function update(at, animateResources = false) {
    if (pending !== null && wifi && at >= connectedAt) {
      network = pending; pending = null; notify('Connected', `Connected to ${NETWORKS[network]}`, at); revision++;
    }
    if (toast && at >= toast.until) { toast = null; revision++; }
    if (osd && at >= osd.until) { osd = null; revision++; }
    // Hidden meters do no sampling. Startup and launch bursts still age in wall time.
    if (!animateResources) return;
    if (at < resourcesAt) { resourcesAt = at; return; }
    if (at - resourcesAt < 50) return;
    const delta = (at - resourcesAt) / 1000;
    resourcesAt = at;
    const t = Math.max(0, (at - sessionStartedAt) / 1000);
    let cpuLoad = STARTUP_CPU * Math.exp(-t / STARTUP_DECAY_SECONDS);
    let memoryLoad = 0;
    for (const window of windows) {
      const profile = APPS.find(app => app.id === window.app).resources;
      const age = Math.max(0, (at - window.openedAt) / 1000);
      cpuLoad += profile.cpu + profile.launchCpu * Math.exp(-age / 2);
      memoryLoad += profile.memory;
    }
    const cpuTarget = (DEMO.cpu + cpuLoad + (playing ? 6 : 0)
      + 0.45 * Math.sin(t * 0.83) + 0.3 * Math.sin(t * 1.73) + 0.2 * Math.sin(t * 0.31)) * (powerSaver ? 0.75 : 1);
    const memoryTarget = DEMO.memory + memoryLoad + (playing ? 0.08 : 0)
      + 0.016 * Math.sin(t * 0.11) + 0.006 * Math.sin(t * 0.27);
    resources = Object.freeze({
      cpu: Math.max(0, Math.min(100, resources.cpu + (cpuTarget - resources.cpu) * (1 - Math.exp(-delta * 3)))),
      memory: Math.max(0, Math.min(DEMO.totalMemory, resources.memory + (memoryTarget - resources.memory) * (1 - Math.exp(-delta / 4)))),
    });
    revision++;
  }
  function snapshot() { return { panel, tab, query, choice, workspace, focus, windows, volume, brightness, wifi, network, pending, powerSaver, dnd, wallpaper,
    notifications, toast, osd, playing, position, playStarted, resources, selected, month }; }
  return {
    send,
    update,
    get state() {
      return Object.freeze({
        ...snapshot(), revision,
        results: Object.freeze(results().map(app => Object.freeze({ ...app }))),
        windows: Object.freeze(windows.map(window => Object.freeze({ ...window }))),
        notifications: Object.freeze([...notifications]),
        toast: toast ? Object.freeze({ ...toast }) : null,
        osd: osd ? Object.freeze({ ...osd }) : null,
      });
    },
  };
}
