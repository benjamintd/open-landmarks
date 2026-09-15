import { readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH));
const base = event.pull_request?.base.sha || event.before;
if (base && !/^0+$/.test(base)) {
  if (!/^[a-f0-9]{40}$/.test(base)) throw Error('Invalid base commit');
  // The initial global migration intentionally replaces the pre-global archive.
  // After current.json exists in the base, all publications are append-only.
  if (spawnSync('git', ['cat-file', '-e', `${base}:releases/current.json`], { stdio: 'ignore' }).status !== 0) {
    console.log('Initial global publication: no retained global archive in base.');
    process.exit(0);
  }
  const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=MD', base, 'HEAD', '--',
    'releases/static/', 'releases/records/'], { encoding: 'utf8' }).trim();
  if (changed) throw Error(`Published files and records are immutable. Add new paths instead:\n${changed}`);
}
