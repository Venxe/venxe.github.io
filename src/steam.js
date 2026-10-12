import * as THREE from 'three';
import { SETTINGS } from './config.js';

export function createSteam(origin) {
  const geometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(SETTINGS.steamCount * 3);
  // A fixed distribution makes reloads consistent without a random allocation per frame.
  for (let i = 0; i < SETTINGS.steamCount; i++) {
    seeds[i * 3] = (i * 0.61803398875) % 1;
    seeds[i * 3 + 1] = (i * 0.754877666) % 1;
    seeds[i * 3 + 2] = (i * 0.569840291 + 0.3) % 1;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SETTINGS.steamCount * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, height: { value: SETTINGS.steamHeight }, pixelScale: { value: 1 }, maxPointSize: { value: 128 } },
    vertexShader: `
      attribute vec3 seed;
      uniform float time;
      uniform float height;
      uniform float pixelScale;
      uniform float maxPointSize;
      varying float opacity;
      varying float phase;
      void main() {
        float life = fract(seed.x + time * (0.09 + seed.y * 0.025));
        float sway = time * 0.4 + seed.z * 6.283;
        vec3 p = position;
        p.x = (seed.y - 0.5) * 0.14 + sin(life * 5.0 + sway) * life * 0.10;
        p.z = (seed.z - 0.5) * 0.12 + cos(life * 4.0 + sway) * life * 0.07;
        p.y = life * height;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = min(maxPointSize, (0.10 + life * 0.35) * pixelScale / max(0.1, -view.z));
        opacity = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.4, 1.0, life)) * 0.07;
        phase = seed.z * 6.283 + life * 3.0;
      }
    `,
    fragmentShader: `
      varying float opacity;
      varying float phase;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float angle = phase;
        uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;
        float radius = length(uv * vec2(1.25, 0.88));
        float soft = 1.0 - smoothstep(0.08, 0.48, radius);
        float wisps = 0.7 + 0.3 * sin(uv.x * 16.0 + sin(uv.y * 12.0 + phase));
        gl_FragColor = vec4(0.76, 0.79, 0.85, soft * wisps * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.position.copy(origin);
  points.frustumCulled = false;
  return {
    points,
    update(elapsed) { material.uniforms.time.value = elapsed; },
    resize(height, pixelRatio, camera, maxPointSize) {
      material.uniforms.pixelScale.value = height * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      material.uniforms.maxPointSize.value = maxPointSize;
    },
  };
}
