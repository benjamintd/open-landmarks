import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './common.mjs';
const base = fileURLToPath(new URL('build/', root));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.webp':'image/webp', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.gz':'application/gzip', '.md':'text/plain', '.txt':'text/plain' };
const server = createServer(async (req,res) => {
  try {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(base, '.' + pathname);
    if (path !== base.slice(0,-1) && !path.startsWith(base.endsWith(sep) ? base : base + sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(path), file = info.isDirectory() ? resolve(path,'index.html') : path;
    const data = await readFile(file);
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-cache', 'Access-Control-Allow-Origin':'*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS' }); res.end(); return; }
    res.writeHead(200,headers); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, { 'Content-Type':'text/plain' }); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 5180), 'localhost', () => console.log(`Open Landmarks: http://localhost:${server.address().port}`));
