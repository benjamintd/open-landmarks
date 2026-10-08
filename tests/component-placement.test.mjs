import test from 'node:test';
import assert from 'node:assert/strict';
import {componentMetadataErrors,componentOwnershipAudit} from '../tools/component-placement-audit.mjs';
const spec={attribute:'_TERRAIN_COMPONENT',maxOffsetM:20,maxFoundationDepthM:6,components:[{id:'710',value:1,sampleBlenderM:[0,0]}]};
test('ensemble placement requires bounded distinct ownership and local probes',()=>{
 const asset={terrainComponents:structuredClone(spec),boundsBlenderM:[[-1,-1,0],[1,1,12]]};
 assert.deepEqual(componentMetadataErrors(asset),[]);
 asset.terrainComponents.components.push({...spec.components[0]});assert(componentMetadataErrors(asset).length);
 asset.terrainComponents=structuredClone(spec);asset.terrainComponents.components[0].sampleBlenderM=[20,0];assert(componentMetadataErrors(asset).length);
 asset.terrainComponents=structuredClone(spec);asset.terrainPlacement={datum:'sea-level'};assert(componentMetadataErrors(asset).length);
});
function glb(values){
 const binary=Buffer.alloc(12);values.forEach((v,i)=>binary.writeFloatLE(v,i*4));
 const doc={bufferViews:[{byteOffset:0,byteLength:12}],accessors:[{count:3},{bufferView:0,componentType:5126,type:'SCALAR',count:3}],meshes:[{primitives:[{attributes:{POSITION:0,_TERRAIN_COMPONENT:1}}]}]};
 const text=Buffer.from(JSON.stringify(doc)),size=Math.ceil(text.length/4)*4,raw=Buffer.alloc(28+size+12,32);
 raw.write('glTF');raw.writeUInt32LE(2,4);raw.writeUInt32LE(raw.length,8);raw.writeUInt32LE(size,12);raw.write('JSON',16);text.copy(raw,20);raw.writeUInt32LE(12,20+size);raw.write('BIN\0',24+size);binary.copy(raw,28+size);return raw;
}
test('indexed geometry must preserve one declared owner per triangle',()=>{
 assert.deepEqual(componentOwnershipAudit(glb([1,1,1]),spec).errors,[]);
 assert(componentOwnershipAudit(glb([1,2,1]),spec).errors.includes('triangle crosses terrain components'));
 assert(componentOwnershipAudit(glb([1,1,2.5]),spec).errors.includes('unknown ownership value'));
});
