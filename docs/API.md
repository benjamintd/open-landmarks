# API reference

Base URL: `https://open-landmarks.benmaps.fr`

No API key required. All resources support GET, HEAD and cross-origin reads. Resolve returned paths against the base URL. The website's `/docs/` reference includes response examples generated from the current dataset.

## Get a release

`GET /api/v1/{channel}.json`

Resolves a channel to its current release. Pin the returned catalogue path for reproducible maps.

**Path parameters:** `channel` is `latest` (approved models) or `preview` (includes drafts).

**200 OK · application/json:** `{schemaVersion, channel, release, count, catalogue}`. The response channel is `approved` for latest.json and `preview` for preview.json. `catalogue` is the pinned catalogue path. A channel with no published models returns 200 with `status: "no-release"`, `release: null`, `catalogue: null` and `count: 0`. There is no catalogue to fetch in that case; consumers must not silently switch to preview. Previously published immutable catalogues remain available at their original URLs.

**Cache:** 60 seconds, revalidate.

## Get a catalogue

`GET /api/v1/releases/{release}/catalogue.json`

Returns index information and links to the full dataset.

**Path parameters:** `release` is the exact ID from a release pointer.

**200 OK · application/json:** schemaVersion, release, channel, count, status, assetBase, bounds, maxHeightM, minZoom, attribution, dataLicense, index, assets and sourceDatabase. `bounds` is [west, south, east, north] in WGS84 degrees. `minZoom` is the minimum display zoom among members; older catalogues omit it. Resolve the pointer and small catalogue once, then defer index requests below that threshold. Intersect the viewport with the listed occupied cells rather than enumerating a global grid. `index` contains fixed `zoom` (12), a tile path `template`, and `occupied` cells formatted as `x/y`. `assets` and `sourceDatabase` are resource paths.

**Cache:** one year, immutable.

## Get a tile

`GET /api/v1/releases/{release}/index/12/{x}/{y}.json`

Returns metadata for whole models whose ground bounding boxes intersect an XYZ cell.

**Path parameters:** `release` as above; `x` and `y` are integer Web Mercator tile coordinates at zoom 12 (0–4095). Use cells listed in `index.occupied`.

**200 OK · application/json:** `{schemaVersion, release, assets}`. Entries include placement, downloads and attribution. Follow each entry's `metadata` path for full provenance (OSM reference, photographs and assistance disclosure).

**404 Not Found:** unoccupied or unknown tile.

**Cache:** one year, immutable.

Request occupied cells intersecting a padded viewport. Border models occur in multiple cells; deduplicate by ID and content revision. Account for height and camera pitch, then cull with actual 3D bounds. The XYZ index builder rejects antimeridian-spanning footprints; split them before extending coverage.

## Get model metadata

`GET /assets/{id}/{publicationRevision}/asset.json`

Returns placement, downloads, provenance and review information for one model.

**Path parameters:** `id` is the model ID; `publicationRevision` is the metadata revision. Follow the `metadata` path from a tile or full dataset response.

**200 OK · application/json:** a model object. Placement fields include anchor, heading, axes, units, bounds, boundsBlenderM, minZoom, detailZoom, replacementFootprint and optional basemapReplacement, bridgeReplacement, terrainPlacement and terrainComponents. `kind: "bridge"` identifies a bridge interpretation. `lods.low` and `lods.detail` contain raw GLB url, bytes, sha256, triangles and a gzip descriptor. Source, spatialSource and preview descriptors contain url, bytes and sha256. Attribution, authors, component licenses, references, assistance and review record provide provenance. `metadata` and `validation` are resource paths.

**Cache:** one year, immutable.

The global catalogue has no geographic membership boundary. Content `revision` hashes submission metadata (excluding review fields) and source/model/preview bytes. `publicationRevision` includes review state; changing approval gets a new metadata URL. Dataset releases hash their complete member metadata. `schemaVersion` is independent of all these identities.

## Download a model

`GET /models/{id}/{sha256}/{lod}.glb`

Returns a complete, texture-free glTF binary. Use the URL in lods.low or lods.detail.

**Path parameters:** `id` is the model ID; `sha256` hashes the raw GLB; `lod` is `low` or `detail`.

**200 OK · model/gltf-binary:** raw GLB bytes. Append `.gz` for an explicit gzip file, served as `application/gzip` with no Content-Encoding. The gzip descriptor gives the compressed byte count and hash; decompress once before parsing GLB, using native `DecompressionStream('gzip')` where available. Fall back to the raw GLB otherwise. No Draco, Meshopt or texture decoder is required.

**Cache:** one year, immutable.

## Dataset and sources

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

Published global immutable URLs remain available. Sources, previews and spatial
extracts have independent content-hashed paths `/objects/{sha256}/{filename}`.
Review or metadata changes do not duplicate these files. Each model metadata
object also identifies its material library.

`npm run snapshot -- --auto` prepares a batched publication. Version 2 publication
records contain only new file hashes and channel roots; `releases/current.json`
selects the record served by production. Candidate previews use current
submissions. A new draft does not displace the previous approved revision.
Withdrawals are explicit publication-policy entries.

There is one global dataset, with no collections endpoint or collection parameter.
Paris-specific API paths were removed during the global migration. HTML and entry
JS revalidate; immutable global data caches for one year.

## Placement and attribution

`anchor` is WGS84 [longitude, latitude]. GLB vertices use metres, X east / Y up / Z south, with heading baked. Ordinary landmarks have ground at zero; add anchor terrain elevation once. Models declaring `terrainPlacement` use the explicit datum below. `boundsBlenderM` uses X east / Y north / Z up; convert it before culling. Respect each model's minZoom/detailZoom, retain the old LOD until its replacement loads, cap concurrency/resident geometry and release GPU buffers on eviction. Use the full bounds for visibility and distance selection, including long bridges whose anchor can lie outside the view.

Preserve material base colors and adapt lighting and emissive intensity to the scene. Suppress overlapping basemap extrusions only after the model loads. Optional basemapReplacement IDs apply only to the named dataset snapshot.

Retain model attribution and source links, including © OpenStreetMap contributors. Component licenses and provenance are recorded per asset. Spatial source access must remain available independently of any consumer application.

### Bridge placement and replacement

`terrainPlacement: {datum: "sea-level", elevationM, contacts}` fixes the model
origin at the declared elevation above local mean sea level. Anchor DEM values
can describe the seabed and must not translate the suspended structure.
Reference and modeled heights remain architectural interpretation with the datum
and source uncertainty recorded in metadata.

Each contact declares `id`, `mode`, `boundsBlenderM`, `referenceElevationM` and
`maxDeltaM`. Contact bounds and reference heights use authored local metres
(east, north, up), before adding `elevationM`. A `transition` also declares
`sampleBlenderM: [east, north]`, `axis: "x" | "y"`, `innerM` and `outerM`.
Sample the terminal terrain, subtract the origin and reference elevations, then
feather that displacement from zero at the inner station to full displacement
at the outer station. Either station direction is valid. A `skirt` samples each
declared support-base vertex and extends its lower edge down to terrain with a
small overlap; upper piers, the deck, towers and cables stay fixed. Each declared
zone must contain actual vertices in both exported LODs.

Evaluate from original vertices on every terrain update. With terrain enabled,
missing samples are pending and differences beyond `maxDeltaM` are unsupported;
retain the native bridge until every contact is supported. With terrain disabled,
use the authored datum. Consumers without explicit bridge placement support
should retain the native bridge and omit the model.

`bridgeReplacement: {sourceLayer, names, includeUntaggedNamedSegments, coverage}`
identifies exact road-feature names and a source layer. Require a bridge flag
unless untagged named approach segments are explicitly allowed. At least 95% of
each source line's length must lie in `replacementFootprint`; check every loaded
fragment sharing an ID before suppressing it. Apply suppression to the selected
road casing, fill and markings only while a supported bridge model is resident.
Other roads remain visible. Restore the original layers on failure, unloading,
style changes and extension removal.

An optional `bridgeReplacement.buildingFootprint` Polygon/MultiPolygon in WGS84
identifies only the bridge's native tower/pier extrusions. Its optional
`buildingCoverage` defaults to 0.8 and must be between 0.8 and 1. Require that
area coverage for every loaded fragment sharing a building ID. Suppress these
extrusions only while the supported bridge mesh is resident; restore them on
zoom-out, failure, unloading or removal. The elevated road footprint is never
used to suppress buildings beneath the span. Golden Gate declares two separate
tower footprints; Fort Point remains outside them.

### Ensembles on sloping ground

`terrainComponents` declares an exported `_TERRAIN_COMPONENT` scalar attribute,
`maxOffsetM`, `maxFoundationDepthM`, and `components` with distinct `id`, `value`
and local east/north `sampleBlenderM` probes. Every primitive and indexed triangle
must keep its own declared component. This preserves separate buildings even
where their source footprints share a wall, without adding material draw calls.

With terrain enabled, sample each component and its foundation points. Translate
that component's upper geometry rigidly to the highest sampled foundation level,
relative to the model anchor elevation; extend only its existing basement ends to
terrain with a small overlap. Roofs, windows and stairs retain their dimensions.
Start from original exported positions on every update. Missing samples or offsets
beyond the declared limits keep native buildings visible; disabling terrain
restores the authored flat-ground ensemble. Consumers require component-placement
support (Clair 3D 0.2.17 or later) before replacing this ensemble's native buildings.
The DEM is coarse and these floor levels are map placement, not surveyed entrances.

### Material library

New catalogue descriptors include `materialLibrary: {schemaVersion, sha256, url}`.
Resolve the immutable URL on the dataset origin. It lists approved sRGB colors,
roughness and metalness. Wall windows use light blue `window`; self-supporting
glazing uses `glass`. The source GLBs have passed full-area window support checks
in both LODs. See [the contract](MATERIALS.md).

Optional `wikidata` identifies the depicted entity (for example `Q243`). `modelSources` records geometry imported from other creators: title, author, source page, original file URL and SHA-256, license and license URL, and modifications. It differs from `references`, which lists visual study material. Consumers must retain imported-model credits and applicable share-alike terms; the model's `artisticLicense` can differ from the collection's default CC BY 4.0.
