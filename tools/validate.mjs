import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';
import { meshAudit } from './mesh-audit.mjs';
import { submissions, slug, sha, footprintBounds, cellsForBounds } from './common.mjs';

const requireThat = (condition, message) => { if (!condition) throw Error(message); };
export async function validateSubmission({ asset, dir }) {
  const check = (condition, message) => requireThat(condition, `${asset.id}: ${message}`);
  check(slug(asset.id) && dir.pathname.endsWith(`/${asset.id}/`), 'ID must match directory');
  check(typeof asset.name === 'string' && asset.name.trim(), 'name required');
  check(asset.anchor?.length === 2 && asset.anchor.every(Number.isFinite) && Math.abs(asset.anchor[0]) <= 180 && Math.abs(asset.anchor[1]) <= 85, 'invalid anchor');
  check(asset.units === 'metres' && asset.axes === 'X east / Y up / Z south' && asset.heading === 0, 'bake transforms; export X east, Y up, Z south in metres');
  check(asset.minZoom >= 0 && asset.detailZoom >= asset.minZoom, 'invalid zoom thresholds');
  check(asset.authors?.length && asset.authors.every(a => typeof a === 'string' && a.trim()), 'authors required');
  check(asset.artisticLicense === 'CC-BY-4.0' && asset.spatialDataLicense === 'ODbL-1.0' && asset.licenseScope, 'component licenses required');
  check(asset.attribution && asset.osm?.url?.startsWith('https://www.openstreetmap.org/'), 'OSM provenance required');
  check(Array.isArray(asset.references), 'reference provenance required (empty allowed if independently surveyed)');
  check(asset.references.every(r => r.title && r.author && r.license && /^https:\/\//.test(r.sourcePage) && /^https:\/\//.test(r.licenseUrl)), 'reference attribution incomplete');
  check(['review-required','approved'].includes(asset.rightsStatus) && ['draft','approved'].includes(asset.geometryStatus), 'unknown review status');
  check(asset.source === 'source.blend.gz' && asset.spatialSource === 'spatial-source.json' && asset.preview === 'preview.webp', 'use the standard source filenames');
  const bounds = footprintBounds(asset.replacementFootprint); cellsForBounds(bounds);
  const b = asset.boundsBlenderM;
  check(b?.length === 2 && b.every(v => v.length === 3 && v.every(Number.isFinite)) && b[0].every((v,i) => v <= b[1][i]), 'invalid 3D bounds');
  const reports = {}, bytes = {};
  for (const lod of ['low','detail']) {
    const spec = asset.lods?.[lod]; check(spec?.url === `${lod}.glb`, `expected ${lod}.glb`);
    const raw = await readFile(new URL(spec.url, dir)); bytes[spec.url] = raw;
    check(raw.length === spec.bytes && sha(raw) === spec.sha256, `${lod} bytes/hash mismatch`);
    check(raw.length <= 250000, `${lod} exceeds 250 kB budget`);
    const report = await validator.validateBytes(new Uint8Array(raw), { maxIssues: 10000 });
    check(report.issues.numErrors === 0, `${lod} failed glTF validation: ${JSON.stringify(report.issues.messages)}`);
    const doc = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
    check(!doc.images?.length && !doc.textures?.length && !doc.animations?.length && !doc.skins?.length, 'v1 accepts static, texture-free geometry');
    check(!doc.extensionsRequired?.length, 'v1 accepts plain GLB; no mesh decoder required');
    check(doc.nodes?.every(n => !n.matrix && !n.rotation && !n.translation && !n.scale && !n.children?.length), 'apply transforms and flatten node hierarchy for v1');
    check(doc.materials?.length <= 6, 'maximum six materials');
    check(doc.materials.every(m => !m.alphaMode || m.alphaMode === 'OPAQUE'), 'use opaque materials');
    const primitives = doc.meshes.flatMap(m => m.primitives);
    check(primitives.length <= 6 && primitives.every(p => p.mode === undefined || p.mode === 4), 'maximum six triangle draw calls');
    check(primitives.every(p => p.attributes.POSITION !== undefined && p.attributes.NORMAL !== undefined), 'positions and normals required');
    const mesh = meshAudit(raw);
    check(mesh.reduce((s,m) => s + m.triangles, 0) <= 8000, 'maximum 8,000 triangles');
    check(!mesh.some(m => m.degenerate || m.opposedNormals), 'degenerate triangles or inverted normals');
    const positions = primitives.map(p => doc.accessors[p.attributes.POSITION]);
    const min = [0,1,2].map(i => Math.min(...positions.map(a => a.min[i])));
    const max = [0,1,2].map(i => Math.max(...positions.map(a => a.max[i])));
    const expectedMin = [b[0][0], b[0][2], -b[1][1]], expectedMax = [b[1][0], b[1][2], -b[0][1]];
    check(min.every((v,i) => v >= expectedMin[i] - .1) && max.every((v,i) => v <= expectedMax[i] + .1), 'mesh exceeds declared bounds');
    check(min[1] >= -.1 && min[1] <= .1, 'model must touch ground at Y=0');
    reports[lod] = { sha256: sha(raw), bytes: raw.length, triangles: mesh.reduce((s,m) => s + m.triangles, 0),
      errors: report.issues.numErrors, warnings: report.issues.numWarnings, mesh };
  }
  for (const name of [asset.source, asset.spatialSource, asset.preview]) bytes[name] = await readFile(new URL(name, dir));
  const spatial = JSON.parse(bytes[asset.spatialSource]);
  check(spatial.license === 'ODbL-1.0' && spatial.id === asset.id && spatial.parts && spatial.footprint, 'spatial source extract required');
  // Reviews refer to immutable content. Review changes cannot invalidate their own subject hash.
  const { review, rightsStatus, geometryStatus, ...content } = asset;
  const revision = sha(JSON.stringify(content) + Object.keys(bytes).sort().map(k => `${k}:${sha(bytes[k])}`).join('|'));
  return { asset, dir, bytes, reports, bounds, revision };
}
export async function validateAll() { return Promise.all((await submissions()).map(validateSubmission)); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await validateAll();
  console.table(rows.map(r => ({ id: r.asset.id, revision: r.revision, triangles: r.reports.detail.triangles, status: r.asset.review.status })));
  console.log('Structural validation passed. Footprint fit, visual quality, map integration and rights still require review.');
}
