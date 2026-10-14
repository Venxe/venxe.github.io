// Caelestia shell a3a8fe5 / SDDM Locklike dd69abb. See assets/desktop/README.md.
export const THEME = Object.freeze({
  background: '#0d0e12', low: '#111318', surface: '#17191f', high: '#1d1f26', variant: '#23262d',
  text: '#e3e5f0', muted: '#9296a5', primary: '#68779b', accent: '#afc6ff', secondary: '#bfc6dc',
  tertiary: '#f0dfff', error: '#fa746f', success: '#a9cfb2', outline: '#73757f',
  barWidth: 60, rounding: 25, duration: 400,
});
export const FONTS = Object.freeze({ body: 'Google Sans Flex', clock: 'Rubik', digits: 'Caelestia Clock', mono: 'CaskaydiaCove', icons: 'Material Symbols Rounded' });
export const NETWORKS = Object.freeze(['Venxe Studio', 'Coffee Corner']);
export const WALLPAPERS = Object.freeze(['wallpaper.png', 'wallpaper-alt.webp']);
export const DEMO = Object.freeze({ host: 'venxe-laptop', os: 'CachyOS', wm: 'Hyprland', user: 'venxe',
  weather: 'Clear skies', temperature: 21, location: 'Istanbul', cpu: 4, memory: 3.2, totalMemory: 16,
  storage: 86, totalStorage: 512, battery: 82, track: 'A quiet afternoon', artist: 'Workspace session', duration: 204 });
// Window resource costs: CPU percentage points, memory in GiB, and launch CPU peak.
export const APPS = Object.freeze([
  { id: 'terminal', title: 'Terminal', detail: 'System information · foot', icon: 'terminal', resources: Object.freeze({ cpu: 0.6, memory: 0.08, launchCpu: 12 }) },
  { id: 'wallpapers', title: 'Wallpapers', detail: 'Wallpaper collection · thunar', icon: 'folder_open', resources: Object.freeze({ cpu: 1, memory: 0.16, launchCpu: 8 }) },
  { id: 'dashboard', title: 'Dashboard', detail: 'Calendar, media and performance', icon: 'dashboard' },
  { id: 'utilities', title: 'Utilities', detail: 'Network, sound and display', icon: 'tune' },
  { id: 'lock', title: 'Lock session', detail: 'Keep your workspace open', icon: 'lock' },
]);
export const fullDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const timeLabel = (date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const greeting = (date) => date.getHours() < 4 || date.getHours() >= 20 ? 'Good evening' : date.getHours() < 10 ? 'Good morning' : 'Good afternoon';
export const isTextInput = (element) => element?.tagName === 'TEXTAREA' || element?.isContentEditable || (element?.tagName === 'INPUT' && ['password', 'text', 'search'].includes(element.type));
