import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const visited = new Set();
async function checkModule(path) {
  if (visited.has(path)) return;
  visited.add(path);
  const source = await readFile(path, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)];
  for (const [, specifier] of imports) {
    let target;
    if (specifier.startsWith('.')) target = resolve(dirname(path), specifier);
    else {
      const key = Object.keys(importMap).find((key) => key === specifier || (key.endsWith('/') && specifier.startsWith(key)));
      assert.ok(key, `Unmapped import: ${specifier} in ${relative(root, path)}`);
      target = resolve(root, importMap[key] + specifier.slice(key.length));
    }
    await checkModule(target);
  }
}
for (const [, path] of html.matchAll(/(?:src|href)="(\.\/[^"#]*)"/g)) {
  assert.ok((await stat(resolve(root, path))).isFile() || path === './', `Missing asset: ${path}`);
}
await checkModule(resolve(root, 'src/boot.js'));
for (const file of await readdir(resolve(root, 'scripts'))) {
  if (!file.endsWith('.mjs')) continue;
  const check = spawnSync(process.execPath, ['--check', resolve(root, 'scripts', file)], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
}
assert.ok(!html.includes('http-equiv="refresh"'), 'The previous redirect must be removed');
assert.ok(!/https?:\/\//.test(JSON.stringify(importMap)), 'Dependencies must be local');
assert.equal(new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])).size, [...html.matchAll(/\bid="([^"]+)"/g)].length, 'Duplicate element IDs');
await stat(resolve(root, '.nojekyll'));
console.log(`PASS: ${visited.size} JavaScript modules parse and all transitive imports resolve locally.`);
console.log('PASS: HTML assets, unique IDs, redirect removal, and GitHub Pages marker.');
