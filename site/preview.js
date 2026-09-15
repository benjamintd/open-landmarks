import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {createModelView} from '../rendering/model-view.js';

export async function preview(container, spec) {
  const response = await fetch('DecompressionStream' in window ? spec.gzip : spec.url);
  if (!response.ok) throw Error('Model unavailable');
  const bytes = await ('DecompressionStream' in window
    ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : response.arrayBuffer());
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (error) { gltf.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', `Interactive 3D model of ${spec.name}. Drag to orbit, scroll to zoom.`);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.tabIndex = 0;
  const view=createModelView(gltf.scene,renderer,{direction:spec.direction});
  const {camera,center,size}=view;
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(center);
  controls.minDistance = size * .65; controls.maxDistance = size * 5; controls.enablePan = false;
  const draw = () => view.render();
  const resize = () => { const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); };
  const lightSelect = document.querySelector('#light');
  const lighting = () => {
    const night = lightSelect.value === 'night';
    container.classList.toggle('night', night);
    view.setPreset(night?'night':'day');draw();
  };
  controls.addEventListener('change', draw); lightSelect.addEventListener('change', lighting);
  container.querySelector('img')?.remove(); container.prepend(renderer.domElement);
  controls.update(); resize(); lighting();
  const observer = new ResizeObserver(resize); observer.observe(container);
  window.addEventListener('pagehide', () => {
    observer.disconnect(); controls.dispose(); view.dispose();renderer.dispose(); lightSelect.removeEventListener('change', lighting);
    gltf.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }, { once: true });
}
