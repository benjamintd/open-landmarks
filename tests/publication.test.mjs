import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { root, json, sha } from '../tools/common.mjs';
import { validateSubmission } from '../tools/validate.mjs';
import { cachedValidation } from '../tools/validation-cache.mjs';
import { publishAsset, selectApproved } from '../tools/publish-data.mjs';

const dir = new URL('collection/notre-dame/', root);
const row = await validateSubmission({ dir, asset: await json(new URL('asset.json', dir)) });
const palette = await readFile(new URL('materials.json', root));
const objects = new Map();
const emit = async (path, value) => objects.set(path, value);
const read = async path => {
  if (!objects.has(path)) throw Object.assign(Error('Not found'), { code: 'ENOENT' });
  return objects.get(path);
};

test('review and palette changes reuse sources and previews; source edits change only their own object identity', async () => {
  const original = await publishAsset(row, palette, emit, read);
  const review = { ...row, asset: { ...row.asset, review: { ...row.asset.review, notes: 'New review evidence' } } };
  const changed = await publishAsset(review, palette, emit, read);
  const materialChange = await publishAsset(row, Buffer.concat([palette, Buffer.from('\n')]), emit, read);
  for (const value of [changed, materialChange]) {
    assert.notEqual(value.metadata, original.metadata);
    for (const key of ['source', 'preview', 'spatialSource']) assert.equal(value[key].url, original[key].url);
    assert.equal(value.lods.low.url, original.lods.low.url);
  }
  const sourceChange = await publishAsset({ ...row, revision: sha('new content'), bytes: { ...row.bytes, 'source.blend.gz': Buffer.from('new scene') } }, palette, emit, read);
  assert.notEqual(sourceChange.source.url, original.source.url);
  assert.equal(sourceChange.preview.url, original.preview.url);
});

test('draft replacements and deletions do not silently withdraw approved revisions', () => {
  const old = { id: 'landmark', revision: 'one', approved: true };
  assert.deepEqual(selectApproved([{ ...old, revision: 'two', approved: false }], [old]), [old]);
  assert.deepEqual(selectApproved([], [old]), [old]);
  const next = { ...old, revision: 'two' };
  assert.deepEqual(selectApproved([next], [old]), [next]);
  assert.deepEqual(selectApproved([next], [old], ['landmark']), []);
});

test('validation cache misses on source, metadata and validator changes', async t => {
  const base = pathToFileURL((await mkdtemp(`${tmpdir()}/landmark-cache-`)) + '/');
  t.after(() => rm(base, { recursive: true, force: true }));
  const copy = new URL('notre-dame/', base); await cp(dir, copy, { recursive: true });
  const submission = { dir: copy, asset: row.asset }, directory = new URL('cache/', base);
  let calls = 0;
  const validate = async () => { calls++; return row; };
  const options = { directory, fingerprint: 'validator-one' };
  assert.equal((await cachedValidation(submission, validate, options)).cacheHit, false);
  assert.equal((await cachedValidation(submission, validate, options)).cacheHit, true);
  assert.equal(calls, 1);
  await cachedValidation(submission, validate, { ...options, fingerprint: 'validator-two' });
  await cachedValidation({ ...submission, asset: { ...row.asset, name: 'Changed name' } }, validate, options);
  await writeFile(new URL('preview.webp', copy), 'changed preview');
  await cachedValidation(submission, validate, options);
  assert.equal(calls, 4);
});
