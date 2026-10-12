import * as THREE from 'three';

// Desktop pixels belong here; screen picking continues to use the mesh's UVs.
export function createScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext('2d');

  const background = context.createLinearGradient(0, 0, 1200, 720);
  background.addColorStop(0, '#111a32');
  background.addColorStop(0.55, '#334a72');
  background.addColorStop(1, '#3e587d');
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 720);

  // Broad ribbons give the empty desktop depth without image downloads.
  for (let i = 0; i < 3; i++) {
    const ribbon = context.createLinearGradient(0, 210 + i * 105, 1000, 720);
    ribbon.addColorStop(0, ['#7394b3', '#496b96', '#1f355c'][i]);
    ribbon.addColorStop(1, ['#7499c1', '#435f8d', '#263752'][i]);
    context.fillStyle = ribbon;
    context.beginPath();
    context.moveTo(0, 480 + i * 70);
    context.bezierCurveTo(270, 130 + i * 110, 610, 610 + i * 30, 1200, 210 + i * 155);
    context.lineTo(1200, 720);
    context.lineTo(0, 720);
    context.fill();
  }

  context.fillStyle = '#101624b8';
  context.fillRect(0, 0, 1200, 36);
  context.fillStyle = '#ffffff16';
  context.fillRect(0, 35, 1200, 1);
  context.textBaseline = 'middle';
  context.font = '600 16px "Segoe UI", Arial, sans-serif';
  context.fillStyle = '#e8edf7';
  context.fillText('venxe', 24, 18);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
