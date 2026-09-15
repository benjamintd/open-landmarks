// Freeze only candidate additions. Historical archives are never rewritten.
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { root, sha } from './common.mjs';
import { recordRelease, prepareRelease, describeBuild, currentPublication } from './release-records.mjs';
const args = process.argv.slice(2);
const candidate = await describeBuild();
const current = await currentPublication();
if (args.length === 1 && args[0] === '--auto' && JSON.stringify(current?.channels) === JSON.stringify(candidate.channels)) {
  console.log('No dataset change to publish.');
} else {
  let release;
  if (args.length === 1 && args[0] === '--auto') release = `publication-${sha(JSON.stringify(candidate.channels)).slice(0, 20)}`;
  else if (args.length === 2 && args[0] === '--release') release = args[1];
  else throw Error('Use npm run snapshot -- --release <name> or --auto.');
  const { record } = await prepareRelease(release);
  for (const [path, expected] of Object.entries(record.files)) {
    const source = new URL('build/' + path, root), target = new URL('releases/static/' + path, root);
    const bytes = await readFile(source);
    if (sha(bytes) !== expected) throw Error(`Candidate changed during snapshot: ${path}`);
    const previous = await readFile(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (previous && !previous.equals(bytes)) throw Error(`Refusing immutable overwrite: ${path}`);
    if (!previous) { await mkdir(new URL('./', target), { recursive: true }); await copyFile(source, target); }
  }
  await recordRelease(release);
  console.log(`Retained ${release}. Commit releases/ together; merging advances the published dataset.`);
}
