import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createKeyboard(deckY) {
  const group = new THREE.Group();
  const keyMaterial = new THREE.MeshStandardMaterial({ color: '#202630', roughness: 0.6 });
  const keyboardWidth = 3.26;
  const keyboardDepth = 1.38;
  const keyboardCenterZ = -0.3;
  const well = new THREE.Mesh(new RoundedBoxGeometry(keyboardWidth + 0.06, 0.008, keyboardDepth + 0.02, 2, 0.004),
    new THREE.MeshStandardMaterial({ color: '#11151d', roughness: 0.68 }));
  well.position.set(0, deckY + 0.0035, keyboardCenterZ);
  well.castShadow = true;
  well.receiveShadow = true;
  group.add(well);
  const gap = 0.026;
  const rows = [
    'Esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 Del'.split(' '),
    [...'` 1 2 3 4 5 6 7 8 9 0 - ='.split(' '), ['Backspace', 2]],
    [['Tab', 1.5], ...'Q W E R T Y U I O P [ ]'.split(' '), ['\\', 1.5]],
    [['Caps', 1.75], ...'A S D F G H J K L ;'.split(' '), "'", ['Enter', 2.25]],
    [['Shift', 2.25, 'ShiftLeft'], ...'Z X C V B N M , . /'.split(' '), ['Shift', 2.75, 'ShiftRight']],
    ['fn', ['Ctrl', 1.25], ['Alt', 1.25, 'AltLeft'], ['Cmd', 1.25, 'MetaLeft'], ['', 5.5], ['Cmd', 1.25, 'MetaRight'], ['Alt', 1.25, 'AltRight']],
  ];
  const keyCodes = {
    Esc: 'Escape', Del: 'Delete', '`': 'Backquote', '-': 'Minus', '=': 'Equal',
    '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', Caps: 'CapsLock',
    ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash',
    fn: 'Fn', Ctrl: 'ControlLeft', '': 'Space',
  };
  const layout = [];
  for (const [rowIndex, row] of rows.entries()) {
    const cells = row.map((key) => typeof key === 'string' ? [key, 1] : key);
    // The final row reserves 2.25 units for the inverted-T arrow cluster.
    const units = rowIndex === 5 ? 15 : cells.reduce((sum, [, width]) => sum + width, 0);
    const pitch = keyboardWidth / units;
    const depth = rowIndex === 0 ? 0.125 : 0.195;
    const z = rowIndex === 0 ? -0.905 : -0.68 + (rowIndex - 1) * 0.226;
    let x = -keyboardWidth / 2;
    for (const [label, width, physicalCode] of cells) {
      const code = physicalCode ?? keyCodes[label] ?? (/^[A-Z]$/.test(label) ? `Key${label}` : /^\d$/.test(label) ? `Digit${label}` : label);
      layout.push({ label, code, x: x + width * pitch / 2, z, width: width * pitch - gap, depth });
      x += width * pitch;
    }
    if (rowIndex === 5) {
      const arrowPitch = (keyboardWidth / 2 - x) / 3;
      const arrowDepth = (depth - gap) / 2;
      const offsetZ = (arrowDepth + gap) / 2;
      for (const [label, code, column, offset] of [['←', 'ArrowLeft', 0, offsetZ], ['↓', 'ArrowDown', 1, offsetZ], ['→', 'ArrowRight', 2, offsetZ], ['↑', 'ArrowUp', 1, -offsetZ]]) {
        layout.push({ label, code, x: x + (column + 0.5) * arrowPitch, z: z + offset, width: arrowPitch - gap, depth: arrowDepth });
      }
    }
  }
  const keyWidth = keyboardWidth / 15 - gap;
  const keyDepth = 0.195;
  const keyHeight = 0.028;
  const keyCenterY = deckY + 0.0085 + keyHeight / 2;
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(keyWidth, keyHeight, keyDepth, 1, 0.011), keyMaterial, layout.length);
  keys.name = 'keyboard';
  keys.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const transform = new THREE.Object3D();
  const legendPositions = new Float32Array(layout.length * 12);
  const legendUvs = new Float32Array(layout.length * 8);
  const legendIndices = [];
  const labels = document.createElement('canvas');
  labels.width = Math.round(keyboardWidth * 500);
  labels.height = Math.round(keyboardDepth * 500);
  const labelContext = labels.getContext('2d');
  labelContext.fillStyle = '#aab5c8';
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  for (const [index, key] of layout.entries()) {
    transform.position.set(key.x, keyCenterY, key.z);
    transform.scale.set(key.width / keyWidth, 1, key.depth / keyDepth);
    transform.updateMatrix();
    keys.setMatrixAt(index, transform.matrix);
    // Keep one atlas and one mesh, with a separate movable quad for each key.
    const y = keyboardCenterZ - key.z;
    const corners = [
      [key.x - key.width / 2, y + key.depth / 2],
      [key.x - key.width / 2, y - key.depth / 2],
      [key.x + key.width / 2, y + key.depth / 2],
      [key.x + key.width / 2, y - key.depth / 2],
    ];
    for (const [corner, [x, y]] of corners.entries()) {
      legendPositions.set([x, y, 0], index * 12 + corner * 3);
      legendUvs.set([x / keyboardWidth + 0.5, y / keyboardDepth + 0.5], index * 8 + corner * 2);
    }
    const vertex = index * 4;
    legendIndices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
    if (!key.label) continue;
    const fontSize = key.depth < 0.15 ? 15 : key.label.length === 1 ? 24 : 16;
    labelContext.font = `${fontSize}px "Segoe UI", Arial, sans-serif`;
    labelContext.fillText(key.label,
      (key.x / keyboardWidth + 0.5) * labels.width,
      ((key.z - keyboardCenterZ) / keyboardDepth + 0.5) * labels.height);
  }
  keys.castShadow = true;
  keys.receiveShadow = true;
  group.add(keys);
  const labelTexture = new THREE.CanvasTexture(labels);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const legendGeometry = new THREE.BufferGeometry();
  legendGeometry.setAttribute('position', new THREE.BufferAttribute(legendPositions, 3).setUsage(THREE.DynamicDrawUsage));
  legendGeometry.setAttribute('uv', new THREE.BufferAttribute(legendUvs, 2));
  legendGeometry.setIndex(legendIndices);
  const labelPlane = new THREE.Mesh(legendGeometry, new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false }));
  labelPlane.name = 'keyboard-legends';
  labelPlane.rotation.x = -Math.PI / 2;
  labelPlane.position.set(0, keyCenterY + keyHeight / 2 + 0.0015, keyboardCenterZ);
  group.add(labelPlane);

  const keyTravel = 0.012;
  const pressSeconds = 0.045;
  const releaseSeconds = 0.09;
  const keyStates = new Map(layout.map((key, index) => [key.code, { index, pressed: false, pressing: false, offset: 0 }]));
  const keyboard = {
    group,
    setPressed(code, pressed) {
      const key = keyStates.get(code);
      if (!key || key.pressed === pressed) return;
      key.pressed = pressed;
      if (pressed) key.pressing = true;
    },
    update(delta, reducedMotion) {
      let changed = false;
      for (const state of keyStates.values()) {
        let offset = state.offset;
        if (reducedMotion) {
          offset = state.pressed ? keyTravel : 0;
          state.pressing = false;
        } else if (state.pressing) {
          // Finish the downward stroke even if keyup arrived before a frame.
          offset = Math.min(keyTravel, offset + keyTravel * delta / pressSeconds);
          if (offset === keyTravel) state.pressing = false;
        } else if (!state.pressed) {
          offset = Math.max(0, offset - keyTravel * delta / releaseSeconds);
        }
        if (offset === state.offset) continue;
        state.offset = offset;
        const key = layout[state.index];
        transform.position.set(key.x, keyCenterY - offset, key.z);
        transform.scale.set(key.width / keyWidth, 1, key.depth / keyDepth);
        transform.updateMatrix();
        keys.setMatrixAt(state.index, transform.matrix);
        for (let corner = 0; corner < 4; corner++) legendPositions[state.index * 12 + corner * 3 + 2] = 0 - offset;
        changed = true;
      }
      if (changed) {
        keys.instanceMatrix.needsUpdate = true;
        legendGeometry.attributes.position.needsUpdate = true;
        keys.computeBoundingSphere();
        legendGeometry.computeBoundingSphere();
      }
      return changed;
    },
    reset() {
      for (const key of keyStates.values()) {
        key.pressed = false;
        key.pressing = false;
      }
      return keyboard.update(0, true);
    },
  };

  return keyboard;
}
