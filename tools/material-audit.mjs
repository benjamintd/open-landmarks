import { readFileSync } from 'node:fs';
export const materialLibrary = JSON.parse(readFileSync(new URL('../materials.json', import.meta.url)));
export const linearColor = hex => [1,3,5].map(i => {
  const c = parseInt(hex.slice(i,i+2),16)/255;
  return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
});
export function materialAudit(doc) {
  const errors=[];
  if (doc.textures?.length || doc.images?.length) errors.push('Image textures are not in the allowed library');
  for (const mat of doc.materials ?? []) {
    const spec=materialLibrary.materials[mat.name], pbr=mat.pbrMetallicRoughness ?? {};
    if (!spec) { errors.push(`Unknown material: ${mat.name}`); continue; }
    const actual=pbr.baseColorFactor ?? [1,1,1,1], expected=[...linearColor(spec.color),1];
    if (actual.length!==4 || actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-expected[i])>1e-5)) errors.push(`${mat.name}: color outside approved palette`);
    if (Math.abs((pbr.roughnessFactor??1)-spec.roughness)>1e-5 || Math.abs((pbr.metallicFactor??1)-spec.metalness)>1e-5) errors.push(`${mat.name}: unapproved surface properties`);
    if ((mat.alphaMode??'OPAQUE')!=='OPAQUE' || mat.extensions && Object.keys(mat.extensions).length) errors.push(`${mat.name}: unapproved material extension or transparency`);
  }
  return errors;
}
