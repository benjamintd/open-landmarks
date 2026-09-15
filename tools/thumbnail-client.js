import {WebGLRenderer,SRGBColorSpace,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createModelView} from '../rendering/model-view.js';

const output=document.querySelector('output');
document.querySelector('button').onclick=async event=>{
  event.target.disabled=true;
  const renderer=new WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.outputColorSpace=SRGBColorSpace;renderer.setSize(640,534);renderer.setClearColor('white',1);
  document.body.append(renderer.domElement);
  const {jobs,token}=await (await fetch('/jobs.json')).json();
  const benchmark=new URL(location.href).searchParams.has('benchmark'),measurements=[];
  try {
    for(const [i,job] of jobs.entries()) {
      output.textContent=`Rendering ${i+1}/${jobs.length}: ${job.slug}`;
      const buffer=await (await fetch(`/collection/${job.slug}/detail.glb`)).arrayBuffer();
      const {scene:model}=await new GLTFLoader().parseAsync(buffer,'');
      let direction;
      if(job.direction)direction=new Vector3(...job.direction).normalize().multiplyScalar(Math.hypot(1.3,.85,1.6)).toArray();
      const view=createModelView(model,renderer,{aspect:640/534,direction});
      try {
        view.setPreset('day');
        const start=performance.now();view.render();
        const firstRenderMs=performance.now()-start;
        if(benchmark) {
          const gl=renderer.getContext(),environment=view.scene.environment,variants={};
          // Synchronous GPU completion is diagnostic only, never used in the SDK.
          // This includes browser/driver overhead; it is not a mobile benchmark.
          for(const enabled of [false,true]) {
            view.scene.environment=enabled?environment:null;
            for(let n=0;n<12;n++)renderer.render(view.scene,view.camera);
            gl.finish();const samples=[];
            for(let n=0;n<50;n++) {const t=performance.now();renderer.render(view.scene,view.camera);gl.finish();samples.push(performance.now()-t);}
            samples.sort((a,b)=>a-b);
            variants[enabled?'reflections':'withoutReflections']={medianMs:samples[25],p95Ms:samples[47],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
          }
          view.scene.environment=environment;view.render();
          measurements.push({slug:job.slug,firstRenderMs,...variants});
        }
        const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/webp',.9));
        const response=await fetch(`/rendered/${job.slug}?token=${token}`,{method:'POST',body:blob});
        if(!response.ok)throw Error(await response.text());
      } finally {
        view.dispose();
        model.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])m.dispose();});
      }
    }
    output.textContent=`Complete: ${jobs.length} thumbnails rendered with shared WebGL lighting.`;
    if(benchmark){const pre=document.createElement('pre');pre.textContent=JSON.stringify({resolution:[640,534],measurements},null,2);document.body.append(pre);}
  } catch(error) { output.textContent=`Failed: ${error.message}`;throw error; }
  finally {renderer.dispose();}
};
