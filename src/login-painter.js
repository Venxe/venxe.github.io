import { THEME as T, FONTS, DEMO, greeting, timeLabel } from './desktop-theme.js';
import { drawing } from './desktop-paint.js';

// Geometry follows Locklike's 1920x1080 / 1350x750 source at 0.625 scale.
export function createLoginPainter(context, assets) {
  const d = drawing(context);
  function clock(today) {
    const [hours, minutes] = timeLabel(today).split(':');
    context.save(); context.translate(600, 206);
    // Canvas fontStretch selects the variable font's narrow width axis.
    d.text(hours, -4, 0, 140, T.accent, 500, 'right', FONTS.digits);
    d.text(minutes, 4, 0, 140, T.secondary, 500, 'left', FONTS.digits);
    context.restore();
    d.text(today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).replace(', ', ' • ').toUpperCase(), 600, 281, 13, T.text, 600, 'center');
  }
  function fetchCard(box) {
    d.rect(box, T.surface, 12);
    d.rect({ x: box.x + 14, y: box.y + 16, w: 22, h: 22 }, T.secondary, 8);
    d.text('>', box.x + 25, box.y + 27, 15, T.background, 600, 'center', FONTS.mono);
    d.text('caelestiafetch.sh', box.x + 44, box.y + 27, 11, T.text, 400, 'left', FONTS.mono);
    d.logo(box.x + 50, box.y + 87, 71);
    const lines = [`WM    : ${DEMO.wm}`, `USER  : ${DEMO.user}`, `OS    : ${DEMO.os}`, `HOST  : ${DEMO.host}`];
    lines.forEach((line, i) => d.text(line, box.x + 99, box.y + 61 + i * 20, 10, T.text, 400, 'left', FONTS.mono, box.w - 107));
    [T.background, T.primary, T.text, T.tertiary, T.secondary, '#213528', '#545559'].forEach((color, i) => d.rect({ x: box.x + 20 + i * 31, y: box.y + box.h - 34, w: 19, h: 19 }, color, 7));
  }
  return function paint(frame) {
    const { state, shell, today, revealed, revealProgress, passwordLength, now, focused, hover } = frame;
    const locked = state.phase === 'locked';
    if (!locked && !revealed) {
      const greetingText = `${greeting(today)} `;
      const box = { x: 221, y: 271, w: 758, h: 133 };
      const size = 58;
      context.font = `500 ${size}px "${FONTS.body}", sans-serif`;
      context.textBaseline = 'middle';
      const greetingMetrics = context.measureText(greetingText);
      const userMetrics = context.measureText(DEMO.user);
      const x = box.x + (box.w - greetingMetrics.width - userMetrics.width) / 2;
      const ascent = Math.max(greetingMetrics.actualBoundingBoxAscent || 0, userMetrics.actualBoundingBoxAscent || 0);
      const descent = Math.max(greetingMetrics.actualBoundingBoxDescent || 0, userMetrics.actualBoundingBoxDescent || 0);
      const y = box.y + box.h / 2 + (ascent - descent) / 2;
      d.rect(box, '#0d0e12b8', 32);
      d.text(greetingText, x, y, size, T.text, 500);
      d.text(DEMO.user, x + greetingMetrics.width, y, size, T.accent, 500);
      return;
    }
    const progress = state.reducedMotion || locked ? 1 : revealProgress;
    const eased = 1 - (1 - progress) ** 3;
    context.save(); context.globalAlpha = eased;
    context.translate(600, 337.5); context.scale(0.5 + eased * 0.5, 0.5 + eased * 0.5); context.translate(-600, -337.5);
    d.rect({ x: 178.125, y: 103.125, w: 843.75, h: 468.75 }, '#0d0e12e8', 44);
    d.rect({ x: 187.5, y: 112.5, w: 243.75, h: 137.5 }, T.surface, 31);
    if (locked) {
      d.icon('clear_day', 224, 147, 29, T.tertiary);
      d.text(`${DEMO.temperature}°`, 263, 155, 42, T.secondary);
      d.text(DEMO.weather, 210, 202, 15);
      d.text(DEMO.location, 210, 226, 12, T.muted);
    } else {
      d.text(greeting(today), 309, 164, 25, T.text, 400, 'center', FONTS.clock);
      d.text(DEMO.user, 309, 197, 25, T.primary, 400, 'center', FONTS.clock);
    }
    fetchCard({ x: 187.5, y: 258, w: 243.75, h: 180 });
    if (locked) {
      d.rect({ x: 187.5, y: 446, w: 243.75, h: 116 }, T.surface, 28);
      d.ring(228, 497, 22, shell.resources.cpu / 100); d.ring(309, 497, 22, shell.resources.memory / DEMO.totalMemory, T.tertiary); d.ring(390, 497, 22, DEMO.battery / 100, T.success);
      d.text(`${Math.round(shell.resources.cpu)}%`, 228, 497, 11, T.text, 500, 'center');
      d.text('CPU', 228, 535, 10, T.muted, 400, 'center');
      d.text(`${shell.resources.memory.toFixed(1)}G`, 309, 497, 11, T.text, 500, 'center');
      d.text('RAM', 309, 535, 10, T.muted, 400, 'center');
      d.text(`${DEMO.battery}%`, 390, 497, 11, T.text, 500, 'center');
      d.text('BAT', 390, 535, 10, T.muted, 400, 'center');
    }
    clock(today);
    const morph = state.reducedMotion ? 1 : eased;
    // A subtle Material silhouette change, isolated from credential state.
    context.save(); context.translate(600, 379); context.rotate((morph - 0.5) * 0.015);
    d.avatar(assets.get('avatar.jpg'), -95, -64, 190, 130, morph); context.restore();
    const right = { x: 768.75, y: 112.5, w: 243.75, h: 221.875 };
    d.rect(right, T.surface, 22);
    if (locked) {
      d.icon('graphic_eq', 890, 172, 44, T.tertiary);
      d.text(DEMO.track, 890, 224, 19, T.text, 500, 'center');
      d.text(DEMO.artist, 890, 254, 12, T.muted, 400, 'center');
      d.text(shell.playing ? 'Playing preview' : 'Paused', 890, 290, 11, T.secondary, 400, 'center');
    } else {
      ['The man who does not read', 'has no advantage over the', 'man who cannot read.'].forEach((line, i) => d.text(line, 890, 187 + i * 21, 17, T.text, 400, 'center', FONTS.clock));
      d.text('~ Mark Twain', 890, 263, 12, T.primary, 600, 'center', FONTS.mono);
    }
    d.rect({ x: 768.75, y: 342.5, w: 243.75, h: 221.875 }, T.surface, 22);
    if (locked && shell.notifications.length) {
      d.icon('notifications', 798, 368, 20);
      d.text('Notifications', 820, 368, 14);
      shell.notifications.slice(0, 3).forEach((n, i) => {
        d.text(n.title, 788, 414 + i * 48, 13, T.text, 500);
        d.text(n.message, 788, 433 + i * 48, 10, T.muted, 400, 'left', FONTS.body, 205);
      });
    } else {
      const image = assets.get('dino.png');
      if (image?.complete && image.naturalWidth) {
        context.save(); context.globalAlpha *= 0.45; context.drawImage(image, 797, 417, 187, 94); context.restore();
      }
      d.text(locked ? 'No notifications' : 'Unlock for notifications', 890, 530, 10, T.muted, 400, 'center', FONTS.mono);
    }
    for (const item of frame.layout.items) {
      context.save();
      if (['password', 'login'].includes(item.id) && state.error && !state.reducedMotion) {
        const age = Math.min(1, (now - frame.errorAt) / 350);
        context.translate(Math.sin(age * Math.PI * 14) * 5 * (1 - age), 0);
      }
      if (item.type === 'password') {
        const width = passwordLength ? 246 : 202;
        d.rect({ x: item.x, y: item.y + 5, w: width, h: 34 }, T.surface, 24);
        d.icon(state.verifying ? 'progress_activity' : 'lock', item.x + 17, item.y + 22, 14, T.muted);
        if (!passwordLength) d.text(state.verifying ? 'Verifying…' : 'Enter your password', item.x + 105, item.y + 22, 11, T.muted, 400, 'center', FONTS.clock);
        else for (let i = 0; i < Math.min(14, passwordLength); i++) {
          const morphProgress = state.reducedMotion ? 1 : Math.min(1, (now - frame.inputAt) / 450);
          d.shape(item.x + 49 + i * 10, item.y + 22, 3.7, 4 + i % 3, morphProgress); context.fillStyle = T.text; context.fill();
        }
        if (focused === 'password' || state.error) {
          context.strokeStyle = state.error ? T.error : T.primary; context.lineWidth = 1;
          context.beginPath(); context.roundRect(item.x, item.y + 5, width, 34, 24); context.stroke();
        }
      } else if (item.id === 'login') {
        d.rect({ x: item.x + 7, y: item.y + 9, w: 28, h: 28 }, passwordLength ? T.secondary : T.variant, 14);
        d.icon(passwordLength ? 'arrow_forward' : 'lock', item.x + 21, item.y + 23, 18, passwordLength ? T.background : T.muted);
      } else if (item.big) {
        d.rect(item, hover === item.id ? T.high : T.surface, 29);
        d.icon(item.icon, item.x + item.w / 2, item.y + item.h / 2, 61, T.accent);
      }
      context.restore();
    }
    if (state.error) d.text(state.error, 600, 531, 11, T.error, 400, 'center', FONTS.body, 300);
    context.restore();
  };
}
