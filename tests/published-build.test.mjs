import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, symlink, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { root } from '../tools/common.mjs';
import { verifyCurrentRelease } from '../tools/release-records.mjs';

test('production builds without submissions, retains global URLs, and rejects missing published objects', async t => {
  const base = pathToFileURL((await mkdtemp(`${tmpdir()}/landmarks-published-`)) + '/');
  t.after(() => rm(base, { recursive: true, force: true }));
  for (const path of ['tools', 'site', 'templates', 'rendering', 'releases', 'LICENSE', 'LICENSES.md',
    'materials.json', 'lighting.json', 'package.json'])
    await cp(new URL(path, root), new URL(path, base), { recursive: true });
  await symlink(new URL('node_modules', root).pathname, new URL('node_modules', base));
  // No collection directory, validator cache or workshop is available.
  const output = execFileSync(process.execPath, ['tools/build.mjs', '--published'], { cwd: base, encoding: 'utf8' });
  assert(output.includes('Built published website'));
  const pointer = JSON.parse(await readFile(new URL('build/api/v1/preview.json', base)));
  assert(pointer.catalogue.startsWith('/api/v1/releases/'));
  assert(!('collection' in pointer));
  await assert.rejects(access(new URL('build/api/v1/collections', base)), { code: 'ENOENT' });
  const catalogue = JSON.parse(await readFile(new URL('build' + pointer.catalogue, base)));
  const assets = JSON.parse(await readFile(new URL('build' + catalogue.assets, base))).assets;
  const path = new URL('releases/static' + assets[0].source.url, base);
  await rm(path);
  await assert.rejects(verifyCurrentRelease(base, { candidate: false }), { code: 'ENOENT' });
});

test('current JSON integrity is checked independently of the historical binary audit', async t => {
  const base = pathToFileURL((await mkdtemp(`${tmpdir()}/landmarks-roots-`)) + '/');
  t.after(() => rm(base, { recursive: true, force: true }));
  await cp(new URL('releases', root), new URL('releases', base), { recursive: true });
  const reference = JSON.parse(await readFile(new URL('releases/current.json', base)));
  const record = JSON.parse(await readFile(new URL(`releases/records/${reference.release}.json`, base)));
  await writeFile(new URL('releases/static' + record.channels.preview.catalogue, base), '{}');
  await assert.rejects(verifyCurrentRelease(base, { candidate: false }), /Published metadata changed/);
});
