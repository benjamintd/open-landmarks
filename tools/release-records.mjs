import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { root, sha } from './common.mjs';

export const immutablePath = path => path.startsWith('models/') || path.startsWith('assets/') ||
  /^api\/v1\/collections\/paris\/(preview|approved)-[a-f0-9]+\//.test(path);
export async function releaseFiles(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(new URL(prefix,directory),{withFileTypes:true})) {
    const path = prefix+entry.name;
    if (entry.isDirectory()) Object.assign(result,await releaseFiles(directory,path+'/'));
    else if (immutablePath(path)) result[path]=sha(await readFile(new URL(path,directory)));
  }
  return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
}
export async function describeBuild(base = root) {
  const output = new URL('build/',base), channels = {};
  for (const name of ['latest','preview'])
    channels[name]=JSON.parse(await readFile(new URL(`api/v1/collections/paris/${name}.json`,output)));
  return { channels, files: await releaseFiles(output) };
}
async function records(base) {
  const directory=new URL('releases/records/',base);
  const names=await readdir(directory).catch(error=>{if(error.code!=='ENOENT')throw error;return [];});
  return Promise.all(names.filter(name=>name.endsWith('.json')).sort().map(async name=>
    JSON.parse(await readFile(new URL(name,directory)))));
}
export async function verifyRecords(base = root) {
  const result=await records(base), checked=new Map();
  for (const record of result) {
    if (record.schemaVersion!==1 || !record.release || !record.channels || !record.files)
      throw Error('Invalid release record.');
    for (const [path,expected] of Object.entries(record.files)) {
      if (!immutablePath(path) || path.split('/').includes('..') || path.includes('\\') || path.includes('?') || path.includes('#'))
        throw Error(`Invalid retained path: ${path}`);
      if (!checked.has(path)) checked.set(path,sha(await readFile(new URL('releases/static/'+path,base))));
      if (checked.get(path)!==expected) throw Error(`Retained release ${record.release} changed: ${path}`);
    }
  }
  return result;
}
export async function prepareRelease(release, base = root) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(release ?? ''))
    throw Error('Snapshot requires --release <name> (lowercase letters, numbers and hyphens).');
  const description=await describeBuild(base);
  const record={schemaVersion:1,release,...description};
  const target=new URL(`releases/records/${release}.json`,base);
  const raw=JSON.stringify(record,null,2)+'\n';
  const previous=await readFile(target,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;});
  if (previous && previous!==raw) throw Error(`Release record ${release} already names different bytes.`);
  return {record,target,raw};
}
export async function recordRelease(release, base = root) {
  const {record,target,raw}=await prepareRelease(release,base);
  // Validate archived bytes before writing a record that claims to retain them.
  for (const [path,expected] of Object.entries(record.files))
    if (sha(await readFile(new URL('releases/static/'+path,base)))!==expected)
      throw Error(`Cannot record missing or changed archived bytes: ${path}`);
  await mkdir(new URL('./',target),{recursive:true});
  await writeFile(target,raw);
  await verifyRecords(base);
  return record;
}
export async function verifyCurrentRelease(base = root) {
  const retained=await verifyRecords(base), current=await describeBuild(base);
  const match=retained.find(record=>JSON.stringify(record.channels)===JSON.stringify(current.channels) &&
    JSON.stringify(record.files)===JSON.stringify(current.files));
  if (!match) throw Error('Build has no matching release record. Run npm run snapshot -- --release <name> and commit it before deploying.');
  return match.release;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  console.log(`Verified release ${await verifyCurrentRelease()}.`);
