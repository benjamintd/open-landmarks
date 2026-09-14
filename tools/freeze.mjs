// Preserve immutable URLs across subsequent deployments. Never overwrite different bytes.
import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { root } from './common.mjs';
async function freeze(dir, relative = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = relative + entry.name, source = new URL(entry.name, dir);
    if (entry.isDirectory()) { await freeze(new URL(entry.name + '/', dir), path + '/'); continue; }
    if (!(path.startsWith('models/') || path.startsWith('assets/') || /^api\/v1\/collections\/paris\/(preview|approved)-[a-f0-9]+\//.test(path))) continue;
    const target = new URL('releases/static/' + path, root), bytes = await readFile(source);
    const old = await readFile(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (old && !old.equals(bytes)) throw Error(`Refusing immutable overwrite: ${path}`);
    await mkdir(new URL('./', target), { recursive: true }); await copyFile(source, target);
  }
}
await freeze(new URL('build/', root));
console.log('Immutable release files retained in releases/static/. Commit these with the collection changes.');
