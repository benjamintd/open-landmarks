import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { sha } from '../tools/common.mjs';
import { recordRelease, verifyCurrentRelease, verifyRecords, immutablePath, currentPublication } from '../tools/release-records.mjs';

async function fixture(t) {
  const base = pathToFileURL((await mkdtemp(`${tmpdir()}/landmark-release-`)) + '/');
  t.after(() => rm(base, { recursive: true, force: true }));
  const put = async (path, value) => {
    const url = new URL(path, base); await mkdir(new URL('./', url), { recursive: true }); await writeFile(url, value);
  };
  const files = {};
  const add = async (path, bytes) => { files[path] = sha(bytes); await put('build/' + path, bytes); };
  const describe = async release => {
    const channels = { latest: { release: null, catalogue: null }, preview: { release } };
    await put('.cache/publication.json', JSON.stringify({ channels, files }));
    await cp(new URL('build/', base), new URL('releases/static/', base), { recursive: true });
  };
  return { base, put, add, describe, files };
}

test('publication pins candidate bytes; records retain only additions and are idempotent', async t => {
  const { base, put, add, describe } = await fixture(t);
  await add('models/test/ab/low.glb', 'model bytes'); await describe('preview-ab');
  await assert.rejects(verifyCurrentRelease(base), /no matching release/);
  await assert.rejects(recordRelease('../bad', base), /requires --release/);
  await recordRelease('first', base);
  assert.equal(await verifyCurrentRelease(base), 'first');
  const first = await readFile(new URL('releases/records/first.json', base));
  await recordRelease('first', base);
  assert.deepEqual(await readFile(new URL('releases/records/first.json', base)), first);
  await add('models/test/cd/low.glb', 'new model'); await describe('preview-cd');
  await assert.rejects(verifyCurrentRelease(base), /no matching release/);
  await assert.rejects(recordRelease('first', base), /different bytes/);
  const second = await recordRelease('second', base);
  assert.deepEqual(Object.keys(second.files), ['models/test/cd/low.glb']);
  assert.equal(second.parent.sha256, sha(first));
  assert.equal((await currentPublication(base)).release, 'second');
  await verifyRecords(base);
  await put('releases/static/models/test/ab/low.glb', 'changed');
  await assert.rejects(verifyRecords(base), /changed/);
});

test('missing candidate objects never advance current publication', async t => {
  const { base, add, describe } = await fixture(t);
  await add('objects/ab/source.blend.gz', 'source'); await describe('preview-ab');
  await recordRelease('first', base);
  await add('objects/cd/source.blend.gz', 'source v2'); await describe('preview-cd');
  await rm(new URL('releases/static/objects/cd/source.blend.gz', base));
  await assert.rejects(recordRelease('second', base));
  assert.equal((await currentPublication(base)).release, 'first');
});

test('immutable path validation covers global data without accepting traversal', () => {
  assert(immutablePath('materials/' + 'a'.repeat(64) + '.json'));
  assert(immutablePath('api/v1/releases/preview-ab/catalogue.json'));
  assert(!immutablePath('api/v1/collections/paris/preview-ab/catalogue.json'));
  for (const path of ['materials/latest.json', 'api/v1/latest.json', '/objects/x', 'objects/../secret',
    'objects/%2e%2e/secret', 'models/x?query', 'objects//x']) assert(!immutablePath(path), path);
});
