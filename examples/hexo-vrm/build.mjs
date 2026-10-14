import {mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import Hexo from "hexo";
import {model} from "../../tests/fixtures/vrm.mjs";
const require=createRequire(import.meta.url), {registerHexoWidget}=require("hexo-starlite");
const root=resolve(import.meta.dirname,".generated");
// Only this example's generated output is replaceable.
await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
await writeFile(resolve(root,"source.vrm"),model());
await writeFile(resolve(root,"_config.yml"),"title: VRM isolated example\nurl: http://127.0.0.1:4182\ntheme: false\n");
const hexo=new Hexo(root,{silent:true});hexo.env.init=true;
try {
 await hexo.init();
 hexo.config.starlite={enable:true,backend:"vrm",model:"./source.vrm",publication:{confirm:true,allowRedistribution:true},dialogue:{enter:{lines:["Hello from StarLite"],durationMs:10000,delayMs:0}},interactions:{pointer:true,click:false},display:{width:260,height:360}};
 registerHexoWidget(hexo);
 hexo.extend.generator.register("example-page",()=>[
  {path:"index.html",data:'<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>VRM Hexo example</title><body><main><h1>Article first</h1><p>This isolated Hexo page imports one synthetic VRM 1.0 triangle without animations or a manifest. StarLite supplies Idle and text-only dialogue. No private artwork is included.</p><button id="pjax">Simulate PJAX</button><output id="result"></output></main><script>document.getElementById("pjax").onclick=()=>{document.dispatchEvent(new Event("pjax:complete"));document.getElementById("result").textContent="PJAX dispatched"}</script></body></html>'}
 ]);
 // Generated HTML routes receive the same injector as rendered theme pages.
 hexo.extend.filter.register("after_render:html",html=>html);
 await hexo.call("generate");
 const path=resolve(root,"public/index.html");let html=await readFile(path,"utf8");
 if(!html.includes("__hexoStarLiteWidgetState")) {
   html=hexo.extend.injector.exec(html);await writeFile(path,html);
 }
 if(!html.includes("vrm-widget/")||html.includes("inochi2d.wasm"))throw new Error("wrong backend output");
 console.log("Isolated VRM Hexo output:",resolve(root,"public"));
} finally {await hexo.exit()}
