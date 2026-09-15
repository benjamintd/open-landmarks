import { mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { build } from 'esbuild';
import { root, sha, json } from './common.mjs';
import { renderSite } from './site.mjs';
import { currentPublication, immutablePath, verifyCurrentRelease } from './release-records.mjs';

const published = process.argv.includes('--published');
const out = new URL('build/', root), activeFiles = {};
await rm(out, { recursive: true, force: true });
// Static Vercel deployments must include the old paths to retain their URLs.
// This copies history; it does not parse or validate historical models.
await cp(new URL('releases/static/', root), out, { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
const read = path => readFile(new URL(path.replace(/^\//, ''), out));
export async function emit(path, data) {
  const relative = path.replace(/^\//, ''), target = new URL(relative, out);
  await mkdir(new URL('./', target), { recursive: true });
  const raw = Buffer.from(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  if (immutablePath(relative)) {
    const previous = await readFile(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (previous && !previous.equals(raw)) throw Error(`Immutable release collision: ${path}`);
    activeFiles[relative] = sha(raw);
  }
  await writeFile(target, raw);
}
const current = await currentPublication();
let assets, preview, channels;
if (published) {
  await verifyCurrentRelease(root, { candidate: false });
  channels = current.channels;
  preview = JSON.parse(await read(channels.preview.catalogue));
  assets = JSON.parse(await read(preview.assets)).assets;
} else {
  // Production website builds never import geometry validators or submissions.
  const { validateAll } = await import('./validate.mjs');
  const { publishAsset, publishCatalogue, selectApproved } = await import('./publish-data.mjs');
  const rows = await validateAll();
  const libraryBytes = await readFile(new URL('materials.json', root));
  const materialLibrary = { schemaVersion: 1, sha256: sha(libraryBytes), url: `/materials/${sha(libraryBytes)}.json` };
  const policy = await json(new URL('publication-policy.json', root));
  if (!Array.isArray(policy.withdrawn) || policy.withdrawn.some(w => !w.id || !w.reason)) throw Error('Withdrawals require an ID and reason');
  const withdrawn = policy.withdrawn.map(w => w.id);
  assets = [];
  for (const row of rows) if (!withdrawn.includes(row.asset.id)) assets.push(await publishAsset(row, libraryBytes, emit, read));
  let previous = [];
  if (current?.channels.latest.catalogue) {
    const descriptor = JSON.parse(await read(current.channels.latest.catalogue));
    previous = JSON.parse(await read(descriptor.assets)).assets;
  }
  const draft = await publishCatalogue('preview', assets, materialLibrary, emit, read);
  if (!draft.catalogue) throw Error('The preview catalogue needs at least one landmark');
  const approved = await publishCatalogue('approved', selectApproved(assets, previous, withdrawn), materialLibrary, emit, read);
  preview = draft.catalogue;
  channels = { latest: approved.pointer, preview: draft.pointer };
  await mkdir(new URL('.cache/', root), { recursive: true });
  await writeFile(new URL('.cache/publication.json', root), JSON.stringify({ channels,
    files: Object.fromEntries(Object.entries(activeFiles).sort(([a], [b]) => a.localeCompare(b))) }));
  console.log(`Validated ${rows.length} landmarks (${rows.filter(row => row.cacheHit).length} cached).`);
}
for (const [channel, pointer] of Object.entries(channels)) {
  await emit(`/api/v1/${channel}.json`, pointer);
}
await build({ entryPoints: [new URL('site/client.js', root).pathname], bundle: true, splitting: true,
  format: 'esm', target: 'es2022', minify: true, entryNames: 'client', chunkNames: 'chunk-[hash]',
  outdir: new URL('site/', out).pathname, legalComments: 'eof' });
for (const path of ['site/style.css', 'site/brand.svg', 'site/fonts/commissioner.woff2']) await emit('/' + path, await readFile(new URL(path, root)));
await emit('/licenses/Commissioner-OFL.txt', await readFile(new URL('site/fonts/OFL.txt', root)));
await emit('/licenses/THREE.txt', await readFile(new URL('node_modules/three/LICENSE', root)));
await emit('/licenses/MIT.txt', await readFile(new URL('LICENSE', root)));
await emit('/licenses/COMPONENTS.md', await readFile(new URL('LICENSES.md', root)));
await renderSite(assets, preview, emit);
console.log(`Built ${published ? 'published' : 'candidate'} website: ${assets.length} landmarks, ${channels.latest.count} approved. Output: build/`);
