# API reference

Base URL: `https://open-landmarks.benmaps.fr`

No API key required. All resources support GET, HEAD and cross-origin reads. Resolve returned paths against the base URL. The website's `/docs/` reference includes response examples generated from the current collection.

## List collections

`GET /api/v1/collections.json`

Returns available collections and their release endpoints.

**Path parameters:** none.

**200 OK · application/json:** `{schemaVersion, collections}`. Each collection has `id`, `name`, `latest` (approved pointer path) and `preview` (draft-inclusive pointer path).

**Cache:** 60 seconds, revalidate.

## Get a release

`GET /api/v1/collections/{collection}/{channel}.json`

Resolves a channel to its current release. Pin the returned catalogue path for reproducible maps.

**Path parameters:** `collection` is currently `paris`; `channel` is `latest` (approved models) or `preview` (includes drafts).

**200 OK · application/json:** `{schemaVersion, collection, channel, release, count, catalogue}`. The response channel is `approved` for latest.json and `preview` for preview.json. `catalogue` is the pinned catalogue path. A channel with no published models returns 200 with `status: "no-release"`, `release: null`, `catalogue: null` and `count: 0`. There is no catalogue to fetch in that case; consumers must not silently switch to preview. Previously published immutable catalogues remain available at their original URLs.

**Cache:** 60 seconds, revalidate.

## Get a catalogue

`GET /api/v1/collections/{collection}/{release}/catalogue.json`

Returns index information and links to the full collection data.

**Path parameters:** `collection` is the collection ID; `release` is the exact ID from a release pointer.

**200 OK · application/json:** schemaVersion, collection, release, channel, count, status, assetBase, bounds, maxHeightM, attribution, dataLicense, index, assets and sourceDatabase. `bounds` is [west, south, east, north] in WGS84 degrees. `index` contains fixed `zoom` (12), a tile path `template`, and `occupied` cells formatted as `x/y`. `assets` and `sourceDatabase` are resource paths.

**Cache:** one year, immutable.

## Get a tile

`GET /api/v1/collections/{collection}/{release}/index/12/{x}/{y}.json`

Returns metadata for whole models whose ground bounding boxes intersect an XYZ cell.

**Path parameters:** `collection` and `release` as above; `x` and `y` are integer Web Mercator tile coordinates at zoom 12 (0–4095). Use cells listed in `index.occupied`.

**200 OK · application/json:** `{schemaVersion, collection, release, assets}`. Entries include placement, downloads and attribution. Follow each entry's `metadata` path for full provenance (OSM reference, photographs and assistance disclosure).

**404 Not Found:** unoccupied or unknown tile.

**Cache:** one year, immutable.

Request occupied cells intersecting a padded viewport. Border models occur in multiple cells; deduplicate by ID and content revision. Account for height and camera pitch, then cull with actual 3D bounds. This Paris builder rejects antimeridian-spanning footprints; split them before extending coverage.

## Get model metadata

`GET /assets/{id}/{publicationRevision}/asset.json`

Returns placement, downloads, provenance and review information for one model.

**Path parameters:** `id` is the model ID; `publicationRevision` is the metadata revision. Follow the `metadata` path from a tile or full collection response.

**200 OK · application/json:** a model object. Placement fields include anchor, heading, axes, units, bounds, boundsBlenderM, minZoom, detailZoom, replacementFootprint and optional basemapReplacement. `lods.low` and `lods.detail` contain raw GLB url, bytes, sha256, triangles and a gzip descriptor. Source, spatialSource and preview descriptors contain url, bytes and sha256. Attribution, authors, component licenses, references, assistance and review record provide provenance. `metadata` and `validation` are resource paths.

**Cache:** one year, immutable.

Content `revision` hashes submission metadata (excluding review fields) and source/model/preview bytes. `publicationRevision` includes review state; changing approval gets a new metadata URL. Collection releases hash their complete member metadata. `schemaVersion` is independent of all these identities.

## Download a model

`GET /models/{id}/{sha256}/{lod}.glb`

Returns a complete, texture-free glTF binary. Use the URL in lods.low or lods.detail.

**Path parameters:** `id` is the model ID; `sha256` hashes the raw GLB; `lod` is `low` or `detail`.

**200 OK · model/gltf-binary:** raw GLB bytes. Append `.gz` for an explicit gzip file, served as `application/gzip` with no Content-Encoding. The gzip descriptor gives the compressed byte count and hash; decompress once before parsing GLB, using native `DecompressionStream('gzip')` where available. Fall back to the raw GLB otherwise. No Draco, Meshopt or texture decoder is required.

**Cache:** one year, immutable.

## Collection data and sources

These resources support GET and HEAD and cache for one year. Follow paths from the catalogue or asset metadata.

| Path field | 200 response |
| --- | --- |
| catalogue.assets | JSON `{schemaVersion, release, assets}` with complete model metadata |
| catalogue.sourceDatabase | JSON `{license, attribution, assets}` with OSM-derived source records |
| asset.source.url | Gzip-compressed editable Blender source |
| asset.spatialSource.url | JSON per-model OSM spatial source extract |
| asset.preview.url | WebP model preview |
| asset.validation | JSON structural validation report |

## HTTP behavior

Unknown resources return 404. Error bodies have no defined JSON schema. Conditional requests may return 304 Not Modified. JSON uses ordinary negotiated HTTP compression; explicit .gz files require client decompression. V1 has no server-side search or query filters.

Published immutable URLs remain available. `npm run snapshot -- --release <name>` retains them in `releases/static/` and records their hashes in `releases/records/`; builds reject collisions. Deployments require the current channel pointers and retained bytes to match a named record. HTML and entry JS revalidate. No old-release deletion lifecycle is implemented.

## Placement and attribution

`anchor` is WGS84 [longitude, latitude]. GLB vertices use metres, X east / Y up / Z south, with ground at zero and heading baked. Add terrain elevation once. `boundsBlenderM` uses X east / Y north / Z up; convert it before culling. Respect minZoom/detailZoom, retain the old LOD until its replacement loads, cap concurrency/resident geometry and release GPU buffers on eviction.

Preserve material base colors and adapt lighting and emissive intensity to the scene. Suppress overlapping basemap extrusions only after the model loads. Optional basemapReplacement IDs apply only to the named dataset snapshot.

Retain model attribution and source links, including © OpenStreetMap contributors. Component licenses and provenance are recorded per asset. Spatial source access must remain available independently of any consumer application.

### Material library

New catalogue descriptors include `materialLibrary: {schemaVersion, sha256, url}`.
Resolve the immutable URL on the collection origin. It lists approved sRGB colors,
roughness and metalness. Wall windows use light blue `window`; self-supporting
glazing uses `glass`. The source GLBs have passed full-area window support checks
in both LODs. See [the contract](MATERIALS.md).
