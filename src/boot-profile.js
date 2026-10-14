// Visual simulation profile, based on Limine 12.9.3 and CachyOS's Linux boot entries.
// Sources: github.com/Limine-Bootloader/Limine/tree/v12.9.3
//          wiki.cachyos.org/configuration/boot_manager_configuration/
const line = (at, text, status = '') => Object.freeze({ at, text, status });
const rootUuid = '895a2100-674e-4b20-94e1-5f31d7ea8801';
const cmdline = `root=UUID=${rootUuid} rootfstype=btrfs rootflags=subvol=@ rw quiet splash loglevel=3 systemd.show_status=auto`;
export const SESSION_LABEL = 'CachyOS · Hyprland';
export const BOOT_COLORS = Object.freeze({ background: '#000000', text: '#aaaaaa',
  menuBackground: '#101728', menuText: '#c3c6dc', help: '#a1c99c', accent: '#55ff55', selected: '#c6cce2' });
export const BOOT_MENU = Object.freeze({ x: 440, y: 298, rowHeight: 20, width: 300, fontSize: 18, cellWidth: 10.8 });
export const BOOT_ANIMATION = Object.freeze({ fps: 30, logoFrames: 88, throbberFrames: 41, logoSize: 300, throbberSize: 65 });
export const BOOT_ENTRIES = Object.freeze([
  ['normal', 'linux-cachyos', '7.2.9-2-cachyos', 'Boot CachyOS with the default kernel.'],
  ['lts', 'linux-cachyos-lts', '6.12.0-cachyos-lts', 'Boot CachyOS with the long-term support kernel.'],
].map(([id, label, version, comment]) => {
  const kernelPath = `boot():/vmlinuz-${label}`;
  const modulePath = `boot():/initramfs-${label}.img`;
  return Object.freeze({ id, label, version, comment, kernelPath, modulePath, cmdline,
    loadingLines: Object.freeze([
      line(0, `linux: Loading kernel \`${kernelPath}\`...`),
      line(150, `linux: Loading module \`${modulePath}\`...`),
    ]) });
}));
export const BOOT_STAGES = Object.freeze([
  { id: 'firmware', duration: 450, announcement: 'Power on. Initializing firmware.' },
  { id: 'limine', duration: 3000, announcement: 'Limine boot menu. Use arrows to select and Enter to boot.' },
  { id: 'loader', duration: 450, announcement: 'Loading the Linux kernel and initramfs.' },
  { id: 'plymouth-throbber', duration: 2000, announcement: 'CachyOS is starting.' },
  { id: 'plymouth-logo', duration: Math.ceil(BOOT_ANIMATION.logoFrames * 1000 / BOOT_ANIMATION.fps), announcement: 'CachyOS boot animation.' },
  { id: 'plymouth-hold', duration: 300, announcement: 'CachyOS is ready.' },
  { id: 'handoff', duration: 150, announcement: 'Opening the login screen.' },
].map((stage) => Object.freeze({ ...stage, lines: Object.freeze(stage.lines || []) })));
