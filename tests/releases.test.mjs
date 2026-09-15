import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { recordRelease, verifyCurrentRelease, verifyRecords, immutablePath } from '../tools/release-records.mjs';
test('deployment requires a named record with exact retained bytes and channel pointers',async t=>{
  const base=pathToFileURL((await mkdtemp(`${tmpdir()}/landmark-release-`))+'/');
  t.after(()=>rm(base,{recursive:true,force:true}));
  const put=async(path,value)=>{const url=new URL(path,base);await mkdir(new URL('./',url),{recursive:true});await writeFile(url,value);};
  const channels='build/api/v1/collections/paris/';
  for(const channel of ['preview','latest']) await put(channels+channel+'.json',JSON.stringify({release:channel==='preview'?'preview-ab':null}));
  await put('build/models/test/ab/low.glb','model bytes');
  await cp(new URL('build/',base),new URL('releases/static/',base),{recursive:true});
  await assert.rejects(verifyCurrentRelease(base),/no matching release/);
  await assert.rejects(recordRelease('../bad',base),/requires --release/);
  await recordRelease('first',base);
  assert.equal(await verifyCurrentRelease(base),'first');
  const record=await readFile(new URL('releases/records/first.json',base));
  await recordRelease('first',base);
  assert.deepEqual(await readFile(new URL('releases/records/first.json',base)),record);
  await put(channels+'preview.json',JSON.stringify({release:'preview-cd'}));
  await assert.rejects(verifyCurrentRelease(base),/no matching release/);
  await assert.rejects(recordRelease('first',base),/different bytes/);
  await put('releases/static/models/test/ab/low.glb','changed');
  await assert.rejects(verifyRecords(base),/changed/);
});

test('material library URLs are retained as immutable release content',()=>{
  assert(immutablePath('materials/'+ 'a'.repeat(64)+'.json'));
  assert(!immutablePath('materials/latest.json'));
});
