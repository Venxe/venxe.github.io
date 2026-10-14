import { THEME as T, FONTS } from './desktop-theme.js';

export function drawing(context) {
  function rect(box, color = T.surface, radius = 16) {
    context.fillStyle = color; context.beginPath(); context.roundRect(box.x, box.y, box.w, box.h, radius); context.fill();
  }
  function text(value, x, y, size = 14, color = T.text, weight = 400, align = 'left', family = FONTS.body, maxWidth) {
    context.font = `${weight} ${size}px "${family}", sans-serif`; context.fillStyle = color; context.textAlign = align;
    context.textBaseline = 'middle';
    if (maxWidth) context.fillText(String(value), x, y, maxWidth); else context.fillText(String(value), x, y);
  }
  function icon(name, x, y, size = 24, color = T.secondary) {
    if (name === 'logo') { logo(x, y, size, color); return; }
    if (document.fonts && !document.fonts.check(`16px "${FONTS.icons}"`)) {
      const fallback = { close: '×', arrow_forward: '→', chevron_left: '‹', chevron_right: '›', power_settings_new: '⏻', restart_alt: '↻', search: '⌕', play_arrow: '▶', pause: 'Ⅱ', lock: '●' };
      text(fallback[name] || '·', x, y, size, color, 400, 'center'); return;
    }
    text(name, x, y, size, color, 400, 'center', FONTS.icons);
  }
  function image(image, box, radius = 0) {
    if (!image?.complete || !image.naturalWidth) return;
    context.save();
    if (radius) { context.beginPath(); context.roundRect(box.x, box.y, box.w, box.h, radius); context.clip(); }
    const ratio = Math.max(box.w / image.naturalWidth, box.h / (image.naturalHeight || image.naturalWidth));
    const w = image.naturalWidth * ratio, h = (image.naturalHeight || image.naturalWidth) * ratio;
    context.drawImage(image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h); context.restore();
  }
  function logo(x, y, size, color = T.secondary) {
    context.save(); context.translate(x, y); context.rotate(-0.27); context.strokeStyle = color;
    context.lineWidth = size * 0.08; context.beginPath(); context.arc(0, 0, size * 0.32, 0.4, Math.PI * 1.8); context.stroke();
    context.beginPath(); context.ellipse(0, 0, size * 0.5, size * 0.1, 0, 0, Math.PI * 2); context.stroke();
    context.restore(); text('✦', x + size * 0.33, y - size * 0.35, size * 0.23, color);
  }
  function shape(x, y, radius, lobes = 6, morph = 0) {
    context.beginPath();
    for (let i = 0; i <= 120; i++) {
      const angle = i * Math.PI * 2 / 120;
      const r = radius * (0.9 + 0.1 * (1 - morph) * Math.cos(lobes * angle));
      const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (!i) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
  }
  function avatar(asset, x, y, w, h, morph = 1) {
    context.save(); context.translate(x + w / 2, y + h / 2); context.scale(w / 2, h / 2);
    // Rounded hexagonal silhouette of Locklike's Material avatar.
    const rounding = 0.18 + (1 - morph) * 0.2;
    const straight = 1 - rounding;
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3;
      const vx = Math.cos(a), vy = Math.sin(a);
      const nx = Math.cos(b), ny = Math.sin(b);
      if (!i) context.moveTo(vx * straight + nx * rounding, vy * straight + ny * rounding);
      context.lineTo(vx * rounding + nx * straight, vy * rounding + ny * straight);
      const c = (i + 2) * Math.PI / 3;
      context.quadraticCurveTo(nx, ny, nx * straight + Math.cos(c) * rounding, ny * straight + Math.sin(c) * rounding);
    }
    context.closePath(); context.clip(); context.fillStyle = T.primary; context.fillRect(-1, -1, 2, 2);
    image(asset, { x: -1, y: -1, w: 2, h: 2 }); context.restore();
  }
  function ring(x, y, radius, value, color = T.accent) {
    context.lineWidth = 6; context.strokeStyle = T.variant; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = color; context.beginPath(); context.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * value); context.stroke();
  }
  return { rect, text, icon, image, logo, shape, avatar, ring };
}
