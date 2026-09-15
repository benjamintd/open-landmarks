# Deployment and publication

Vercel project `benjamin-td/open-landmarks` is connected to
`benjamintd/open-landmarks`. This public repository is the project root.
Production domain: https://open-landmarks.benmaps.fr.

## Builds

`vercel.json` runs `npm ci`, then `npm run build:vercel`, and serves `build/`.

- Production: `node tools/build.mjs --published` reads `releases/current.json` and
  its immutable catalogue. Merged submissions do not automatically become data
  publications. Site-only changes reuse the recorded data without model validation.
- Preview: the builder validates current submissions, builds a candidate catalogue
  and makes a visual review site. It never retains or promotes the candidate.
- Local development: `npm run build` / `npm run dev` also use candidate data.

Both modes copy `releases/static/` so retained URLs resolve on each deployment.
There is no database, object bucket, runtime write API or deployment storage secret.

## Automated publication

The `Prepare dataset publication` workflow runs daily at 06:00 UTC and supports
manual dispatch from Actions. It checks out `main`, runs tests, prepares a
content-named snapshot, verifies all retained bytes, builds production output and
opens/refreshes `automation/dataset-publication` as a PR. Review its channel counts
and generated files; merging publishes through the existing Vercel integration.
No new PR is created when the candidate matches the recorded publication.

GitHub setup:

1. Enable Actions and **Allow GitHub Actions to create and approve pull requests**
   in repository Actions settings. The workflow requests contents and PR write
   permissions; it creates PRs, never approves them.
2. If branch rules require checks triggered on the bot's PR, configure the optional
   `PUBLICATION_TOKEN` secret with a GitHub App token or fine-grained token scoped
   to this repository (contents and pull requests write). Events created with the
   default `GITHUB_TOKEN` do not trigger ordinary Actions workflows. Without this
   secret, the publication workflow itself still runs the complete checks, but a
   maintainer must arrange required PR checks before merging.
3. Keep the main branch and publication workflow review-protected. Publication
   runs only trusted main code; it never runs on `pull_request_target` or imports
   uploaded workflow artifacts from untrusted forks.

References: [GitHub workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Integrity and failures

CI rejects edits/deletions of already committed immutable files and records. It
validates the candidate and separately builds the published data. Only successful
main runs save the validation cache; PRs restore it but cannot populate main's
cache. Keys include input bytes, metadata, validation code, palette, lockfile and
Node version. Global validator changes invalidate every affected entry.

The weekly `Audit retained data` workflow bypasses validation caches and verifies
all historical file hashes and parent records. Normal website builds verify
current JSON hashes and object sizes/availability; the full audit detects binary
corruption, including same-sized corruption.

A failed freeze does not advance `releases/current.json`. The publisher advances
it only after every candidate file and the new record are retained. Vercel deploys
a complete Git tree. Old immutable URLs remain available after pointer changes.
The fixed publication branch uses force-with-lease to avoid overwriting concurrent
branch changes. Refresh a stale publication PR before merging; snapshotting a
batch and accepting later submissions are separate operations.

## Local publication

```sh
npm run snapshot -- --auto
npm run verify:release
npm run audit:archive
npm run build:release
```

For a deliberate name use `npm run snapshot -- --release <unique-name>` instead.
Commit `releases/current.json`, new records and new static files together. Retained
global records and their files must never be rewritten or removed.

Check response MIME, CORS, 404s and caching against the deployed preview when
changing headers. JSON can use negotiated compression; explicit gzip files must
not gain a second `Content-Encoding: gzip` layer.
