// Preserve immutable URLs across subsequent deployments. Never overwrite different bytes.
import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { root } from './common.mjs';
import { recordRelease, prepareRelease, immutablePath, verifyRecords } from './release-records.mjs';
const args=process.argv.slice(2);
if (args.length!==2 || args[0]!=='--release' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(args[1]))
  throw Error('Use npm run snapshot -- --release <name> to retain a named release.');
await verifyRecords();
await prepareRelease(args[1]);
async function freeze(dir, relative = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = relative + entry.name, source = new URL(entry.name, dir);
    if (entry.isDirectory()) { await freeze(new URL(entry.name + '/', dir), path + '/'); continue; }
    if (!immutablePath(path)) continue;
    const target = new URL('releases/static/' + path, root), bytes = await readFile(source);
    const old = await readFile(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (old && !old.equals(bytes)) throw Error(`Refusing immutable overwrite: ${path}`);
    await mkdir(new URL('./', target), { recursive: true }); await copyFile(source, target);
  }
}
await freeze(new URL('build/', root));
await recordRelease(args[1]);
console.log(`Retained release ${args[1]}. Commit releases/static/ and releases/records/ before deploying.`);
