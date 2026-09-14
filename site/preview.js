import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  const scene = new THREE.Scene(); scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene), center = box.getCenter(new THREE.Vector3());
  const size = Math.max(...box.getSize(new THREE.Vector3()).toArray());
  const camera = new THREE.PerspectiveCamera(36, 1, size / 100, size * 30);
  camera.position.copy(center).add(new THREE.Vector3(size * 1.3, size * .85, size * 1.6));
  const hemi = new THREE.HemisphereLight('#fffaf1', '#cdc9bc', 2.8);
  const sun = new THREE.DirectionalLight('#fff9eb', 1.8); sun.position.set(-2, 4, 3);
  scene.add(hemi, sun);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(center);
  controls.minDistance = size * .65; controls.maxDistance = size * 5; controls.enablePan = false;
  const draw = () => renderer.render(scene, camera);
  const resize = () => { const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); };
  const lightSelect = document.querySelector('#light');
  const lighting = () => {
    const night = lightSelect.value === 'night';
    container.classList.toggle('night', night); hemi.intensity = night ? 1 : 2.8; sun.intensity = night ? .35 : 1.8;
    gltf.scene.traverse(o => {
      if (['window','entrance'].includes(o.material?.name)) {
        o.material.emissive.copy(o.material.color);
        o.material.emissiveIntensity = o.material.name === 'window' ? (night ? .85 : .12) : (night ? 1 : 0);
      }
    }); draw();
  };
  controls.addEventListener('change', draw); lightSelect.addEventListener('change', lighting);
  container.querySelector('img')?.remove(); container.prepend(renderer.domElement);
  controls.update(); resize(); lighting();
  const observer = new ResizeObserver(resize); observer.observe(container);
  window.addEventListener('pagehide', () => {
    observer.disconnect(); controls.dispose(); renderer.dispose(); lightSelect.removeEventListener('change', lighting);
    gltf.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }, { once: true });
}
