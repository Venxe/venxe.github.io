import { BOOT_COLORS, BOOT_MENU } from './boot-profile.js';

export function createBootPainter(canvas) {
  const context = canvas.getContext('2d');
  const bootWallpaper = document.createElement('canvas');
  bootWallpaper.width = canvas.width;
  bootWallpaper.height = canvas.height;
  const bootContext = bootWallpaper.getContext('2d');
  bootContext.fillStyle = BOOT_COLORS.menuBackground;
  bootContext.fillRect(0, 0, canvas.width, canvas.height);
  for (const [x, y, radius, color] of [[300, 70, 290, '#62487899'], [535, 5, 250, '#70669499'],
    [140, -30, 240, '#53485d88'], [260, 230, 180, '#513d6755']]) {
    const glow = bootContext.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, '#10172800');
    bootContext.fillStyle = glow;
    bootContext.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBoot({ state, items, focused, bootArtwork }) {
    const boot = state.boot;
    context.fillStyle = BOOT_COLORS.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '16px Consolas, "Liberation Mono", monospace';
    if (boot.stage.startsWith('plymouth-')) {
      if (bootArtwork) {
        const { image, size } = bootArtwork;
        context.drawImage(image, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
      } else {
        context.textAlign = 'center';
        context.fillStyle = '#ffffff';
        context.fillText('CachyOS', canvas.width / 2, canvas.height / 2);
      }
      return;
    }
    if (boot.stage === 'limine') {
      context.drawImage(bootWallpaper, 0, 0);
      context.font = `${BOOT_MENU.fontSize}px Consolas, "Liberation Mono", monospace`;
      context.textAlign = 'left';
      for (const [key, label, x] of [['ARROWS', 'Select', 112], ['ENTER', 'Boot', 294], ['E', 'Edit', 444], ['B', 'Blank Entry', 945]]) {
        context.fillStyle = BOOT_COLORS.help;
        context.fillText(key, x, 15);
        context.fillStyle = BOOT_COLORS.menuText;
        context.fillText(label, x + (key.length + 1) * BOOT_MENU.cellWidth, 15);
      }
      for (const entry of items) {
        const labelX = entry.x + entry.prefix.length * BOOT_MENU.cellWidth;
        const y = entry.y + entry.h / 2;
        context.fillStyle = BOOT_COLORS.menuText;
        context.fillText(entry.prefix, entry.x, y);
        if (entry.selected) {
          context.fillStyle = BOOT_COLORS.selected;
          context.fillRect(labelX - 3, entry.y + 1, entry.label.length * BOOT_MENU.cellWidth + 6, entry.h - 2);
        }
        context.fillStyle = entry.selected ? BOOT_COLORS.menuBackground : BOOT_COLORS.menuText;
        context.fillText(entry.label, labelX, y);
        if (entry.id === focused && !entry.selected) {
          context.strokeStyle = BOOT_COLORS.selected;
          context.lineWidth = 1;
          context.strokeRect(labelX - 3, entry.y + 1, entry.label.length * BOOT_MENU.cellWidth + 6, entry.h - 2);
        }
      }
      if (boot.countdownSeconds !== null) {
        context.textAlign = 'center';
        context.fillStyle = BOOT_COLORS.help;
        context.fillText(`Booting automatically in ${boot.countdownSeconds}...`, canvas.width / 2, canvas.height - 22);
      }
      return;
    }
    context.textAlign = 'left';
    context.fillStyle = BOOT_COLORS.text;
    for (const [index, line] of boot.lines.entries()) {
      context.fillText(line.text, 24, 30 + index * 20);
    }
  }
  return drawBoot;
}
