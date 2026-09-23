# Open Landmarks

Lightweight, georeferenced 3D landmarks with editable sources and an open spatial
catalogue. There is one global dataset. Landmarks have stable IDs and locations;
Paris is the starting coverage, not a collection identifier or release boundary.

The current seventy models are drafts. Structural validation does not approve rights,
appearance or map integration. The approved channel is unpublished until exact
revisions pass those reviews.

## Develop and contribute

Use Node.js 22:

```sh
npm ci
npm test
npm run dev
```

`npm run build` builds a candidate from current submissions. It uses a disposable,
input-hashed validation cache; `npm run validate:full` bypasses that cache. No
Blender, Python, AI credentials or adjacent repositories are needed for the site.

Contributors edit `collection/<stable-id>/`: metadata, two GLBs, compressed Blender
source, spatial source and preview. This directory name is a storage convention;
submissions have no collection membership. Do not add generated release files to
ordinary contribution PRs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Publish independently of website changes

All data stays in GitHub. Vercel serves the generated static files through its CDN.
Production uses **the recorded publication**, not unpublished working submissions:

```sh
npm run build:release
```

Vercel's Git integration runs `npm run build:vercel`: production uses that recorded
publication, while Preview deployments build the candidate for review. Website
changes can deploy while data contributions wait for the next batch.

The **Prepare dataset publication** GitHub workflow runs daily and on demand. It
validates, freezes only new immutable files, checks the archive, and opens or
refreshes a publication PR. Merging that PR advances the dataset through the
existing Vercel integration. See [deployment setup](docs/DEPLOYMENT.md) for GitHub
permissions and bot-triggered checks.

To prepare the same changes locally:

```sh
npm run snapshot -- --auto
npm run verify:release
npm run audit:archive
npm run build:release
```

An explicit `--release <unique-name>` is also supported. Commit the generated
`releases/` additions and `releases/current.json` together. Identical automatic
snapshots are no-ops; existing names and published paths cannot change bytes.

## Data layout

- `collection/`: current editable submissions, including drafts.
- `releases/static/`: retained immutable published files, including all old URLs.
- `releases/records/`: publication records. Version 2 records contain channel roots,
  a hash-pinned parent, and **only newly introduced files**.
- `releases/current.json`: hash-pinned publication selected for production.
- `publication-policy.json`: explicit withdrawals with a reason.
- `.cache/`: ignored validation results and candidate build inventory.
- `site/`, `tools/`, `templates/`: website, validation/publishing tools and template.

Source, preview and spatial files use their own content hashes under `/objects/`.
GLBs retain their existing content-hashed `/models/` paths. Metadata and reviews
reference these files; a review change does not copy the source or preview.
Approved revisions survive replacement drafts until a new revision is approved
or an explicit withdrawal is published.

## Public API

Start at `/api/v1/latest.json` (approved) or `/api/v1/preview.json` (includes drafts),
then pin the returned `/api/v1/releases/<release>/catalogue.json` path. Discover by
XYZ cells and follow returned download URLs. No collection parameter is required.
Paris-specific routes were removed during the global migration. See [API.md](docs/API.md).

Immutable resources cache for one year. Pointers revalidate after 60 seconds.
Explicit `.glb.gz` and `.blend.gz` URLs are gzip files: decompress once. Verify MIME,
CORS and caching on a Vercel preview when changing routing; local serving does not
emulate the edge.

## Limits of this stage

Static Vercel deployments still copy the retained archive so old URLs work. Current
submissions and historical revisions still live in Git. Full catalogues and spatial
indexes are generated per publication batch. Compact records remove repeated
archive inventories; they do not make unlimited Git history or full exports free.
Normal website builds check current metadata and object availability without
validating models or hashing the historical binaries. The weekly audit verifies
all retained bytes. See [PACKAGING.md](docs/PACKAGING.md) for the storage contract
and future database/export migration.

## Licensing

Original code is MIT; original artistic contributions are scoped CC BY 4.0;
OSM-derived spatial data and index are ODbL 1.0. Reference photos retain their own
licenses and are not included. See [LICENSES.md](LICENSES.md) and per-model metadata.
