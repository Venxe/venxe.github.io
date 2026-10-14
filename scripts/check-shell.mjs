import assert from 'node:assert/strict';
import { createDesktopShell } from '../src/desktop-shell.js';

const shell = createDesktopShell(0);
shell.send('open', 'terminal', 0);
const terminal = shell.state.focus;
shell.send('workspace', 2);
assert.equal(shell.state.focus, null);
shell.send('open', 'wallpapers');
shell.send('workspace', 1);
assert.equal(shell.state.focus, terminal, 'Returning to a workspace restores its window');
shell.send('move', 3);
assert.equal(shell.state.focus, null);
shell.send('workspace', 3);
assert.equal(shell.state.focus, terminal);
shell.send('fullscreen', terminal);
assert.equal(shell.state.windows.find(w => w.id === terminal).fullscreen, true);
shell.send('close', terminal);
assert.equal(shell.state.focus, null);
shell.send('toggle', 'launcher');
shell.send('search', 'term');
assert.deepEqual(shell.state.results.map(app => app.id), ['terminal']);
shell.send('volume', 200, 0);
assert.equal(shell.state.volume, 100);
shell.send('mute', null, 0);
shell.send('mute', null, 0);
assert.equal(shell.state.volume, 100);
shell.send('network', 1, 0);
shell.update(699);
assert.equal(shell.state.network, 0);
shell.update(700);
assert.equal(shell.state.network, 1);
assert.match(shell.state.notifications[0].message, /Coffee Corner/);
shell.send('dnd');
shell.send('wifi', null, 700);
assert.equal(shell.state.toast, null);
shell.send('reset');
assert.equal(shell.state.windows.length, 0);
assert.equal(shell.state.volume, 100);
assert.equal(shell.state.network, 1);
assert.equal(shell.state.wifi, false);
assert.equal(shell.state.workspace, 1);
console.log('PASS: workspace/window lifecycle, launcher search, bounded settings, timed network, DND and session reset.');

const resources = createDesktopShell(0);
const initialResources = resources.state.resources;
assert.ok(initialResources.cpu >= 35, 'A new session starts with a temporary CPU startup load');
resources.update(1000, true);
assert.ok(resources.state.resources.cpu < initialResources.cpu, 'Startup CPU load gradually settles');
const firstSample = resources.state.resources;
const firstRevision = resources.state.revision;
resources.update(1010, true);
assert.equal(resources.state.revision, firstRevision, 'Resource updates must be limited to 20 Hz');
resources.update(120000, false);
assert.deepEqual(resources.state.resources, firstSample, 'Hidden meters do not sample or redraw');
resources.update(120050, true);
assert.ok(resources.state.resources.cpu < 6, 'Startup load expires in real time even while meters are hidden');
assert.ok(Object.isFrozen(resources.state.resources));

const idleResources = createDesktopShell(0);
const busyResources = createDesktopShell(0);
const sameWorkload = createDesktopShell(0);
busyResources.send('open', 'terminal', 0);
sameWorkload.send('open', 'terminal', 0);
for (let at = 50; at <= 60000; at += 50) {
  const previous = busyResources.state.resources;
  idleResources.update(at, true); busyResources.update(at, true); sameWorkload.update(at, true);
  const sample = busyResources.state.resources;
  assert.ok(sample.cpu >= 0 && sample.cpu <= 100 && sample.memory >= 0 && sample.memory <= 16);
  assert.ok(Math.abs(sample.cpu - previous.cpu) < 5, 'CPU transitions remain smooth');
  assert.ok(Math.abs(sample.memory - previous.memory) < 0.01, 'Memory changes gradually');
  assert.deepEqual(sample, sameWorkload.state.resources, 'The same workload and timing are deterministic');
}
assert.ok(busyResources.state.resources.memory > idleResources.state.resources.memory, 'An open application increases memory usage');
assert.ok(idleResources.state.resources.cpu < 6, 'The startup CPU boost settles to a low idle workload');

const wallpaperResources = createDesktopShell(0);
wallpaperResources.send('open', 'wallpapers', 0);
for (let at = 50; at <= 60000; at += 50) wallpaperResources.update(at, true);
assert.ok(wallpaperResources.state.resources.memory > busyResources.state.resources.memory,
  'Resource costs depend on application type, not only the number of windows');

busyResources.send('open', 'terminal', 60000);
for (let at = 60050; at <= 65000; at += 50) { busyResources.update(at, true); sameWorkload.update(at, true); }
assert.deepEqual(busyResources.state.resources, sameWorkload.state.resources,
  'Focusing an existing window must not replay launch load or allocate more memory');
busyResources.send('workspace', 2, 65000);
for (let at = 65050; at <= 70000; at += 50) { busyResources.update(at, true); sameWorkload.update(at, true); }
assert.deepEqual(busyResources.state.resources, sameWorkload.state.resources,
  'Windows on other workspaces keep their background resource costs');
busyResources.send('open', 'terminal', 70000);
for (let at = 70050; at <= 72000; at += 50) { busyResources.update(at, true); sameWorkload.update(at, true); }
assert.ok(busyResources.state.resources.cpu > sameWorkload.state.resources.cpu + 2, 'A new app window adds a temporary launch spike');
assert.ok(busyResources.state.resources.memory > sameWorkload.state.resources.memory, 'Each additional window contributes memory');
for (let at = 72050; at <= 90000; at += 50) busyResources.update(at, true);
const launchSettled = busyResources.state.resources.cpu;
assert.ok(launchSettled < 8, 'Launch CPU spikes decay while persistent app usage remains low');
for (const window of busyResources.state.windows) busyResources.send('close', window.id, 90000);
for (let at = 90050; at <= 120000; at += 50) { busyResources.update(at, true); idleResources.update(at, true); }
assert.ok(Math.abs(busyResources.state.resources.memory - idleResources.state.resources.memory) < 0.001,
  'Closing applications releases their memory and returns to the system baseline');
busyResources.send('reset', null, 120000);
assert.ok(busyResources.state.resources.cpu >= 35, 'A fresh session restarts the startup boost');
assert.equal(busyResources.state.windows.length, 0);
const reducedCpu = createDesktopShell(0);
reducedCpu.send('power', null, 0);
for (let at = 50; at <= 10000; at += 50) reducedCpu.update(at, true);
const normalCpu = createDesktopShell(0);
for (let at = 50; at <= 10000; at += 50) normalCpu.update(at, true);
assert.ok(reducedCpu.state.resources.cpu < normalCpu.state.resources.cpu, 'Power saver lowers CPU workload');
console.log('PASS: startup decay, per-app/background workloads, launch spikes, focus without duplicate load, released memory, deterministic smoothing, power saver and 20 Hz budget.');
