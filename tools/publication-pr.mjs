// Executed only by the trusted scheduled/manual publication workflow.
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
if (!process.env.GITHUB_ACTIONS || !process.env.GH_TOKEN) throw Error('Run this through the publication workflow.');
const changes = run('git', ['status', '--porcelain', '--', 'releases/']);
if (!changes) {
  console.log('No new dataset publication.');
} else {
  const branch = 'automation/dataset-publication';
  // Refuse to overwrite a branch changed since checkout (force-with-lease).
  const remote = run('git', ['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/)[0];
  run('git', ['switch', '-c', branch]);
  run('git', ['add', '--', 'releases/']);
  run('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', 'Publish current landmark revisions']);
  run('git', ['push', `--force-with-lease=refs/heads/${branch}:${remote}`, 'origin', `HEAD:refs/heads/${branch}`]);
  const existing = JSON.parse(run('gh', ['pr', 'list', '--head', branch, '--base', 'main', '--json', 'number']));
  if (!existing.length) {
    const path = join(tmpdir(), 'open-landmarks-publication.md');
    await writeFile(path, 'Publish the current validated landmark revisions as a reproducible global dataset. This batch retains prior URLs, stores only new immutable files, and advances the approved/preview pointers.\n\nValidation: full test suite, publication verification, retained archive audit, and production website build. Merging deploys through the existing Vercel GitHub integration.\n');
    console.log(run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', 'Publish landmark dataset', '--body-file', path]));
  } else console.log(`Updated publication PR #${existing[0].number}.`);
}
