import { createServer } from "node:http";
import { readFile, mkdir, writeFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2), option=(name)=>args[args.indexOf(name)+1];
if(!args.includes("--assets")) throw new Error("Pass --assets <private companion output directory>; assets are never copied into this repository.");
const assets=resolve(option("--assets")), runtime=resolve(here,"../../packages/vrm-web/dist");
const port=Number(args.includes("--port")?option("--port"):4178);
const original=args.includes("--original")?resolve(option("--original")):undefined;
const inside=(root,path)=>{const part=relative(root,path);return !part.startsWith("..")&&!isAbsolute(part)};
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;res.end();return;}
    const url=new URL(req.url,"http://127.0.0.1");
    if(url.pathname==="/qa-report" && req.method==="POST") {
      if(req.headers.origin!==`http://127.0.0.1:${port}`) {res.statusCode=403;res.end();return;}
      let body=""; for await(const chunk of req){body+=chunk;if(body.length>2*1024*1024)throw new Error("report too large");}
      const report=JSON.parse(body); await mkdir(resolve(assets,"qa"),{recursive:true});
      const kind=report.kind==="long"?"long":"validation";
      const environment=["webview2","edge"].includes(report.environment)?report.environment:"iab";
      await writeFile(resolve(assets,"qa",`${environment}-${kind}.json`),JSON.stringify(report,null,2));res.end("saved");return;
    }
    if(url.pathname==="/config.json") {
      const variant=url.searchParams.get("variant")==="blog"?"blog":"desktop";
      const manifest=JSON.parse(await readFile(resolve(assets,variant,"manifest.json"),"utf8"));
      const config={backend:"vrm",model:url.searchParams.get("variant")==="original"&&original?"/original.vrm":`/assets/${variant}/Weiguang.vrm`,fallback:"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",profile:"/assets/profile.json",animations:manifest.animations.map(a=>({name:a.name,url:`/assets/motions/${a.name}.vrma`})),display:{width:480,height:720},render:{fps:Number(url.searchParams.get("fps"))===60?60:30,maxDevicePixelRatio:1.5,autoFit:true},mobile:{show:true},interactions:{pointer:true,click:false,drag:false}};
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify(config));return;
    }
    let path;
    if(url.pathname==="/") path=resolve(here,"index.html");
    else if(url.pathname==="/qa.js") path=resolve(here,"qa.js");
    else if(url.pathname==="/original.vrm"&&original) path=original;
    else {
      const isRuntime=url.pathname.startsWith("/runtime/"), root=isRuntime?runtime:assets;
      const prefix=isRuntime?"/runtime/":"/assets/";
      if(!url.pathname.startsWith(prefix))throw new Error("route missing");
      path=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length)));
      if(!inside(root,path)||!inside(await realpath(root),await realpath(path)))throw new Error("invalid asset path");
    }
    const bytes=await readFile(path);
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png"})[extname(path)]??"application/octet-stream");
    res.setHeader("Cache-Control","no-store");res.end(bytes);
  } catch {res.statusCode=404;res.end("Not found");}
});
server.listen(port,"127.0.0.1",()=>console.log(`Private VRM preview: http://127.0.0.1:${port}`));
