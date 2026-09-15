import { spawnSync } from 'node:child_process';
// Git integration previews show proposals; production serves only recorded data.
const args = ['tools/build.mjs'];
if (process.env.VERCEL_ENV !== 'preview') args.push('--published');
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
