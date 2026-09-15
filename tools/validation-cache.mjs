import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { root, sha } from './common.mjs';

// The key includes the validator implementation, dependencies, palette and runtime.
// Cache entries are disposable local/CI results, never committed publications.
export async function validatorFingerprint() {
  const paths = ['tools/validate.mjs', 'tools/validation-cache.mjs', 'tools/common.mjs',
    'tools/material-audit.mjs', 'tools/window-audit.mjs', 'tools/mesh-audit.mjs',
    'materials.json', 'package-lock.json'];
  return sha(JSON.stringify([process.version, ...await Promise.all(paths.map(async path =>
    [path, sha(await readFile(new URL(path, root)))]))]));
}

export async function cachedValidation(submission, validate, { directory, fingerprint }) {
  const names = ['low.glb', 'detail.glb', 'source.blend.gz', 'spatial-source.json', 'preview.webp'];
  const bytes = Object.fromEntries(await Promise.all(names.map(async name =>
    [name, await readFile(new URL(name, submission.dir))])));
  const key = sha(JSON.stringify([fingerprint, submission.dir.pathname.split('/').at(-2),
    submission.asset, names.map(name => [name, sha(bytes[name])])]));
  const target = new URL(`${key}.json`, directory);
  let cached;
  try { cached = JSON.parse(await readFile(target, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  if (cached?.key === key && cached.result && cached.checksum === sha(JSON.stringify(cached.result)))
    return { ...submission, ...cached.result, bytes, cacheHit: true };
  const { reports, bounds, revision } = await validate(submission);
  const result = { reports, bounds, revision };
  await mkdir(directory, { recursive: true });
  await writeFile(target, JSON.stringify({ key, checksum: sha(JSON.stringify(result)), result }));
  return { ...submission, ...result, bytes, cacheHit: false };
}
