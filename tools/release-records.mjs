import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { root, sha } from './common.mjs';

const namePattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
const hashPattern = /^[a-f0-9]{64}$/;
export const immutablePath = path => typeof path === 'string' && !path.startsWith('/') &&
  !path.split('/').some(part => !part || part === '..' || part === '.') && !/[\\?#%]/.test(path) &&
  (path.startsWith('models/') || path.startsWith('assets/') || path.startsWith('objects/') ||
    /^materials\/[a-f0-9]{64}\.json$/.test(path) ||
    /^api\/v1\/releases\/(preview|approved)-[a-f0-9]+\//.test(path));

export async function releaseFiles(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(new URL(prefix, directory), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await releaseFiles(directory, path + '/'));
    else if (immutablePath(path)) result[path] = sha(await readFile(new URL(path, directory)));
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export async function readRecords(base = root) {
  const directory = new URL('releases/records/', base);
  const names = await readdir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
  return Promise.all(names.filter(name => name.endsWith('.json')).sort().map(async name => {
    const record = JSON.parse(await readFile(new URL(name, directory)));
    if (record.schemaVersion !== 2 || !namePattern.test(record.release) ||
      name !== `${record.release}.json` || !record.channels || !record.files)
      throw Error(`Invalid release record: ${name}`);
    for (const [path, hash] of Object.entries(record.files))
      if (!immutablePath(path) || !hashPattern.test(hash)) throw Error(`Invalid retained path or hash: ${path}`);
    return record;
  }));
}

// Full historical verification is an explicit audit, not a website build step.
export async function verifyRecords(base = root) {
  const records = await readRecords(base), checked = new Map();
  for (const record of records) {
    if (record.parent) await readReference(record.parent, base);
    for (const [path, expected] of Object.entries(record.files)) {
      if (!checked.has(path)) checked.set(path, sha(await readFile(new URL('releases/static/' + path, base))));
      if (checked.get(path) !== expected) throw Error(`Retained release ${record.release} changed: ${path}`);
    }
  }
  const archived = await releaseFiles(new URL('releases/static/', base));
  for (const path of Object.keys(archived)) if (!checked.has(path)) throw Error(`Unrecorded archived file: ${path}`);
  return records;
}

async function readReference(reference, base) {
  if (!namePattern.test(reference?.release) || !hashPattern.test(reference?.sha256)) throw Error('Invalid publication reference');
  const raw = await readFile(new URL(`releases/records/${reference.release}.json`, base));
  if (sha(raw) !== reference.sha256) throw Error(`Publication record changed: ${reference.release}`);
  const record = JSON.parse(raw);
  if (record.release !== reference.release || record.schemaVersion !== 2) throw Error('Invalid publication record');
  return record;
}

export async function currentPublication(base = root) {
  const reference = await readFile(new URL('releases/current.json', base), 'utf8')
    .catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  return reference ? readReference(JSON.parse(reference), base) : null;
}

export async function describeBuild(base = root) {
  // Only candidate files, never an inventory of history copied into build/.
  return JSON.parse(await readFile(new URL('.cache/publication.json', base)));
}

export async function prepareRelease(release, base = root) {
  if (!namePattern.test(release ?? '')) throw Error('Snapshot requires --release <name> (lowercase letters, numbers and hyphens).');
  const { channels, files } = await describeBuild(base);
  const target = new URL(`releases/records/${release}.json`, base);
  const previous = await readFile(target, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (previous) {
    const record = JSON.parse(previous);
    if (JSON.stringify(record.channels) !== JSON.stringify(channels)) throw Error(`Release record ${release} already names different bytes.`);
    for (const [path, expected] of Object.entries(files)) {
      if (!immutablePath(path) || !hashPattern.test(expected)) throw Error(`Invalid retained path: ${path}`);
      const raw = await readFile(new URL('releases/static/' + path, base));
      if (sha(raw) !== expected) throw Error(`Release record ${release} already names different bytes: ${path}`);
    }
    return { record, target, raw: previous };
  }
  const known = new Map();
  for (const record of await readRecords(base)) for (const [path, hash] of Object.entries(record.files)) {
    if (known.has(path) && known.get(path) !== hash) throw Error(`Conflicting retained hash: ${path}`);
    known.set(path, hash);
  }
  const additions = {};
  for (const [path, hash] of Object.entries(files)) {
    if (!immutablePath(path) || !hashPattern.test(hash)) throw Error(`Invalid retained path: ${path}`);
    if (known.has(path) && known.get(path) !== hash) throw Error(`Immutable release collision: ${path}`);
    if (!known.has(path)) additions[path] = hash;
  }
  const parent = await readFile(new URL('releases/current.json', base), 'utf8')
    .then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (parent) await readReference(parent, base);
  const record = { schemaVersion: 2, release, parent, channels, files: additions };
  return { record, target, raw: JSON.stringify(record, null, 2) + '\n' };
}

export async function recordRelease(release, base = root) {
  const prepared = await prepareRelease(release, base);
  const { files } = await describeBuild(base);
  for (const [path, expected] of Object.entries(files))
    if (sha(await readFile(new URL('releases/static/' + path, base))) !== expected)
      throw Error(`Cannot record missing or changed archived bytes: ${path}`);
  await mkdir(new URL('./', prepared.target), { recursive: true });
  await writeFile(prepared.target, prepared.raw);
  await verifyPublishedRecord(prepared.record, base);
  // Advance last. Git commits publish the resulting tree atomically.
  await writeFile(new URL('releases/current.json', base), JSON.stringify({
    release, sha256: sha(prepared.raw),
  }, null, 2) + '\n');
  return prepared.record;
}

async function verifyPublishedRecord(record, base) {
  const hashes = new Map();
  for (const retained of await readRecords(base)) for (const [path, hash] of Object.entries(retained.files)) {
    if (hashes.has(path) && hashes.get(path) !== hash) throw Error(`Conflicting retained hash: ${path}`);
    hashes.set(path, hash);
  }
  const readMetadata = async url => {
    const path = typeof url === 'string' && url.startsWith('/') ? url.slice(1) : '';
    if (!immutablePath(path) || !hashes.has(path)) throw Error(`Unrecorded publication resource: ${url}`);
    const raw = await readFile(new URL('releases/static/' + path, base));
    if (sha(raw) !== hashes.get(path)) throw Error(`Published metadata changed: ${path}`);
    return JSON.parse(raw);
  };
  // Check current metadata and binary availability. Full historical binary
  // hashing is performed by audit:archive, independently of website builds.
  for (const pointer of Object.values(record.channels)) if (pointer.catalogue) {
    const catalogue = await readMetadata(pointer.catalogue);
    if (catalogue.release !== pointer.release || catalogue.count !== pointer.count) throw Error('Publication pointer mismatch');
    const manifest = await readMetadata(catalogue.assets);
    if (manifest.assets.length !== pointer.count || manifest.release !== pointer.release) throw Error('Publication manifest mismatch');
    await readMetadata(catalogue.sourceDatabase);
    if (catalogue.materialLibrary) await readMetadata(catalogue.materialLibrary.url);
    for (const cell of catalogue.index.occupied) {
      const [x, y] = cell.split('/');
      await readMetadata(catalogue.index.template.replace('{x}', x).replace('{y}', y));
    }
    for (const asset of manifest.assets) {
      await readMetadata(asset.metadata); await readMetadata(asset.validation);
      for (const descriptor of [asset.source, asset.spatialSource, asset.preview,
        ...Object.values(asset.lods).flatMap(lod => [lod, lod.gzip])]) {
        const path = descriptor.url.slice(1);
        if (!immutablePath(path) || hashes.get(path) !== descriptor.sha256 ||
          (await stat(new URL('releases/static/' + path, base))).size !== descriptor.bytes)
          throw Error(`Published object missing or changed: ${descriptor.url}`);
      }
    }
  }
}

export async function verifyCurrentRelease(base = root, { candidate = true } = {}) {
  const record = await currentPublication(base);
  if (!record) throw Error('Build has no matching release record. Run npm run snapshot -- --release <name>.');
  if (candidate) {
    const current = await describeBuild(base);
    if (JSON.stringify(record.channels) !== JSON.stringify(current.channels))
      throw Error('Build has no matching release record. Publish the candidate first.');
    for (const [path, hash] of Object.entries(current.files))
      if (!immutablePath(path) || sha(await readFile(new URL('releases/static/' + path, base))) !== hash)
        throw Error(`Published file changed: ${path}`);
  } else {
    await verifyPublishedRecord(record, base);
  }
  return record.release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--audit')) console.log(`Verified ${(await verifyRecords()).length} retained publication records.`);
  else console.log(`Verified release ${await verifyCurrentRelease()}.`);
}
