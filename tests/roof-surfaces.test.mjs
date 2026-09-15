import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {glbTriangles} from '../tools/window-audit.mjs';

// Convex clipping makes this independent of triangulation: differently split
// wall caps and roof panels still occupy the same physical surface.
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function overlap(subject,clip) {
 let p=subject;
 const sign=Math.sign(cross(...clip));
 for(let i=0;i<3&&p.length;i++) {
  const a=clip[i],b=clip[(i+1)%3],out=[];
  for(let j=0;j<p.length;j++) {
   const s=p[j],e=p[(j+1)%p.length],ds=sign*cross(a,b,s),de=sign*cross(a,b,e);
   if(ds>=0)out.push(s);
   if((ds>=0)!==(de>=0)) {const t=ds/(ds-de);out.push([s[0]+t*(e[0]-s[0]),s[1]+t*(e[1]-s[1])]);}
  }
  p=out;
 }
 return p.length>=3?area(p):0;
}
test('roof overlap regression detects intersecting surfaces with different triangulations',()=>{
 assert.equal(overlap([[0,0],[2,0],[0,2]],[[0,0],[2,2],[0,2]]),1);
 assert.equal(overlap([[0,0],[2,0],[0,2]],[[3,0],[4,0],[3,1]]),0);
});
const levels={
 'hotel-de-ville':[21,26,32], 'hotel-de-soubise':[13], 'louvre':[22,25,29],
 'musee-dorsay':[23,29], 'palais-de-lelysee':[6,9.5], 'palais-royal':[23],
};
for(const [slug,elevations] of Object.entries(levels))test(`${slug}: roof panels do not coincide with hidden wall caps in either LOD`,async()=>{
 for(const lod of ['detail','low']) {
  const triangles=glbTriangles(await readFile(new URL(`../collection/${slug}/${lod}.glb`,import.meta.url)));
  for(const height of elevations) {
   const surface=material=>triangles.filter(t=>t.material===material&&t.points.every(p=>Math.abs(p[1]-height)<.0001)).map(t=>t.points.map(p=>[p[0],p[2]])).filter(t=>area(t)>1e-8);
   const walls=surface('stone'),roofs=surface('roof');
   let total=0;
   for(const wall of walls)for(const roof of roofs)total+=overlap(wall,roof);
   assert(total<.0001,`${slug} ${lod} at ${height}m: ${total} square metres of coplanar roof/wall overlap`);
  }
 }
});
