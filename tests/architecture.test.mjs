import test from 'node:test';
import assert from 'node:assert/strict';
import {windowSupportAudit} from '../tools/window-audit.mjs';
import {materialAudit,materialLibrary,linearColor} from '../tools/material-audit.mjs';
const quad=(x0,y0,x1,y1,z=0,material='stone')=>[
  {material,points:[[x0,y0,z],[x1,y0,z],[x1,y1,z]]},
  {material,points:[[x0,y0,z],[x1,y1,z],[x0,y1,z]]},
];
const window=quad(1,1,3,3,.035,'window');
test('window requires support over its whole area, in either winding',()=>{
  assert.equal(windowSupportAudit([...quad(0,0,4,4),...window]).unsupported,0);
  assert.equal(windowSupportAudit([...quad(0,0,4,4).map(t=>({...t,points:[...t.points].reverse()})),...window]).unsupported,0);
  for(const [name,walls] of [
    ['floating',quad(0,0,4,4,-.2)],['corner',quad(0,0,2,4)],['above eave',quad(0,0,4,2)],
    ['window supporting window',quad(0,0,4,4,0,'window')],['no walls',[]],
    // Small off-centre aperture: all window corners and centre still touch wall.
    ['interior hole',[...quad(0,0,4,1.3),...quad(0,1.7,4,4),...quad(0,1.3,1.3,1.7),...quad(1.7,1.3,4,1.7)]],
  ]) assert(windowSupportAudit([...walls,...window]).unsupported>0,name);
});
test('adjacent supporting triangles cover a panel without seams or duplicate-area shortcuts',()=>{
  const half=quad(0,0,2,4);
  assert.equal(windowSupportAudit([...half,...quad(2,0,4,4),...window]).unsupported,0);
  assert(windowSupportAudit([...half,...half,...window]).unsupported>0);
});
test('attachment tolerance is in metres and structural glass is separate',()=>{
  assert.equal(windowSupportAudit([...quad(0,0,4,4),...quad(1,1,3,3,.059,'window')]).unsupported,0);
  assert(windowSupportAudit([...quad(0,0,4,4),...quad(1,1,3,3,.061,'window')]).unsupported>0);
  assert.equal(windowSupportAudit(quad(1,1,3,3,4,'glass')).checked,0);
  const rotate=t=>({...t,points:t.points.map(([x,y,z])=>[z,y,-x])});
  assert.equal(windowSupportAudit([...quad(0,0,4,4),...window].map(rotate)).unsupported,0);
  const oblique=t=>({...t,points:t.points.map(([x,y,z])=>[(x+z)/Math.SQRT2,y,(z-x)/Math.SQRT2])});
  // A panel exactly meeting a wall edge must project along its normal, not a world axis.
  assert.equal(windowSupportAudit([...quad(1,1,3,3),...window].map(oblique)).unsupported,0);
});
test('only named, texture-free palette materials with approved factors pass',()=>{
  const materials=Object.entries(materialLibrary.materials).map(([name,s])=>({name,pbrMetallicRoughness:{baseColorFactor:[...linearColor(s.color),1],roughnessFactor:s.roughness,metallicFactor:s.metalness}}));
  assert.deepEqual(materialAudit({materials}),[]);
  const mat=materials.find(m=>m.name==='window');
  assert(materialAudit({materials:[{...mat,pbrMetallicRoughness:{...mat.pbrMetallicRoughness,baseColorFactor:[0,0,0,1]}}]}).length);
  assert(materialAudit({materials:[{...mat,name:'unlisted'}]}).length);
  assert(materialAudit({materials,images:[{}]}).length);
  assert(materialAudit({materials:[{...mat,extensions:{KHR_materials_transmission:{transmissionFactor:1}}}]}).length);
});

test('unreferenced meshes cannot provide invisible wall support',async()=>{
  const {glbTriangles}=await import('../tools/window-audit.mjs');
  const triangles=[...quad(0,0,4,4),...window];
  const points=triangles.flatMap(t=>t.points).flat(),binary=Buffer.alloc(points.length*4);
  points.forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const doc={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteLength:72,byteOffset:0},{buffer:0,byteLength:72,byteOffset:72}],accessors:[0,1].map(bufferView=>({bufferView,componentType:5126,count:6,type:'VEC3'})),materials:[{name:'stone'},{name:'window'}],meshes:[0,1].map(i=>({primitives:[{attributes:{POSITION:i},material:i}]})),nodes:[{mesh:0},{mesh:1}],scene:0,scenes:[{nodes:[1]}]};
  const encoded=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(json);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.write('BIN\0',4);
  const raw=Buffer.concat([header,json,binHeader,binary]);
  const rendered=glbTriangles(raw);
  assert.equal(rendered.length,2);
  assert.equal(windowSupportAudit(rendered).unsupported,2);
});
