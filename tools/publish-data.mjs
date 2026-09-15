import { gzipSync, gunzipSync } from 'node:zlib';
import { sha, cellsForBounds, reviewed } from './common.mjs';

export function selectApproved(current, previous, withdrawn = []) {
  const result = new Map(previous.map(asset => [asset.id, asset]));
  for (const asset of current) if (asset.approved) result.set(asset.id, asset);
  for (const id of withdrawn) result.delete(id);
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function publishAsset(row, libraryBytes, emit, read) {
  const { asset, revision, bounds, bytes, reports } = row;
  const libraryHash = sha(libraryBytes);
  const materialLibrary = { schemaVersion: 1, sha256: libraryHash, url: `/materials/${libraryHash}.json` };
  await emit(materialLibrary.url, libraryBytes);
  // Version the packaging separately from contributor content and review identity.
  const publicationRevision = sha(JSON.stringify([2, asset, revision, reports, libraryHash]));
  const prefix = `/assets/${asset.id}/${publicationRevision}`;
  const result = { ...asset, revision, publicationRevision, bounds, approved: reviewed(asset, revision),
    materialLibrary, metadata: `${prefix}/asset.json`, lods: {} };
  for (const lod of ['low', 'detail']) {
    const raw = bytes[`${lod}.glb`], url = `/models/${asset.id}/${sha(raw)}/${lod}.glb`;
    const compressed = await read(url + '.gz').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return gzipSync(raw, { level: 9 });
    });
    if (!gunzipSync(compressed).equals(raw)) throw Error(`Archived gzip does not match its model: ${url}`);
    await emit(url, raw); await emit(url + '.gz', compressed);
    result.lods[lod] = { url, bytes: raw.length, sha256: sha(raw), triangles: reports[lod].triangles,
      gzip: { url: url + '.gz', bytes: compressed.length, sha256: sha(compressed), encoding: 'gzip-file' } };
  }
  for (const [key, name] of [['source', asset.source], ['spatialSource', asset.spatialSource], ['preview', asset.preview]]) {
    const raw = bytes[name], hash = sha(raw);
    // File identity is independent of model metadata, review and material changes.
    result[key] = { url: `/objects/${hash}/${name}`, bytes: raw.length, sha256: hash };
    await emit(result[key].url, raw);
  }
  result.validation = `${prefix}/validation.json`;
  await emit(result.validation, { revision, structural: 'passed', lods: reports,
    note: 'Structural validation does not approve appearance, rights or footprint alignment.' });
  await emit(result.metadata, result);
  return result;
}

export async function publishCatalogue(channel, members, materialLibrary, emit, read) {
  if (!members.length) return { catalogue: null, pointer: { schemaVersion: 1, channel,
    release: null, count: 0, catalogue: null, status: 'no-release' } };
  const release = `${channel}-${sha(JSON.stringify({ members, materialLibrary })).slice(0, 20)}`;
  const base = `/api/v1/releases/${release}`, cells = new Map();
  for (const asset of members) {
    const { references, assistance, osm, ...entry } = asset;
    for (const cell of cellsForBounds(asset.bounds, 12)) {
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(entry);
    }
  }
  for (const [cell, assets] of cells) await emit(`${base}/index/12/${cell}.json`, { schemaVersion: 1, release, assets });
  const catalogue = { schemaVersion: 1, release, channel, count: members.length,
    status: channel === 'preview' ? 'includes-unreviewed-drafts' : 'approved-only',
    assetBase: '/', materialLibrary,
    bounds: [Math.min(...members.map(a => a.bounds[0])), Math.min(...members.map(a => a.bounds[1])),
      Math.max(...members.map(a => a.bounds[2])), Math.max(...members.map(a => a.bounds[3]))],
    maxHeightM: Math.max(0, ...members.map(a => a.boundsBlenderM[1][2])),
    attribution: 'Open Landmarks; © OpenStreetMap contributors', dataLicense: 'ODbL-1.0',
    index: { zoom: 12, template: `${base}/index/12/{x}/{y}.json`, occupied: [...cells.keys()].sort() },
    assets: `${base}/assets.json`, sourceDatabase: `${base}/spatial-database.json` };
  await emit(`${base}/catalogue.json`, catalogue);
  await emit(catalogue.assets, { schemaVersion: 1, release, assets: members });
  const sources = await Promise.all(members.map(async a => JSON.parse(await read(a.spatialSource.url))));
  await emit(catalogue.sourceDatabase, { license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', assets: sources });
  return { catalogue, pointer: { schemaVersion: 1, channel, release, count: members.length, catalogue: `${base}/catalogue.json` } };
}
