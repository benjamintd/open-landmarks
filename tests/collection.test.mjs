import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { root, json, cellsForBounds, reviewed, sha } from '../tools/common.mjs';
import { validateAll, validateSubmission } from '../tools/validate.mjs';

const rows = await validateAll();
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root, stdio: 'pipe' });
const output = new URL('build/', root);
const get = path => json(new URL(path.replace(/^\//,''), output));

test('XYZ covers both sides of borders; rejects invalid/antimeridian bounds', () => {
  assert.deepEqual(cellsForBounds([-.01,-.01,.01,.01], 1).sort(), ['0/0','0/1','1/0','1/1']);
  assert.throws(() => cellsForBounds([179,0,-179,1]));
  assert.throws(() => cellsForBounds([0,0,1,90]));
});
test('approval binds all required review checks to exact content', () => {
  const { asset, revision } = rows[0], a = structuredClone(asset);
  assert.equal(reviewed(a,revision),false);
  Object.assign(a,{rightsStatus:'approved',geometryStatus:'approved',review:{status:'approved',reviewer:'Test reviewer',revision,checks:{rights:'passed',footprint:'passed',appearance:'passed',mapIntegration:'passed'}}});
  assert.equal(reviewed(a,revision),true);
  assert.equal(reviewed(a,revision+'changed'),false);
  delete a.review.checks.rights; assert.equal(reviewed(a,revision),false);
});
test('validator rejects corrupt hashes, invalid anchor, escaping source path and undersized bounds', async () => {
  for (const [mutate, message] of [
    [a => a.lods.detail.sha256 = 'incorrect', /hash mismatch/],
    [a => a.anchor = [NaN,0], /invalid anchor/],
    [a => a.source = '../private.blend', /standard source filenames/],
    [a => a.boundsBlenderM[1][2] = 1, /exceeds declared bounds/],
  ]) {
    const row = { ...rows[0], asset: structuredClone(rows[0].asset) }; mutate(row.asset);
    await assert.rejects(validateSubmission(row), message);
  }
});
test('source edit changes content revision and invalidates an existing review', async () => {
  const temp = await mkdtemp(join(tmpdir(),'landmark-test-'));
  try {
    const dir = pathToFileURL(join(temp,rows[0].asset.id) + '/');
    await cp(rows[0].dir,dir,{recursive:true});
    const path = new URL('spatial-source.json', dir), source = await json(path);
    source.correctionNote = 'A documented correction'; await writeFile(path,JSON.stringify(source));
    const changed = await validateSubmission({asset:rows[0].asset,dir});
    assert.notEqual(changed.revision,rows[0].revision);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('approved pointer excludes drafts; preview has valid tiles, hashes and compressed bytes', async () => {
  const approved = await get('/api/v1/collections/paris/latest.json');
  const preview = await get('/api/v1/collections/paris/preview.json');
  assert.equal(approved.count,rows.filter(r => reviewed(r.asset,r.revision)).length);
  assert.equal(preview.count,rows.length);
  const c = await get(preview.catalogue), manifest = await get(c.assets), discovered = new Set();
  for (const cell of c.index.occupied) {
    const [x,y] = cell.split('/');
    const tile = await get(c.index.template.replace('{x}',x).replace('{y}',y));
    assert.equal(tile.release,c.release);
    for (const a of tile.assets) { assert(cellsForBounds(a.bounds).includes(cell)); discovered.add(a.id); }
  }
  assert.equal(discovered.size,rows.length);
  for (const a of manifest.assets) {
    for (const entry of Object.values(a.lods)) {
      const raw = await readFile(new URL(entry.url.slice(1),output));
      const gz = await readFile(new URL(entry.gzip.url.slice(1),output));
      assert.equal(raw.length,entry.bytes); assert.equal(sha(raw),entry.sha256);
      assert.equal(gz.length,entry.gzip.bytes); assert.equal(sha(gz),entry.gzip.sha256);
      assert.deepEqual(gunzipSync(gz),raw);
    }
    const source = gunzipSync(await readFile(new URL(a.source.url.slice(1),output)));
    assert.equal(source.subarray(0,7).toString(),'BLENDER');
    const metadata = await get(a.metadata); assert.equal(metadata.revision,a.revision);
  }
});
async function walk(dir) {
  const files = [];
  for (const d of await readdir(dir,{withFileTypes:true})) {
    if (d.isDirectory()) files.push(...await walk(new URL(d.name+'/',dir)));
    else files.push(new URL(d.name,dir));
  }
  return files;
}
test('all local page links resolve; gallery loads no renderer or models eagerly', async () => {
  const files = await walk(output);
  for (const file of files.filter(f => f.pathname.endsWith('.html'))) {
    const html = await readFile(file,'utf8');
    for (const [,path] of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)) {
      const target = new URL(path.slice(1),output); const info = await stat(target);
      if (info.isDirectory()) await stat(new URL('index.html',target));
    }
  }
  const home = await readFile(new URL('index.html',output),'utf8');
  assert(!home.includes('.glb')); assert(!home.includes('modulepreload'));
  const client = await readFile(new URL('site/client.js',output),'utf8');
  assert(client.length < 4000); assert(client.includes('import('));
});
test('public dependency set and deployed artifacts exclude the generation workspace', async () => {
  const pkg = await json(new URL('package.json',root));
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['esbuild','gltf-validator','three']);
  const paths = (await walk(output)).map(f => f.pathname);
  assert(!paths.some(p => /\/(pipeline|recipes|bundles|sdk|runs|node_modules)\//.test(p)));
  assert(!paths.some(p => /\.(py|env|jpg)$/.test(p)));
});
