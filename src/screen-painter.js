import { BOOT_COLORS, BOOT_MENU, SESSION_LABEL } from './boot-profile.js';

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

// Paint the existing desktop layout without owning input, state or textures.
export function createScreenPainter(canvas, icons) {
  const context = canvas.getContext('2d');
  const wallpaper = document.createElement('canvas');
  wallpaper.width = canvas.width;
  wallpaper.height = canvas.height;
  drawWallpaper(wallpaper.getContext('2d'), wallpaper.width, wallpaper.height);
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
  function drawItem(entry, { activeTrigger, hover, focused, passwordLength, state, statusIcons, connecting, volume }) {
    // The clock screen is an unlabeled activation surface with a native accessible button.
    if (entry.id === 'unlock') return;
    const box = entry;
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
      const length = passwordLength;
      context.fillText(length ? '•'.repeat(Math.min(length, 24)) : 'Password', box.x + 14, box.y + box.h / 2, box.w - 28);
      context.strokeStyle = state.error ? '#efb2b8' : focused === entry.id ? '#b8c9ef' : '#ffffff30';
      context.lineWidth = focused === entry.id ? 2 : 1;
      context.beginPath();
      context.roundRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2, 14);
      context.stroke();
    } else if (entry.id === 'settings') {
      const names = statusIcons;
      if (names.some(iconFailed)) {
        context.font = '600 14px "Segoe UI", Arial, sans-serif';
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.fillText('Settings', box.x + box.w / 2, box.y + box.h / 2);
      } else names.forEach((name, index) => icon(name, box.x + 8 + index * 22, box.y + (box.h - 16) / 2, connecting && index === 0 ? 0.5 : 1));
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
  function drawBoot({ state, items, focused }) {
    const boot = state.boot;
    context.fillStyle = BOOT_COLORS.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '16px Consolas, "Liberation Mono", monospace';
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
    let y = 30;
    const columns = Math.floor((canvas.width - 48) / 9.6);
    for (const line of boot.lines) {
      const prefix = line.status === 'ok' ? '[  OK  ] ' : '';
      let remaining = prefix + line.text;
      let first = true;
      while (remaining && y < canvas.height - 20) {
        let end = remaining.length;
        if (end > columns) end = remaining.lastIndexOf(' ', columns);
        if (end <= 0) end = columns;
        const text = remaining.slice(0, end);
        context.fillStyle = BOOT_COLORS.text;
        if (prefix && first) {
          context.fillStyle = BOOT_COLORS.accent;
          context.fillText(prefix, 24, y);
          context.fillStyle = BOOT_COLORS.text;
          context.fillText(text.slice(prefix.length), 24 + prefix.length * 9.6, y);
        } else context.fillText(text, 24, y);
        remaining = remaining.slice(end).trimStart();
        first = false;
        y += 20;
      }
    }
  }
  function draw(frame) {
    const { items, panelBox, barHeight, state, now, today, dateLabel, loginRevealed, loginAnimation } = frame;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(wallpaper, 0, 0);
    context.textBaseline = 'middle';
    if (state.phase === 'booting') { drawBoot(frame); return; }
    if (state.phase !== 'desktop') {
      context.fillStyle = state.phase === 'off' ? '#000000' : '#0d1329c9';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (state.phase === 'login') {
        const { eased, offset, opacity } = loginAnimation;
        context.fillStyle = '#e8edf7';
        context.textAlign = 'center';
        context.font = `300 ${110 - 54 * eased}px "Segoe UI", Arial, sans-serif`;
        context.fillText(today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), 600, 300 - 175 * eased);
        context.font = `${20 - 5 * eased}px "Segoe UI", Arial, sans-serif`;
        context.fillStyle = '#b8c9df';
        context.fillText(dateLabel, 600, 382 - 202 * eased);
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
          context.font = '12px "Segoe UI", Arial, sans-serif';
          context.fillStyle = '#b8c9df';
          context.fillText(SESSION_LABEL, 600, 391 + offset);
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
        context.fillText({ 'shutting-down': state.restarting ? 'Restarting…' : 'Shutting down…',
          'signing-out': 'Signing out…', 'signing-in': 'Starting Hyprland session…' }[state.phase], 600, 344);
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
      if (entry.id === 'password' || entry.id === 'login') context.globalAlpha = loginAnimation.opacity;
      drawItem(entry, frame);
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
      items.filter((entry) => entry.inPanel).forEach((entry) => drawItem(entry, frame));
      context.restore();
    }
  }
  return draw;
}
