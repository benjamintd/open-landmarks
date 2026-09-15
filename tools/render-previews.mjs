// Run locally, open the printed URL and click Render. No browser automation or
// remote image service required. Reuses the production renderer and lighting.
import {createServer} from 'node:http';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
const root=new URL('../',import.meta.url),token=randomBytes(24).toString('hex');
const args=process.argv.slice(2),flag=args.indexOf('--directions');
const directions=flag<0?{}:JSON.parse(await readFile(args.splice(flag,2)[1]));
const names=(await readdir(new URL('collection/',root))).filter(name=>!args.length||args.includes(name));
const jobs=await Promise.all(names.map(async slug=>({slug,direction:directions[slug]??JSON.parse(await readFile(new URL(`collection/${slug}/asset.json`,root))).previewDirection}))),complete=new Set();
const bundle=await build({entryPoints:[new URL('tools/thumbnail-client.js',root).pathname],bundle:true,write:false,format:'esm'});
const port=Number(process.env.PORT||5181);
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST') {
      const slug=url.pathname.slice('/rendered/'.length);
      if(!url.pathname.startsWith('/rendered/')||!names.includes(slug)||url.searchParams.get('token')!==token||req.headers.origin!==`http://localhost:${port}`)throw Error('Invalid render request');
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1000000)throw Error('Image too large');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error('Expected WebP');
      await writeFile(new URL(`collection/${slug}/preview.webp`,root),bytes);
      complete.add(slug);console.log(`Saved ${complete.size}/${names.length}: ${slug}`);
      res.end('Saved');return;
    }
    if(req.method!=='GET')throw Error('GET required');
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Landmark thumbnails</title><h1>Shared lighting thumbnails</h1><button>Render thumbnails</button><p><output>Ready</output></p><script type="module" src="/renderer.js"></script>');return;}
    if(url.pathname==='/jobs.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jobs,token}));return;}
    if(url.pathname==='/renderer.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
    const match=url.pathname.match(/^\/collection\/([a-z0-9-]+)\/detail\.glb$/);
    if(!match||!names.includes(match[1]))throw Error('Not found');
    res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile(new URL(url.pathname.slice(1),root)));
  } catch(error){res.statusCode=400;res.end(error.message);}
});
server.listen(port,'localhost',()=>console.log(`Open http://localhost:${port} to render ${jobs.length} thumbnails.`));
