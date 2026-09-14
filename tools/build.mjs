import { mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { root, sha, cellsForBounds, reviewed } from './common.mjs';
import { validateAll } from './validate.mjs';
import { renderSite } from './site.mjs';

const rows = await validateAll();
const out = new URL('build/', root);
await rm(out, { recursive: true, force: true });
await cp(new URL('releases/static/', root), out, { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
export async function emit(path, data) {
  const target = new URL(path.replace(/^\//, ''), out);
  await mkdir(new URL('./', target), { recursive: true });
  const raw = Buffer.from(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  const previous = await readFile(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (previous && !previous.equals(raw)) throw Error(`Immutable release collision: ${path}`);
  await writeFile(target, raw);
}
const assets = [];
for (const row of rows) {
  const { asset, revision, bounds, bytes, reports } = row;
  const publicationRevision = sha(JSON.stringify(asset) + revision);
  const prefix = `/assets/${asset.id}/${publicationRevision}`;
  const publicAsset = { ...asset, revision, publicationRevision, bounds, approved: reviewed(asset, revision), metadata: `${prefix}/asset.json`, lods: {} };
  for (const lod of ['low','detail']) {
    const raw = bytes[`${lod}.glb`];
    const url = `/models/${asset.id}/${sha(raw)}/${lod}.glb`;
    // zlib versions can produce different gzip bytes. A frozen representation is canonical.
    const compressed = await readFile(new URL(url.slice(1) + '.gz', out)).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return gzipSync(raw, { level: 9 });
    });
    if (!gunzipSync(compressed).equals(raw)) throw Error(`Archived gzip does not match its model: ${url}`);
    await emit(url, raw); await emit(url + '.gz', compressed);
    publicAsset.lods[lod] = { url, bytes: raw.length, sha256: sha(raw), triangles: reports[lod].triangles,
      gzip: { url: url + '.gz', bytes: compressed.length, sha256: sha(compressed), encoding: 'gzip-file' } };
  }
  for (const [key, name] of [['source',asset.source],['spatialSource',asset.spatialSource],['preview',asset.preview]]) {
    publicAsset[key] = { url: `${prefix}/${name}`, bytes: bytes[name].length, sha256: sha(bytes[name]) };
    await emit(publicAsset[key].url, bytes[name]);
  }
  publicAsset.validation = `${prefix}/validation.json`;
  await emit(publicAsset.validation, { revision, structural: 'passed', lods: reports,
    note: 'Duplicate faces and non-manifold edges are review signals, not certification. This report does not approve appearance, rights or footprint alignment.' });
  await emit(publicAsset.metadata, publicAsset); assets.push(publicAsset);
}

async function collection(channel, members) {
  const release = `${channel}-${sha(JSON.stringify(members)).slice(0, 20)}`;
  const base = `/api/v1/collections/paris/${release}`, cells = new Map();
  for (const a of members) {
    const { references, assistance, osm, ...entry } = a;
    for (const cell of cellsForBounds(a.bounds, 12)) {
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(entry);
    }
  }
  for (const [cell, items] of cells) await emit(`${base}/index/12/${cell}.json`, { schemaVersion: 1, collection: 'paris', release, assets: items });
  const catalogue = { schemaVersion: 1, collection: 'paris', release, channel, count: members.length,
    status: channel === 'preview' ? 'includes-unreviewed-drafts' : 'approved-only',
    assetBase: '/', bounds: [2.224,48.815,2.422,48.903], maxHeightM: Math.max(0,...members.map(a => a.boundsBlenderM[1][2])),
    attribution: 'Open Landmarks; © OpenStreetMap contributors', dataLicense: 'ODbL-1.0',
    index: { zoom: 12, template: `${base}/index/12/{x}/{y}.json`, occupied: [...cells.keys()].sort() },
    assets: `${base}/assets.json`, sourceDatabase: `${base}/spatial-database.json` };
  await emit(`${base}/catalogue.json`, catalogue);
  await emit(`${base}/assets.json`, { schemaVersion: 1, release, assets: members });
  await emit(`${base}/spatial-database.json`, { license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
    assets: rows.filter(r => members.some(a => a.id === r.asset.id)).map(r => JSON.parse(r.bytes[r.asset.spatialSource])) });
  await emit(`/api/v1/collections/paris/${channel === 'approved' ? 'latest' : 'preview'}.json`, {
    schemaVersion: 1, collection: 'paris', channel, release, count: members.length, catalogue: `${base}/catalogue.json` });
  return catalogue;
}
const preview = await collection('preview', assets);
await collection('approved', assets.filter(a => a.approved));
await emit('/api/v1/collections.json', { schemaVersion: 1, collections: [{ id: 'paris', name: 'Paris',
  latest: '/api/v1/collections/paris/latest.json', preview: '/api/v1/collections/paris/preview.json' }] });
await build({ entryPoints: [new URL('site/client.js', root).pathname], bundle: true, splitting: true,
  format: 'esm', target: 'es2022', minify: true, entryNames: 'client', chunkNames: 'chunk-[hash]',
  outdir: new URL('site/', out).pathname, legalComments: 'eof' });
await emit('/site/style.css', await readFile(new URL('site/style.css', root)));
await emit('/site/brand.svg', await readFile(new URL('site/brand.svg', root)));
await emit('/site/fonts/commissioner.woff2', await readFile(new URL('site/fonts/commissioner.woff2', root)));
await emit('/licenses/Commissioner-OFL.txt', await readFile(new URL('site/fonts/OFL.txt', root)));
await emit('/licenses/THREE.txt', await readFile(new URL('../node_modules/three/LICENSE', root)).catch(() => readFile(new URL('node_modules/three/LICENSE', root))));
await emit('/licenses/MIT.txt', await readFile(new URL('LICENSE', root)));
await emit('/licenses/COMPONENTS.md', await readFile(new URL('LICENSES.md', root)));
await renderSite(assets, preview, emit);
console.log(`Built ${assets.length} models, ${assets.filter(a => a.approved).length} approved; ${preview.index.occupied.length} preview XYZ cells. Output: build/`);
