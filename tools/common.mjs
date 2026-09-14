import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const root = new URL('../', import.meta.url);
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async url => JSON.parse(await readFile(url));
export const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export async function submissions() {
  const dirs = (await readdir(new URL('collection/', root), { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(dirs.map(async d => ({ dir: new URL(`collection/${d.name}/`, root), asset: await json(new URL(`collection/${d.name}/asset.json`, root)) })));
}
export function cellsForBounds([w, s, e, n], z = 12) {
  if (![w,s,e,n].every(Number.isFinite) || w > e || s > n || w < -180 || e > 180 || s < -85.051129 || n > 85.051129) throw Error('Invalid XYZ bounds; split antimeridian geometries before indexing');
  const size = 2 ** z, clamp = x => Math.max(0, Math.min(size - 1, Math.floor(x)));
  const x = lng => clamp((lng + 180) / 360 * size);
  const y = lat => clamp((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * size);
  const cells = [];
  for (let i = x(w); i <= x(e); i++) for (let j = y(n); j <= y(s); j++) cells.push(`${i}/${j}`);
  return cells;
}
export function footprintBounds(geometry) {
  if (!['Polygon','MultiPolygon'].includes(geometry?.type)) throw Error('Expected polygon footprint');
  const points = geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2);
  if (!points.length || points.some(p => p.length < 2 || !p.every(Number.isFinite))) throw Error('Invalid footprint coordinates');
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
export function reviewed(asset, revision) {
  return asset.rightsStatus === 'approved' && asset.geometryStatus === 'approved' &&
    asset.review?.status === 'approved' && asset.review?.revision === revision &&
    Boolean(asset.review.reviewer?.trim()) && ['rights','footprint','appearance','mapIntegration'].every(k => asset.review.checks?.[k] === 'passed');
}
