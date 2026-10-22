import { createServer } from "node:http";
import { readFile, mkdir, writeFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2), option=(name)=>args[args.indexOf(name)+1];
if(!args.includes("--assets")&&!args.includes("--model")) throw new Error("Pass --model <avatar.vrm> for model adjustments, or --assets <private companion output directory> for motion review. Assets stay outside this repository.");
const assets=args.includes("--assets")?resolve(option("--assets")):undefined, runtime=resolve(here,"../../packages/vrm/dist");
const port=Number(args.includes("--port")?option("--port"):4178);
const original=args.includes("--original")?resolve(option("--original")):undefined;
const adjustmentModels=[];
if(args.includes("--model")) {
  const {inspectVrm,MAX_MODEL_BYTES}=createRequire(import.meta.url)(resolve(runtime,"inspect.cjs"));
  for(const [flag,id] of [["--model","primary"],["--compare-model","comparison"]]) {
    if(!args.includes(flag))continue;
    const path=resolve(option(flag)),info=await stat(path);
    if(!info.isFile()||info.size<20||info.size>MAX_MODEL_BYTES)throw new Error("Preview requires a VRM file no larger than 64 MiB.");
    const bytes=await readFile(path);
    const report=inspectVrm(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    adjustmentModels.push({id,path,title:report.name||id,capabilities:report.capabilities,animations:report.animations});
  }
}
const inside=(root,path)=>{const part=relative(root,path);return !part.startsWith("..")&&!isAbsolute(part)};
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;res.end();return;}
    const url=new URL(req.url,"http://127.0.0.1");
    if(url.pathname==="/adjust-models.json") {
      res.setHeader("Content-Type","application/json");
      res.end(JSON.stringify(adjustmentModels.map(({path,...model})=>({...model,url:`/adjust-model/${model.id}.vrm`}))));return;
    }
    if(url.pathname==="/qa-report" && req.method==="POST") {
      if(!assets)throw new Error("motion review is not configured");
      if(req.headers.origin!==`http://127.0.0.1:${port}`) {res.statusCode=403;res.end();return;}
      let body=""; for await(const chunk of req){body+=chunk;if(body.length>2*1024*1024)throw new Error("report too large");}
      const report=JSON.parse(body); await mkdir(resolve(assets,"qa"),{recursive:true});
      const kind=report.kind==="long"?"long":"validation";
      const environment=["webview2","edge"].includes(report.environment)?report.environment:"iab";
      await writeFile(resolve(assets,"qa",`${environment}-${kind}.json`),JSON.stringify(report,null,2));res.end("saved");return;
    }
    if(url.pathname==="/config.json") {
      if(!assets)throw new Error("motion review is not configured");
      const variant=url.searchParams.get("variant")==="blog"?"blog":"desktop";
      const manifest=JSON.parse(await readFile(resolve(assets,variant,"manifest.json"),"utf8"));
      const config={backend:"vrm",model:url.searchParams.get("variant")==="original"&&original?"/original.vrm":`/assets/${variant}/${manifest.model.file}`,fallback:"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",...(manifest.profile?{profile:`/assets/${variant}/${manifest.profile.file}`} : {}),animations:manifest.animations.map(a=>({name:a.name,url:`/assets/${variant}/${a.file}`})),ambient:{animations:typeof manifest.mappings?.idle==="string"?[manifest.mappings.idle]:[]},display:{width:480,height:720},render:{fps:Number(url.searchParams.get("fps"))===60?60:30,maxDevicePixelRatio:1.5,fitPadding:.92},camera:{yawDegrees:0,pitchDegrees:5,fovDegrees:20,targetHeight:.54},mobile:{show:true},interactions:{pointer:true,click:false,drag:false}};
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify(config));return;
    }
    let path;
    if(url.pathname==="/") path=resolve(here,assets?"index.html":"adjust.html");
    else if(url.pathname==="/adjust") path=resolve(here,"adjust.html");
    else if(["/adjust.js","/adjust.css"].includes(url.pathname)) path=resolve(here,url.pathname.slice(1));
    else if(adjustmentModels.some(model=>url.pathname===`/adjust-model/${model.id}.vrm`))path=adjustmentModels.find(model=>url.pathname===`/adjust-model/${model.id}.vrm`).path;
    else if(url.pathname==="/qa.js") path=resolve(here,"qa.js");
    else if(url.pathname==="/original.vrm"&&original) path=original;
    else {
      const isRuntime=url.pathname.startsWith("/runtime/"), root=isRuntime?runtime:assets;
      if(!root)throw new Error("route missing");
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
