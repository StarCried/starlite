import {mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {createRequire} from "node:module";
import Hexo from "hexo";
import {model,motion} from "../../tests/fixtures/vrm.mjs";
const require=createRequire(import.meta.url), {prepareModel}=require("vrm-web/prepare"), {registerHexoWidget}=require("hexo-model-companion");
const root=resolve(import.meta.dirname,".generated");
// Only this example's generated output is replaceable.
await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});
await writeFile(resolve(root,"source.vrm"),model());await writeFile(resolve(root,"Idle.vrma"),motion());
const manifest=await prepareModel({model:resolve(root,"source.vrm"),animations:[{name:"Idle",path:resolve(root,"Idle.vrma")}],output:resolve(root,"bundle"),allowRedistribution:true});
await writeFile(resolve(root,"_config.yml"),"title: VRM isolated example\nurl: http://127.0.0.1:4182\ntheme: false\n");
const hexo=new Hexo(root,{silent:true});hexo.env.init=true;
try {
 await hexo.init();
 hexo.config.inochi2d_widget={enable:true,backend:"vrm",bundle:"bundle",fallback:"fallback.svg",publication:{confirm:true,allowRedistribution:true,sourceSha256:manifest.model.sourceSha256},ambient:{animations:["Idle"]},interactions:{pointer:true,click:false},display:{width:260,height:360}};
 registerHexoWidget(hexo);
 hexo.extend.generator.register("example-page",()=>[
  {path:"index.html",data:'<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>VRM Hexo example</title><body><main><h1>Article first</h1><p>This isolated Hexo page uses a synthetic VRM 1.0 triangle. No private artwork is included.</p><button id="pjax">Simulate PJAX</button><output id="result"></output></main><script>document.getElementById("pjax").onclick=()=>{document.dispatchEvent(new Event("pjax:complete"));document.getElementById("result").textContent="PJAX dispatched"}</script></body></html>'},
  {path:"fallback.svg",data:'<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360"><rect width="260" height="360" rx="24" fill="#cde"/><text x="30" y="180">Static companion</text></svg>'}
 ]);
 // Generated HTML routes receive the same injector as rendered theme pages.
 hexo.extend.filter.register("after_render:html",html=>html);
 await hexo.call("generate");
 const path=resolve(root,"public/index.html");let html=await readFile(path,"utf8");
 if(!html.includes("__hexoInox2dWidgetState")) {
   html=hexo.extend.injector.exec(html);await writeFile(path,html);
 }
 if(!html.includes("vrm-widget/")||html.includes("inochi2d.wasm"))throw new Error("wrong backend output");
 console.log("Isolated VRM Hexo output:",resolve(root,"public"));
} finally {await hexo.exit()}
