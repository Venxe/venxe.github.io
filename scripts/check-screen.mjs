import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { createElement, createDesktopControls, TestImage } from './test-dom.mjs';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'three' ? new URL('../vendor/three/build/three.module.min.js', import.meta.url).href : specifier, context);
} });
globalThis.document = { hidden: false, createElement };
globalThis.Image = TestImage;
const start = new Date(2026, 9, 13, 13, 45).getTime();
Date.now = () => start;
const { createScreen } = await import('../src/screen.js');

function setup() {
  const desktop = createScreen();
  const root = createDesktopControls();
  root.hidden = false;
  const events = new AbortController();
  const messages = [];
  desktop.bindControls(root, (message) => messages.push(message), events.signal);
  const surface = desktop.texture.image;
  let now = start;
  const update = (time = now) => { now = time; desktop.update(time); };
  update();
  const control = (id) => root.querySelector(`[data-control="${id}"]`);
  const uv = (x, y) => ({ x: x / surface.width, y: 1 - y / surface.height });
  function point(id) {
    if (id === 'volume') { const arc = surface.arcs.at(-1); return uv(arc.x, arc.y); }
    const iconName = { settings: 'battery-level-80', mute: 'audio-volume-', previous: 'pan-start', next: 'pan-end', networks: 'pan-end' }[id];
    if (iconName) {
      const images = surface.images.filter((image) => image.src.includes(iconName));
      for (const image of images) {
        const value = uv(image.x + image.w / 2, image.y + image.h / 2);
        if (desktop.hitTest(value) === id) return value;
      }
    }
    for (const label of surface.labels.filter((label) => label.text === control(id).textContent)) {
      const value = uv(label.x + 1, label.y);
      if (desktop.hitTest(value) === id) return value;
    }
    assert.fail(`Control ${id} must be visibly reachable`);
  }
  function click(id) {
    const value = point(id);
    assert.equal(desktop.handleInput({ type: 'pointerdown' }, value), true);
    assert.equal(desktop.handleInput({ type: 'pointerup' }, value), true);
    update();
  }
  return { desktop, root, surface, messages, control, uv, point, click, update,
    dispose() { events.abort(); desktop.dispose(); desktop.texture.dispose(); } };
}

const test = setup();
assert.equal(test.control('clock').textContent, '13 Oct. 13:45');
assert.equal(test.surface.labels.find((label) => label.text === '13 Oct. 13:45').x, 600, 'The clock must be centered independently of side content');
const status = test.surface.images.slice(0, 3).map((image) => image.src.split('/').at(-1));
assert.deepEqual(status, ['network-wireless-signal-excellent.svg', 'audio-volume-medium.svg', 'battery-level-80.svg']);
for (const image of test.surface.images) {
  const asset = new URL(image.src);
  assert.ok((await stat(asset)).isFile(), 'Every rendered icon must be a local asset');
  assert.match(await readFile(asset, 'utf8'), /viewBox="0 0 16 16"/);
}
assert.ok(test.surface.images.slice(0, 3).every((image) => image.w === 16 && image.h === 16), 'Status icons must stay at 16 desktop pixels');
assert.equal(test.desktop.hitTest(test.uv(600, 35)), 'clock');
assert.equal(test.desktop.hitTest(test.uv(600, 37)), null, 'Clock hit regions must retain their fixed desktop height');
const resizedIdle = test.desktop.texture.version;
test.update(start + 15000);
assert.equal(test.desktop.texture.version, resizedIdle);
test.update(start + 60000);
assert.equal(test.control('clock').textContent, '13 Oct. 13:46');
test.update(new Date(2026, 9, 14, 0, 0).getTime());
assert.equal(test.control('clock').textContent, '14 Oct. 00:00');
test.update(start);

test.click('clock');
assert.equal(test.control('clock').getAttribute('aria-expanded'), 'true');
assert.equal(test.control('month').textContent, 'October 2026');
test.click('next');
assert.equal(test.control('month').textContent, 'November 2026');
test.click('previous');
test.click('today');
assert.match(test.control('date-heading').textContent, /13 October 2026/);
const today = test.root.querySelectorAll('[data-control]').find((element) => element.getAttribute('aria-current') === 'date');
today.focus();
today.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowLeft' }));
test.update();
assert.match(test.control('date-heading').textContent, /12 October 2026/);
assert.equal(test.desktop.closePanel(), true);
assert.equal(document.activeElement, test.control('clock'), 'Dismissal must restore keyboard focus to the trigger');
assert.equal(test.desktop.closePanel(), false);
test.update(new Date(2028, 1, 29, 12, 0).getTime());
test.click('clock');
assert.match(test.control('date-heading').textContent, /29 February 2028/);
test.click('next');
assert.equal(test.control('month').textContent, 'March 2028');
test.update(new Date(2026, 11, 31, 23, 59).getTime());
test.click('today');
test.click('next');
assert.equal(test.control('month').textContent, 'January 2027');

test.click('settings');
assert.equal(test.control('clock').getAttribute('aria-expanded'), 'false', 'Only one panel may be open');
assert.equal(test.control('settings').getAttribute('aria-expanded'), 'true');
assert.equal(test.control('volume').value, '50');
assert.equal(test.control('battery').textContent, '82% · Discharging');
test.click('mute');
assert.equal(test.control('volume').value, '0');
test.click('mute');
assert.equal(test.control('volume').value, '50');
test.control('volume').value = '25';
test.control('volume').dispatchEvent(new Event('input'));
test.update();
assert.match(test.surface.images[1].src, /audio-volume-low/);
test.click('mute');
test.click('mute');
assert.equal(test.control('volume').value, '25');
const slider = test.point('volume');
test.desktop.handleInput({ type: 'pointerdown' }, slider);
test.desktop.handleInput({ type: 'pointermove' }, test.uv(1199, (1 - slider.y) * 790));
test.desktop.handleInput({ type: 'pointerup' }, slider);
test.update();
assert.equal(test.control('volume').value, '100', 'Slider drags must clamp to the maximum');
test.desktop.handleInput({ type: 'pointerdown' }, test.point('volume'));
test.desktop.handleInput({ type: 'pointermove' }, test.uv(1, 130));
test.desktop.handleInput({ type: 'pointerup' }, test.uv(1, 130));
test.update();
assert.equal(test.control('volume').value, '0');
test.control('volume').value = 'invalid';
test.control('volume').dispatchEvent(new Event('input'));
test.update();
assert.equal(test.control('volume').value, '0', 'Invalid input must not corrupt the volume state');

test.update(start);
test.click('networks');
test.click('network-1');
test.update(start + 699);
assert.equal(test.control('wifi').textContent, 'Connecting…');
test.update(start + 700);
assert.equal(test.control('wifi').textContent, 'Coffee Corner');
test.click('network-0');
test.update(start + 1000);
test.click('network-1');
test.update(start + 1400);
assert.equal(test.control('wifi').textContent, 'Connecting…', 'An earlier connection must not complete a later request');
test.click('wifi');
test.update(start + 2000);
assert.equal(test.control('wifi').textContent, 'Wi-Fi Off');
assert.equal(test.control('networks').disabled, true);
test.click('wifi');
test.update(start + 2700);
assert.equal(test.control('wifi').textContent, 'Coffee Corner', 'Re-enabling Wi-Fi must remember the last selected network');
test.click('power');
assert.equal(test.control('power').getAttribute('aria-pressed'), 'true');
test.click('settings');
test.click('settings');
assert.equal(test.control('power').textContent, 'Power Saver');
assert.equal(test.control('volume').value, '0');
test.desktop.handleInput({ type: 'pointerdown' }, null);
test.desktop.handleInput({ type: 'pointerup' }, null);
test.update();
assert.equal(test.control('settings').getAttribute('aria-expanded'), 'false');

test.update(start);
test.click('clock');
const beforeCancel = test.control('month').textContent;
test.desktop.handleInput({ type: 'pointerdown' }, test.point('next'));
test.desktop.handleInput({ type: 'pointercancel' }, null);
test.desktop.handleInput({ type: 'pointerup' }, test.point('next'));
test.update();
assert.equal(test.control('month').textContent, beforeCancel);
test.root.hidden = true;
test.control('next').click();
assert.equal(test.control('month').textContent, beforeCancel, 'Hidden desktop controls must ignore input');
const damagedIcon = TestImage.instances.find((image) => image.src.includes('battery-level-80'));
damagedIcon.complete = false;
damagedIcon.naturalWidth = 0;
test.update(start + 60000);
assert.ok(!test.surface.images.some((image) => image.src === damagedIcon.src), 'Loading icons must not be painted');
assert.ok(!test.surface.labels.some((label) => label.text === 'Settings'), 'Loading status assets must not be treated as failures');
const beforeLoad = test.desktop.texture.version;
damagedIcon.complete = true;
damagedIcon.naturalWidth = 16;
damagedIcon.dispatchEvent(new Event('load'));
test.update();
assert.ok(test.desktop.texture.version > beforeLoad, 'An icon load must redraw the desktop without a clock change');
assert.ok(test.surface.images.some((image) => image.src === damagedIcon.src), 'Loaded icons must be painted');
damagedIcon.naturalWidth = 0;
damagedIcon.dispatchEvent(new Event('error'));
test.update();
assert.ok(test.surface.labels.some((label) => label.text === 'Settings'), 'Failed status assets must leave a visible settings control');
damagedIcon.naturalWidth = 16;
damagedIcon.dispatchEvent(new Event('load'));
test.update();
assert.ok(!test.surface.labels.some((label) => label.text === 'Settings'), 'Recovered status assets must replace the fallback');
assert.ok(test.surface.images.some((image) => image.src === damagedIcon.src), 'Recovered icons must be painted');
const beforeDispose = test.desktop.texture.version;
test.dispose();
test.desktop.update(start + 60000);
test.control('clock').click();
assert.equal(test.desktop.texture.version, beforeDispose);
console.log('PASS: centered live local clock, icon order/assets/loading/failure/recovery, idle uploads, calendar dates/months/leap year, keyboard focus, volume/mute/clamping, Wi-Fi selection/cancellation, power mode, hidden controls, and disposal.');
console.log('NOT CHECKED: GPU pixels, native browser input behavior, screen-reader output, or FPS.');
