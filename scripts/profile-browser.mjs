import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Optional developer check. No browser automation dependency or production instrumentation.
const browserPath = process.env.PERF_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const label = process.argv[2] || 'current';
const stress = process.argv.includes('--stress');
assert.match(label, /^[a-z0-9-]+$/i);
const output = resolve('.preview/performance');
await mkdir(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
const server = spawn(process.execPath, ['scripts/serve.mjs', '4187', resolve(process.env.PERF_SITE_ROOT || '.')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const serverReady = new Promise((done, reject) => {
  server.stdout.once('data', done); server.once('error', reject);
  server.once('exit', code => reject(new Error(`Isolated server exited with ${code}; check port 4187`)));
});
const browser = spawn(browserPath, ['--headless=new', '--no-sandbox', '--remote-debugging-port=9237',
  `--user-data-dir=${resolve('.preview/performance-browser')}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  await serverReady;
  let targets;
  for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9237/json/list')).json(); break; }
    catch { if (browser.exitCode !== null) throw new Error('Browser could not start'); await delay(250); }
  }
  assert.ok(targets, 'Browser debugging endpoint unavailable');
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data);
    if (result.id) { pending.get(result.id)?.(result); pending.delete(result.id); }
    if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.text);
    if (result.method === 'Runtime.consoleAPICalled' && result.params.type === 'error') errors.push(result.params.args.map(arg => arg.value || arg.description).join(' '));
    if (result.method === 'Fetch.requestPaused') instrumentMain(result.params).catch(error => errors.push(error.message));
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
  async function instrumentMain(request) {
    const { body, base64Encoded } = await call('Fetch.getResponseBody', { requestId: request.requestId });
    const source = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
    const instrumented = source.replace('const canvas = renderer.domElement;', `
      const canvas = renderer.domElement;
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      perf.gpuRenderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      perf.gpuAvailable = !!ext; perf.gpuMs = []; perf.renderCpuMs = []; perf.info = {};
      let query = null;
      const render = renderer.render.bind(renderer);
      renderer.render = (...args) => {
        if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) perf.gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(query); query = null;
        }
        const measuring = ext && !query;
        if (measuring) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
        const at = performance.now(); render(...args); perf.renderCpuMs.push(performance.now() - at);
        if (measuring) gl.endQuery(ext.TIME_ELAPSED_EXT);
        perf.info = { ...renderer.info.render, memory: { ...renderer.info.memory }, programs: renderer.info.programs.length };
      };
    `);
    assert.notEqual(instrumented, source, 'Main instrumentation anchor must exist');
    await call('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }], body: Buffer.from(instrumented).toString('base64') });
  }
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:4187/src/main.js', requestStage: 'Response' }] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.perf = { renders: 0, draws: 0, uploads: 0, rays: 0, domWrites: 0, intervals: [], longTasks: [], ready: null };
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'texImage2D', 'texSubImage2D', 'clear']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function(...args) {
        if (name.startsWith('draw')) perf.draws++;
        else if (name.startsWith('tex')) perf.uploads++;
        else perf.renders++;
        return original.apply(this, args);
      };
    }
    let last;
    const raf = requestAnimationFrame;
    window.requestAnimationFrame = callback => raf(time => { if (last !== undefined && time !== last) perf.intervals.push(time - last); last = time; callback(time); });
    new PerformanceObserver(list => perf.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true });
    addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => { if (perf.ready === null && document.querySelector('#scene').getAttribute('aria-busy') === 'false') perf.ready = performance.now(); })
        .observe(document.querySelector('#scene'), { attributes: true });
      new MutationObserver(records => { perf.domWrites += records.length; }).observe(document.querySelector('#desktop-controls'), { subtree: true, attributes: true, childList: true, characterData: true });
      import('/vendor/three/build/three.module.min.js').then(THREE => {
        const original = THREE.Raycaster.prototype.intersectObjects;
        THREE.Raycaster.prototype.intersectObjects = function(...args) { perf.rays++; return original.apply(this, args); };
      });
    });
  ` });
  const results = [];
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile-viewport', 390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name !== 'desktop' });
    for (let run = 0; run < 5; run++) {
      await call('Page.navigate', { url: 'http://127.0.0.1:4187/' });
      for (let i = 0; i < 120; i++) { if (await evaluate('document.querySelector("#scene")?.getAttribute("aria-busy") === "false"')) break; await delay(100); }
      assert.equal(await evaluate('document.querySelector("#scene").getAttribute("aria-busy")'), 'false');
      await delay(1500);
      const initial = await evaluate(`({ ready: perf.ready, resources: performance.getEntriesByType('resource').map(e => ({ name: e.name.split('/').pop(), bytes: e.encodedBodySize })), longTasks: perf.longTasks })`);
      async function sample(mode, action) {
        await evaluate('perf.renders = perf.draws = perf.uploads = perf.rays = perf.domWrites = 0; perf.intervals = []; perf.gpuMs = []; perf.renderCpuMs = []');
        if (action) await action(); else await delay(1000);
        return evaluate(`(() => { const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.floor(values.length * p)] ?? null;
          return { mode: '${mode}', renders: perf.renders, draws: perf.draws, uploads: perf.uploads, rays: perf.rays, domWrites: perf.domWrites,
            medianMs: percentile(perf.intervals, .5), p95Ms: percentile(perf.intervals, .95), renderCpuP95Ms: percentile(perf.renderCpuMs, .95),
            gpuP95Ms: percentile(perf.gpuMs, .95), info: perf.info, gpuRenderer: perf.gpuRenderer, gpuAvailable: perf.gpuAvailable }; })()`);
      }
      const free = await sample('free');
      let orbit;
      if (stress) orbit = await sample('orbit', async () => {
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: width / 2, y: height / 2, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 30; i++) {
          await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width / 2 + i * 3, y: height / 2 + i, buttons: 1 }); await delay(33);
        }
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: width / 2 + 90, y: height / 2 + 30, button: 'left', buttons: 0, clickCount: 1 });
      });
      await evaluate('document.querySelector("#scene canvas").focus()');
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await delay(1200);
      const laptop = await sample('laptop');
      if (stress) {
        const lid = await sample('lid-close', async () => { await evaluate('document.querySelector("#laptop-lid-toggle").click()'); await delay(1000); });
        results.push({ viewport: name, run, initial, free, orbit, laptop, lid });
        console.log(JSON.stringify({ viewport: name, run, orbitGpuP95Ms: orbit.gpuP95Ms, lidGpuP95Ms: lid.gpuP95Ms,
          orbitFrameP95Ms: orbit.p95Ms, lidFrameP95Ms: lid.p95Ms }));
        continue;
      }
      for (let i = 0; i < 40; i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width / 2 + i % 10, y: height / 2 });
      const hoverRays = await evaluate('perf.rays');
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: '+', code: 'Equal', windowsVirtualKeyCode: 187 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: '+', code: 'Equal', windowsVirtualKeyCode: 187 });
      await delay(1200);
      assert.equal(await evaluate('document.querySelector("#scene").dataset.viewMode'), 'screen');
      const screen = await sample('screen');
      await evaluate(`document.querySelector('[data-control="dashboard"]').click()`);
      await delay(500);
      const dashboard = await sample('dashboard');
      results.push({ viewport: name, run, initial, free, laptop, hoverRays, screen, dashboard });
      if (run === 0) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(output, `${label}-${name}.png`), Buffer.from(shot.data, 'base64'));
      }
      console.log(JSON.stringify({ viewport: name, run, readyMs: initial.ready, initialBytes: initial.resources.reduce((s,r) => s+r.bytes,0),
        screenRenders: screen.renders, dashboardDomWrites: dashboard.domWrites, hoverRays, freeGpuP95Ms: free.gpuP95Ms }));
    }
  }
  assert.deepEqual(errors, [], 'Uncaught browser exceptions');
  await writeFile(resolve(output, `${label}.json`), JSON.stringify({ browser: await call('Browser.getVersion'), note: 'Headless desktop GPU; mobile viewport is not a physical phone. Cold cache, DPR 1.', results }, null, 2));
} finally {
  socket?.close(); browser.kill(); server.kill();
}
