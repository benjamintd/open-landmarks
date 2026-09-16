import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {glbTriangles} from '../tools/window-audit.mjs';

// These checks exercise the published geometry, independently of the private
// modeling workshop. Axes in spatial-source are east/north; GLB is east/up/south.
const collection=new URL('../collection/',import.meta.url);
const read=async (slug,file)=>readFile(new URL(`${slug}/${file}`,collection));
const source=async slug=>JSON.parse(await read(slug,'spatial-source.json'));
const triangles=async (slug,lod)=>glbTriangles(await read(slug,`${lod}.glb`));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const area2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function inTriangle(p,t) {
  if(Math.abs(area2(...t))<1e-7)return false;
  const signs=t.map((a,i)=>area2(a,t[(i+1)%3],p));
  return signs.every(v=>v>=-1e-7)||signs.every(v=>v<=1e-7);
}
function inRing(p,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function distanceToRing(p,ring) {
  return Math.min(...ring.slice(1).map((b,i)=>{
    const a=ring[i],d=sub(b,a),q=sub(p,a),t=Math.max(0,Math.min(1,dot(q,d)/(dot(d,d)||1)));
    return Math.hypot(...sub(q,d.map(v=>v*t)));
  }));
}
function courtyardSamples(ring) {
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),samples=[];
  for(let x=Math.min(...xs)+.7;x<Math.max(...xs);x+=2.5)
    for(let y=Math.min(...ys)+.7;y<Math.max(...ys);y+=2.5)
      if(inRing([x,y],ring)&&distanceToRing([x,y],ring)>.6)samples.push([x,y]);
  return samples;
}
const projected=t=>t.points.map(([x,y,z])=>[x,-z]);
function blockedCourtyardSamples(mesh,samples) {
  const projectedFaces=mesh.filter(t=>Math.max(...t.points.map(p=>p[1]))>.5).map(projected);
  return samples.filter(p=>projectedFaces.some(t=>inTriangle(p,t)));
}
function rayHit(origin,direction,triangle,maxDistance) {
  const [a,b,c]=triangle,e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-9)return false;
  const s=sub(origin,a),u=dot(s,h)/det;
  if(u<0||u>1)return false;
  const q=cross(s,e1),v=dot(direction,q)/det;
  if(v<0||u+v>1)return false;
  const distance=dot(e2,q)/det;
  return distance>=0&&distance<=maxDistance;
}

for(const lod of ['detail','low']) {
  test(`${lod}: new Paris landmarks retain their defining height hierarchy`,async()=>{
    for(const [slug,height] of Object.entries({
      'tour-montparnasse':210,'maison-de-la-radio':68,
      'cite-des-sciences':40,'theatre-marigny':15,'palais-galliera':13,
      'saint-germain-des-pres':60,'saint-pierre-de-montmartre':26,
    })) {
      const mesh=await triangles(slug,lod);
      const top=Math.max(...mesh.flatMap(t=>t.points.map(p=>p[1])));
      assert(Math.abs(top-height)<.01,`${slug}: ${top} m instead of ${height} m`);
    }
  });

  test(`${lod}: Galliera, Maison de la Radio and Bourbon keep mapped courtyards open`,async()=>{
    for(const slug of ['palais-galliera','maison-de-la-radio','palais-bourbon']) {
      const spatial=await source(slug),mesh=await triangles(slug,lod);
      const polygons=spatial.footprint.type==='Polygon'?[spatial.footprint.coordinates]:spatial.footprint.coordinates;
      const holes=polygons.flatMap(p=>p.slice(1));
      assert(holes.length>0,`${slug}: missing mapped courtyard rings`);
      for(const [i,ring] of holes.entries()) {
        const samples=courtyardSamples(ring);
        assert(samples.length>0,`${slug} courtyard ${i}: no interior samples`);
        assert.equal(blockedCourtyardSamples(mesh,samples).length,0,`${slug} courtyard ${i}: roof/wall fills the open plan`);
      }
      // Calibration: a new roof over the court must fail even if its vertices
      // lie outside the source hole. Merely checking mesh vertices misses this.
      const samples=courtyardSamples(holes[0]),xs=holes[0].map(p=>p[0]),ys=holes[0].map(p=>p[1]);
      const x0=Math.min(...xs)-1,x1=Math.max(...xs)+1,y0=Math.min(...ys)-1,y1=Math.max(...ys)+1;
      const cover=[[[x0,1,-y0],[x1,1,-y0],[x1,1,-y1]],[[x0,1,-y0],[x1,1,-y1],[x0,1,-y1]]].map(points=>({points}));
      assert.equal(blockedCourtyardSamples(cover,samples).length,samples.length);
    }
  });

  test(`${lod}: Saint-Pierre belfry has eight real openings through stone`,async()=>{
    const slug='saint-pierre-de-montmartre',spatial=await source(slug),mesh=await triangles(slug,lod);
    const part=spatial.parts.find(p=>p.osm==='way/653147916');
    assert(part,'mapped bell tower source is retained');
    const ring=part.geometry.coordinates[0];
    const signedArea=ring.slice(1).reduce((n,b,i)=>n+ring[i][0]*b[1]-b[0]*ring[i][1],0);
    const points=signedArea>0?ring:[...ring].reverse(),stone=mesh.filter(t=>t.material==='stone');
    let openings=0;
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(length<4)continue;
      const nx=dy/length,ny=-dx/length;
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      assert(stone.some(t=>rayHit([mid[0]+nx*.2,18,-mid[1]-ny*.2],[-nx,0,ny],t.points,1.1)),'belfry central stone pier missing');
      for(const fraction of [1/3,2/3]) {
        const x=a[0]+dx*fraction,y=a[1]+dy*fraction;
        const origin=[x+nx*.2,18,-y-ny*.2],direction=[-nx,0,ny];
        assert(!stone.some(t=>rayHit(origin,direction,t.points,1.1)),`belfry arch ${openings+1} filled by stone`);
        openings++;
      }
    }
    assert.equal(openings,8);
  });

  test(`${lod}: Saint-Sulpice keeps its unequal north and south towers`,async()=>{
    const slug='saint-sulpice',spatial=await source(slug),mesh=await triangles(slug,lod),tops=[];
    for(const [id,expected] of [['way/1460576494',70.3],['way/1460576491',66.4]]) {
      const part=spatial.parts.find(p=>p.osm===id);
      assert(part,`missing source for ${id}`);
      const ring=part.geometry.coordinates[0];
      const heights=mesh.flatMap(t=>t.points).filter(([x,y,z])=>inRing([x,-z],ring)||distanceToRing([x,-z],ring)<.1).map(p=>p[1]);
      const top=Math.max(...heights);
      assert(Math.abs(top-expected)<.01,`${id}: expected ${expected} m, got ${top}`);
      tops.push(top);
    }
    assert(tops[0]-tops[1]>3.8,'unequal tower crowns were made symmetric');
  });

  test(`${lod}: CNIT retains a curved roof shell with two separated skins`,async()=>{
    const mesh=await triangles('cnit',lod),shell=mesh.filter(t=>t.material==='trim'),heights=new Map();
    for(const t of shell)for(const [x,y,z] of t.points) {
      const key=`${x.toFixed(4)},${z.toFixed(4)}`;
      if(!heights.has(key))heights.set(key,new Set());
      heights.get(key).add(Number(y.toFixed(4)));
    }
    const pairs=[...heights.values()].filter(v=>v.size===2).map(v=>[...v].sort((a,b)=>a-b));
    assert(pairs.length>heights.size*.95,'roof top and underside lost their paired samples');
    assert(pairs.every(([a,b])=>Math.abs(b-a-.65)<.0003),'roof thickness changed from 0.65 m');
    const tops=pairs.map(p=>p[1]);
    assert(Math.max(...tops)-Math.min(...tops)>30,'curved three-point shell flattened');
    assert(mesh.some(t=>t.material==='glass'),'curtain glazing missing');
  });

  test(`${lod}: CNIT uses its measured IGN roof height above the plaza datum`,async()=>{
    const spatial=await source('cnit'),mesh=await triangles('cnit',lod);
    const top=Math.max(...mesh.flatMap(t=>t.points.map(p=>p[1])));
    // March 2023 roof returns put the shell near 38.5 m above this plaza.
    // The former 50 m OSM tag described a different height assumption.
    assert(top>38 && top<39,`CNIT measured shell height changed: ${top} m`);
    assert.equal(spatial.lidar.verticalCRS,'IGN69');
    assert(Math.abs(spatial.lidar.groundElevationM-62.3205)<.001);
    assert.equal(spatial.lidar.tiles.length,2);
    assert(spatial.lidar.tiles.every(t=>t.acquisitionStart.startsWith('2023-03-02')));
    assert.match(spatial.lidar.attribution,/IGN/);
    assert.match(spatial.lidar.license,/licence-ouverte/);
  });
}
