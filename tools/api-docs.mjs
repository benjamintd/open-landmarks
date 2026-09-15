import { cellsForBounds } from './common.mjs';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = value => `<code>${esc(value)}</code>`;
const json = value => `<pre><code>${esc(JSON.stringify(value, null, 2))}</code></pre>`;
const fields = rows => `<div class="api-table"><table><thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Description</th></tr></thead><tbody>${rows.map(([name, type, description]) => `<tr><th scope="row">${code(name)}</th><td>${esc(type)}</td><td>${description}</td></tr>`).join('')}</tbody></table></div>`;
const endpoint = ({ id, title, path, description, parameters, response, rows, example, sample, partial = false, cache = '1 year · immutable', mime = 'application/json' }) => `
<section class="api-endpoint" id="${id}">
  <h2>${title}</h2>
  <div class="api-request"><span class="api-method">GET</span>${code(path)}</div>
  <p>${description}</p>
  <p class="api-parameters"><strong>Path parameters</strong> ${parameters || 'None.'}</p>
  <p class="api-response"><strong>200 OK</strong> · ${code(mime)}<br>${response}</p>
  ${rows ? fields(rows) : ''}
  ${sample ? `<details class="api-example"><summary>Response example${partial ? ' · selected fields' : ''}</summary>${json(sample)}</details>` : ''}
  <p class="api-cache">Cache: ${cache}. <a href="${esc(example)}">Open example ↗</a></p>
</section>`;

export function renderApiDocs(assets, catalogue) {
  const base = `/api/v1/collections/${catalogue.collection}`;
  const releaseBase = `${base}/${catalogue.release}`;
  const directory = { schemaVersion: 1, collections: [{ id: 'paris', name: 'Paris', latest: `${base}/latest.json`, preview: `${base}/preview.json` }] };
  const pointer = { schemaVersion: 1, collection: catalogue.collection, channel: catalogue.channel, release: catalogue.release, count: catalogue.count, catalogue: `${releaseBase}/catalogue.json` };
  const cell = catalogue.index.occupied[0];
  const a = assets.find(asset => cellsForBounds(asset.bounds, catalogue.index.zoom).includes(cell)) || assets[0];
  const pick = (asset, keys) => Object.fromEntries(keys.map(key => [key, asset[key]]));
  const tileSample = { schemaVersion: 1, collection: catalogue.collection, release: catalogue.release,
    assets: assets.filter(asset => cellsForBounds(asset.bounds, catalogue.index.zoom).includes(cell)).map(asset => pick(asset, ['id', 'revision', 'anchor', 'minZoom', 'detailZoom', 'metadata', 'lods'])) };
  const collectionParam = `${code('collection')} — collection ID; currently ${code('paris')}.`;
  const releaseParam = `${collectionParam} ${code('release')} — exact release ID returned by a pointer.`;

  return `<p class="lead">Discover landmarks by location and download their models, metadata and editable sources.</p>
<div class="api-base"><span>Base URL</span>${code('https://open-landmarks.benmaps.fr')}</div>
<p>No API key required. All resources support GET, HEAD and cross-origin reads. Resolve returned paths against the base URL.</p>
<nav class="api-contents" aria-label="API endpoints">
${[['collections', 'Collections'], ['release', 'Release'], ['catalogue', 'Catalogue'], ['tiles', 'Tiles'], ['metadata', 'Metadata'], ['models', 'Models'], ['sources', 'Sources']].map(([id, title]) => `<a href="#${id}">${title}</a>`).join('')}
</nav>
<p class="api-note">Start with a collection, resolve its release, then request tiles from the catalogue. Fetch model files only when needed.</p>

${endpoint({ id: 'collections', title: 'List collections', path: '/api/v1/collections.json',
  description: 'Returns the available collections and their release endpoints.',
  response: 'A collection directory.', cache: '60 seconds · revalidate', example: '/api/v1/collections.json', sample: directory,
  rows: [['schemaVersion', 'integer', 'Response schema version; currently 1.'], ['collections', 'object[]', 'Available collections.'], ['collections[].id', 'string', 'Collection ID used in request paths.'], ['collections[].name', 'string', 'Display name.'], ['collections[].latest', 'string', 'Path to the approved release pointer.'], ['collections[].preview', 'string', 'Path to the release pointer that includes drafts.']] })}

${endpoint({ id: 'release', title: 'Get a release', path: '/api/v1/collections/{collection}/{channel}.json',
  description: 'Resolves a channel to its current release. Save the returned catalogue path to pin that release.',
  parameters: `${collectionParam} ${code('channel')} — ${code('latest')} for approved models, or ${code('preview')} to include drafts.`,
  response: `A release pointer. A channel with nothing published returns 200 with ${code('release: null')}, ${code('catalogue: null')} and ${code('count: 0')} — treat that as "not yet released" rather than an empty release. Paris currently has ${assets.filter(asset => asset.approved).length} approved models and ${assets.length} models in preview.`,
  cache: '60 seconds · revalidate', example: `${base}/preview.json`, sample: pointer,
  rows: [['schemaVersion', 'integer', 'Response schema version.'], ['collection', 'string', 'Collection ID.'], ['channel', 'string', `${code('approved')} for latest.json; ${code('preview')} for preview.json.`], ['release', 'string | null', 'Immutable release ID, or null when nothing is published.'], ['count', 'integer', 'Number of models in this release.'], ['catalogue', 'string | null', 'Path to the pinned catalogue, or null when nothing is published.']] })}

${endpoint({ id: 'catalogue', title: 'Get a catalogue', path: '/api/v1/collections/{collection}/{release}/catalogue.json',
  description: 'Returns spatial index information and links to the full collection data.', parameters: releaseParam,
  response: 'A catalogue for the requested release.', example: `${releaseBase}/catalogue.json`, sample: catalogue,
  rows: [['schemaVersion / collection / release / channel / count', 'integer / string', 'Schema version, collection ID, release ID, channel and model count, as in the release pointer.'], ['status', 'string', `${code('approved-only')} or ${code('includes-unreviewed-drafts')}.`], ['assetBase', 'string', 'Origin-relative asset root.'], ['bounds', 'number[4]', 'Collection extent: [west, south, east, north], WGS84 degrees.'], ['maxHeightM', 'number', 'Maximum model height in metres; useful for padding discovery.'], ['index.zoom', 'integer', 'Fixed index zoom; currently 12.'], ['index.template', 'string', 'Tile path template with {x} and {y} placeholders.'], ['index.occupied', 'string[]', 'Available cells, each formatted as "x/y".'], ['assets', 'string', 'Path to all model metadata in this release.'], ['sourceDatabase', 'string', 'Path to the complete spatial source database.'], ['attribution / dataLicense', 'string', 'Collection credit and spatial data license.']] })}

${endpoint({ id: 'tiles', title: 'Get a tile', path: '/api/v1/collections/{collection}/{release}/index/12/{x}/{y}.json',
  description: 'Returns metadata for whole models whose ground bounding boxes intersect an XYZ cell.',
  parameters: `${releaseParam} ${code('x')}, ${code('y')} — integer Web Mercator tile coordinates at zoom 12 (0–4095). Use cells listed in ${code('index.occupied')}.`,
  response: 'A tile containing model entries. Unoccupied cells return 404. Entries contain placement, download and attribution fields; full provenance is available at each entry’s metadata path.',
  example: `${releaseBase}/index/12/${cell}.json`, sample: tileSample, partial: true,
  rows: [['schemaVersion', 'integer', 'Response schema version.'], ['collection / release', 'string', 'Collection and pinned release IDs.'], ['assets', 'object[]', 'Model entries; see metadata fields below.']] })}
<p>Request occupied cells intersecting a padded viewport. Models can appear in several cells; deduplicate by ${code('id')} and ${code('revision')}. Account for camera pitch and tall buildings, then cull against 3D bounds.</p>

${endpoint({ id: 'metadata', title: 'Get model metadata', path: '/assets/{id}/{publicationRevision}/asset.json',
  description: 'Returns placement, downloads, provenance and review information for one model. Follow the metadata path from a tile or the full collection response.',
  parameters: `${code('id')} — model ID. ${code('publicationRevision')} — metadata revision from the model entry.`,
  response: 'A model metadata object.', example: a.metadata, sample: pick(a, ['id', 'name', 'revision', 'publicationRevision', 'approved', 'anchor', 'axes', 'units', 'heading', 'minZoom', 'detailZoom', 'boundsBlenderM', 'lods', 'source', 'spatialSource', 'attribution', 'artisticLicense', 'spatialDataLicense']), partial: true,
  rows: [['id / name', 'string', 'Stable model ID and display name.'], ['revision / publicationRevision', 'string', 'Content revision; metadata revision also includes review state.'], ['approved', 'boolean', 'Whether this exact content revision has been approved.'], ['anchor', 'number[2]', 'WGS84 [longitude, latitude].'], ['axes / units / heading', 'string / number', 'GLB orientation and units. Heading is baked into the geometry.'], ['bounds', 'number[4]', 'Ground bounding box: [west, south, east, north].'], ['boundsBlenderM', 'number[2][3]', 'Local [min, max] corners, X east / Y north / Z up, in metres.'], ['minZoom / detailZoom', 'number', 'Suggested display and detail-LOD zoom thresholds.'], ['lods.low / lods.detail', 'object', 'Raw GLB url, bytes, sha256, triangles and a gzip download descriptor.'], ['source / spatialSource / preview', 'object', 'Download descriptors: url, bytes and sha256.'], ['metadata / validation', 'string', 'Paths to this metadata and its structural validation report.'], ['replacementFootprint / basemapReplacement', 'object', 'Footprint and optional dataset-specific extrusion replacement hints.'], ['entranceLights', 'number[][3]', 'Optional local light anchors in GLB axes.'], ['authors / attribution / artisticLicense / spatialDataLicense / licenseScope', 'array / string', 'Authorship, credits and component licensing.'], ['osm / references / assistance / review', 'object / array / string', 'Source provenance, reference credits, assistance disclosure and review record.']] })}

${endpoint({ id: 'models', title: 'Download a model', path: '/models/{id}/{sha256}/{lod}.glb',
  description: 'Returns a complete, texture-free glTF binary. Use the download URL from lods.low or lods.detail.',
  parameters: `${code('id')} — model ID. ${code('sha256')} — hash of the raw GLB. ${code('lod')} — ${code('low')} or ${code('detail')}.`,
  response: `Binary GLB bytes. Append ${code('.gz')} for the explicit gzip file (${code('application/gzip')}, no ${code('Content-Encoding')}); decompress it once before loading. The gzip descriptor gives the compressed size and hash.`,
  mime: 'model/gltf-binary', example: a.lods.low.url })}
<details class="api-example"><summary>JavaScript · download and decompress</summary><pre><code>${esc(`const origin = 'https://open-landmarks.benmaps.fr';
const response = await fetch(new URL(asset.lods.detail.gzip.url, origin));
if (!response.ok) throw new Error('Model request failed');
const bytes = await new Response(response.body.pipeThrough(
  new DecompressionStream('gzip')
)).arrayBuffer();
// Pass bytes to a glTF loader.`)}</code></pre></details>
<p>Use the raw GLB where native gzip decompression is unavailable. V1 needs no Draco, Meshopt or texture decoder. Retain the current LOD until its replacement has loaded.</p>

<section class="api-endpoint" id="sources"><h2>Collection data and sources</h2>
<p>These GET resources also cache for one year. Follow their paths from the catalogue or model metadata.</p>
${fields([['catalogue.assets', 'JSON', `${code('{schemaVersion, release, assets}')} with complete model metadata. <a href="${catalogue.assets}">Open example ↗</a>`], ['catalogue.sourceDatabase', 'JSON', `${code('{license, attribution, assets}')} with OSM-derived source records. <a href="${catalogue.sourceDatabase}">Open example ↗</a>`], ['asset.source.url', 'gzip file', 'Editable Blender source; decompress before opening.'], ['asset.spatialSource.url', 'JSON', 'Per-model OSM spatial source extract.'], ['asset.preview.url', 'WebP', 'Static model preview.'], ['asset.validation', 'JSON', 'Structural validation report.']])}</section>

<section class="api-endpoint" id="http"><h2>HTTP behavior</h2>
${fields([['200 OK', 'success', 'Resource exists. HEAD returns headers without a response body.'], ['304 Not Modified', 'cache', 'A conditional request can reuse the cached representation.'], ['404 Not Found', 'error', 'Unknown resource, release, model or unoccupied tile. Error bodies are not a defined JSON schema.']])}
<p>The directory and release pointers revalidate after 60 seconds. Release data, model files and source revisions cache for one year and retain their URLs. JSON can use negotiated HTTP compression; explicit .gz files require client decompression. V1 has no server-side search or query filters.</p></section>

<section class="api-endpoint" id="placement"><h2>Placement and attribution</h2>
<p>GLB vertices use metres, X east / Y up / Z south, with ground at zero. Add terrain elevation once; do not reapply heading. Convert ${code('boundsBlenderM')} to GLB axes before culling.</p>
<p>Preserve material base colors and adapt light and emissive intensity to your scene. Suppress overlapping basemap extrusions after the model loads. ${code('basemapReplacement')} IDs apply only to the named dataset snapshot.</p>
<p>Retain each model’s attribution and source links, including © OpenStreetMap contributors. See <a href="/licenses/">licensing and attribution</a> for component terms.</p></section>`;
}
