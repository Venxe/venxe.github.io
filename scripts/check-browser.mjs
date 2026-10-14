import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real browser input, shaders and screenshots. The credential remains a wrong test value.
const label = process.argv[2] || 'current';
assert.match(label, /^[a-z0-9-]+$/i);
const output = resolve('.preview', `browser-check-${label}`);
await mkdir(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
const server = spawn(process.execPath, ['scripts/serve.mjs', '4188', resolve(process.env.PERF_SITE_ROOT || '.')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const serverReady = new Promise((done, reject) => {
  server.stdout.once('data', done); server.once('error', reject);
  server.once('exit', code => reject(new Error(`Isolated server exited with ${code}; check port 4188`)));
});
const browser = spawn(process.env.PERF_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--no-sandbox', '--remote-debugging-port=9238', `--user-data-dir=${resolve('.preview/browser-check-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  await serverReady;
  let targets;
  for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9238/json/list')).json(); break; }
    catch { if (browser.exitCode !== null) throw new Error('Browser could not start'); await delay(250); }
  }
  assert.ok(targets, 'Browser debugging endpoint unavailable');
  assert.equal(server.exitCode, null, 'The isolated test server must start');
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
  });
  async function call(method, params = {}) {
    const requestId = ++id;
    const response = new Promise(done => pending.set(requestId, done));
    socket.send(JSON.stringify({ id: requestId, method, params }));
    const result = await response;
    if (result.error) throw new Error(`${method}: ${result.error.message}`);
    return result.result;
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression) {
    for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function navigate() {
    await call('Page.navigate', { url: 'http://127.0.0.1:4188/' });
    await wait('document.querySelector("#scene")?.getAttribute("aria-busy") === "false"');
    await evaluate('document.fonts.ready'); await delay(200);
  }
  async function key(key, code, virtualKey) {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  const visible = id => `(() => { const e = document.querySelector('[data-control="${id}"]'); return !!e && !e.hidden && !document.querySelector('#desktop-controls').hidden; })()`;
  async function click(id) { await wait(visible(id)); await evaluate(`document.querySelector('[data-control="${id}"]').click()`); }
  async function screenshot(name) {
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
  }
  await call('Page.enable'); await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'Date.now = () => 1791981000000 + Math.floor(performance.now());' });
  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844], ['landscape', 844, 390], ['small-phone', 320, 568]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name !== 'desktop' });
    for (const motion of ['reduce', 'no-preference']) {
      const prefix = `${name}-${motion}`;
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
      await navigate();
      await evaluate('document.querySelector("#scene canvas").focus()'); await key('Enter', 'Enter', 13); await delay(900);
      await screenshot(`${prefix}-laptop`);
      await key('+', 'Equal', 187); await delay(900);
      assert.equal(await evaluate('document.querySelector("#scene").dataset.viewMode'), 'screen');
      await click('dashboard'); await delay(600); await screenshot(`${prefix}-dashboard`);
      await key('Escape', 'Escape', 27); await click('launcher'); await click('app-wallpapers'); await delay(500);
      await click('wallpaper-1'); await delay(800); await screenshot(`${prefix}-wallpaper`);
      await key('Escape', 'Escape', 27); await key('Escape', 'Escape', 27);
      await evaluate('document.querySelector("#laptop-lid-toggle").click()'); await delay(1200);
      assert.equal(await evaluate('document.querySelector("#desktop-controls").hidden'), true);
      assert.equal(await evaluate('document.querySelector("#camera-cover-toggle").disabled'), true);
      await evaluate('document.querySelector("#laptop-lid-toggle").click()'); await delay(1300);
      assert.equal(await evaluate('document.querySelector("#camera-cover-toggle").disabled'), false);
      await navigate();
      await evaluate('document.querySelector("#scene canvas").focus()'); await key('Enter', 'Enter', 13); await delay(900);
      await key('+', 'Equal', 187); await delay(900); await click('session'); await click('logout');
      await wait(visible('unlock')); await screenshot(`${prefix}-welcome`);
      await click('unlock'); await delay(500); await screenshot(`${prefix}-login`);
      await evaluate(`(() => { const e = document.querySelector('[data-control="password"]'); e.value = 'invalid-credential-fixture'; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); })()`);
      await key('Enter', 'Enter', 13);
      await wait('document.querySelector("[data-control=password]").getAttribute("aria-invalid") === "true"');
      assert.equal(await evaluate('document.querySelector("[data-control=password]").value'), '');
      await delay(500); await screenshot(`${prefix}-error`);
      await click('shutdown'); await delay(1700);
      await wait('!document.querySelector("#laptop-power").disabled');
      await evaluate('document.querySelector("#laptop-power").click()');
      await wait(visible('boot-normal')); await screenshot(`${prefix}-boot-menu`);
      await click('boot-normal'); await wait(visible('unlock'));
      await screenshot(`${prefix}-boot-login`);
      assert.deepEqual(errors, [], 'Uncaught browser errors');
      console.log(`PASS: ${prefix}: native controls, wallpapers, lid gating, login error, power and complete boot.`);
    }
  }
} finally { socket?.close(); browser.kill(); server.kill(); }
