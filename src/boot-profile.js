// Visual simulation profile, based on Limine 12.9.3 and CachyOS's Linux boot entries.
// Sources: github.com/Limine-Bootloader/Limine/tree/v12.9.3
//          wiki.cachyos.org/configuration/boot_manager_configuration/
// Quiet-splash profile: rootfstype=btrfs rootflags=subvol=@ rw quiet splash loglevel=3 systemd.show_status=auto.
const line = (at, text) => Object.freeze({ at, text });
export const BOOT_COLORS = Object.freeze({ background: '#000000', text: '#aaaaaa',
  menuBackground: '#101728', menuText: '#c3c6dc', help: '#a1c99c', selected: '#c6cce2' });
export const BOOT_MENU = Object.freeze({ x: 440, y: 298, rowHeight: 20, width: 300, fontSize: 18, cellWidth: 10.8 });
export const BOOT_ANIMATION = Object.freeze({ fps: 30, logoFrames: 88, throbberFrames: 41, logoSize: 300, throbberSize: 65 });
export const BOOT_ENTRIES = Object.freeze([
  ['normal', 'linux-cachyos'],
  ['lts', 'linux-cachyos-lts'],
].map(([id, label]) => {
  const kernelPath = `boot():/vmlinuz-${label}`;
  const modulePath = `boot():/initramfs-${label}.img`;
  return Object.freeze({ id, label,
    loadingLines: Object.freeze([
      line(0, `linux: Loading kernel \`${kernelPath}\`...`),
      line(150, `linux: Loading module \`${modulePath}\`...`),
    ]) });
}));
export const BOOT_STAGES = Object.freeze([
  { id: 'firmware', duration: 450 },
  { id: 'limine', duration: 3000 },
  { id: 'loader', duration: 450 },
  { id: 'plymouth-throbber', duration: 2000 },
  { id: 'plymouth-logo', duration: Math.ceil(BOOT_ANIMATION.logoFrames * 1000 / BOOT_ANIMATION.fps) },
  { id: 'plymouth-hold', duration: 300 },
  { id: 'handoff', duration: 150 },
].map((stage) => Object.freeze(stage)));
