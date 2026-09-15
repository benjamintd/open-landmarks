# Open Landmarks

Lightweight, georeferenced 3D architecture with editable sources and an open spatial catalogue. This repository contains the collection, contribution tools, website and static data API. It has no dependency on a particular map theme, renderer, AI model or model-generation service.

The initial Paris collection contains **forty draft models**. Structural checks pass; visual, map-integration and rights reviews remain pending. The approved channel has no release until those reviews are completed; its pointer returns null release and catalogue fields. This is not an automatic photographs-to-models service.

## Run locally

Node.js 22:

```sh
npm ci
npm test
npm run dev
```

Open http://localhost:5180. `npm run build` validates submissions and writes a complete static site/API to `build/`. No Python, Blender, AI credentials or adjacent repositories are needed to build the website or index.

## Repository layout

- `collection/<id>/`: model metadata, both GLB LODs, compressed editable Blender source, OSM spatial source, preview image.
- `site/`: small site client, stylesheet and optional 3D preview. The preview renderer loads only on request; no map or model is loaded on the gallery page.
- `tools/`: public index/site builder, contribution validator and local server.
- `templates/`: submission template.
- `releases/static/`: retained immutable release files. Keep this history so previously published URLs remain available.
- `docs/API.md`: the renderer-neutral consumer contract.

## Vercel

This directory is the root of `benjamintd/open-landmarks`. Vercel project `benjamin-td/open-landmarks` is connected to GitHub: pushes to `main` automatically deploy to production, and other branches receive previews. The included `vercel.json` uses `npm ci`, `npm run build:release` and output `build/`. No secrets or runtime functions are required. `open-landmarks.benmaps.fr` is the configured custom domain; the site and API use same-origin paths and work on preview domains too.

Prepare a named release before deploying changed collection data:

```sh
npm run snapshot -- --release paris-2026-09-15
npm test
npm run build:release
```

Choose a new name for each changed snapshot. Commit `releases/static/` additions
and `releases/records/<name>.json` together. The record pins both channel pointers
and SHA-256 hashes for every retained immutable file. Repeating an identical
snapshot is safe; reusing its name for different bytes fails.

Ordinary `npm run build` and `npm run dev` never retain snapshots. Vercel and CI
require the built data to match a named record. Website-only changes can reuse
an existing record when their collection data is unchanged. A release record
states intent to publish; GitHub/Vercel deployment history records whether and
where that commit was deployed.

Archives predating release records remain preserved with unknown publication
provenance. The initial `cleanup-2026-09-15` record inventories those retained
bytes without asserting that every historical collection was deployed. Never
remove an old URL based only on whether a current pointer references it.

Verify response MIME, CORS and cache headers against the deployed Vercel preview before directing consumers there. Local serving does not emulate the Vercel edge. Explicit `.glb.gz` URLs serve gzip *files*, not HTTP-encoded GLBs; consumers decompress once. See [Vercel compression](https://vercel.com/docs/how-vercel-cdn-works/compression) and [configuration](https://vercel.com/docs/project-configuration/vercel-json).

For the forty-model collection, source and release assets are small enough to ship as ordinary repository files. At larger scale, move immutable asset storage to object storage while retaining these URLs and the public source-data offer; the API schema can support an absolute asset origin in a future version. Do not silently change the v1 same-origin contract.

## Contributing and licensing

See [CONTRIBUTING.md](CONTRIBUTING.md), [LICENSES.md](LICENSES.md) and the per-model metadata. Original code is MIT; original artistic contributions are scoped CC BY 4.0; OSM-derived spatial data and index are ODbL 1.0. Reference photos retain their own licenses and are not included in this repository.

Modeling tools can remain private. Contributions can be authored manually, procedurally or with AI; the public artifact and its provenance must be reviewable without the original generation service.
