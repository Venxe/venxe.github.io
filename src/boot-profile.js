// Visual simulation profile, based on Limine 12.9.3 and CachyOS's Linux boot entries.
// Sources: github.com/Limine-Bootloader/Limine/tree/v12.9.3
//          wiki.cachyos.org/configuration/boot_manager_configuration/
const line = (at, text, status = '') => Object.freeze({ at, text, status });
const rootUuid = '895a2100-674e-4b20-94e1-5f31d7ea8801';
const cmdline = `root=UUID=${rootUuid} rootfstype=btrfs rootflags=subvol=@ rw loglevel=6 systemd.show_status=yes`;
const kernelPath = 'boot():/vmlinuz-linux-cachyos';
export const BOOT_BRANDING = 'Limine 12.9.3 (x86-64, UEFI)';
export const SESSION_LABEL = 'CachyOS · Hyprland';
export const BOOT_COLORS = Object.freeze({ background: '#000000', text: '#aaaaaa',
  branding: '#00aaaa', help: '#00aa00', accent: '#55ff55', selected: '#aaaaaa' });
export const BOOT_ENTRIES = Object.freeze([
  ['normal', 'CachyOS (linux-cachyos)', 'initramfs-linux-cachyos.img', 'Boot CachyOS with the default initramfs.'],
  ['fallback', 'CachyOS (linux-cachyos, fallback)', 'initramfs-linux-cachyos-fallback.img', 'Boot CachyOS with the fallback initramfs (additional drivers).'],
].map(([id, label, image, comment]) => {
  const modulePath = `boot():/${image}`;
  return Object.freeze({ id, label, comment, kernelPath, modulePath,
    loadingLines: Object.freeze([
      line(0, `linux: Loading kernel \`${kernelPath}\`...`),
      line(280, `linux: Loading module \`${modulePath}\`...`),
    ]) });
}));
export const BOOT_STAGES = Object.freeze([
  { id: 'firmware', duration: 450, announcement: 'Power on. Initializing firmware.' },
  { id: 'limine', duration: 3000, announcement: 'Limine boot menu. Use arrows to select and Enter to boot.' },
  { id: 'loader', duration: 700, announcement: 'Loading the Linux kernel and initramfs.' },
  { id: 'kernel', duration: 1250, announcement: 'Linux is initializing hardware.', lines: [
    line(0, '[    0.000000] Linux version 7.2.9-2-cachyos (x86_64)'),
    line(0, `[    0.000000] Command line: ${cmdline}`),
    line(150, '[    0.042186] efi: EFI runtime services initialized'),
    line(300, '[    0.083024] ACPI: Interpreter enabled'),
    line(300, '[    0.128407] smp: Brought up all CPUs'),
    line(550, '[    0.214801] PCI: Using ACPI for IRQ routing'),
    line(750, '[    0.381260] nvme nvme0: allocated I/O queues'),
    line(1000, '[    0.512740]  nvme0n1: p1 p2'),
    line(1100, '[    0.628102] Run /init as init process'),
  ] },
  { id: 'initramfs', duration: 900, announcement: 'Mounting the root filesystem.', lines: [
    line(0, 'Running in initial RAM disk.'),
    line(120, 'Started Journal Service.', 'ok'),
    line(280, `Found device /dev/disk/by-uuid/${rootUuid}.`, 'ok'),
    line(420, 'Mounted /sysroot (Btrfs, subvolume @).', 'ok'),
    line(600, 'Reached target Initrd Root File System.', 'ok'),
    line(780, 'Starting Switch Root...'),
  ] },
  { id: 'services', duration: 1500, announcement: 'Starting CachyOS system services and the login manager.', lines: [
    line(0, 'Welcome to CachyOS!'),
    line(100, 'Started Journal Service.', 'ok'),
    line(250, 'Started Rule-based Manager for Device Events and Files.', 'ok'),
    line(450, 'Reached target Local File Systems.', 'ok'),
    line(650, 'Started D-Bus System Message Bus.', 'ok'),
    line(850, 'Started Network Manager.', 'ok'),
    line(1050, 'Reached target Multi-User System.', 'ok'),
    line(1250, 'Started Simple Desktop Display Manager.', 'ok'),
    line(1400, 'Reached target Graphical Interface.', 'ok'),
  ] },
  { id: 'handoff', duration: 200, announcement: 'Opening the login screen.' },
].map((stage) => Object.freeze({ ...stage, lines: Object.freeze(stage.lines || []) })));
