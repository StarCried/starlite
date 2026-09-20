import {afterEach,expect,it,vi} from "vitest";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {collectVrmModelAssets,collectRuntimeAssets,resolveRuntimeDist} from "../src/assets";
import {readEnabledConfig} from "../src/config";
// @ts-expect-error plain JS fixture
import {model,motion} from "../../../tests/fixtures/vrm.mjs";
const {prepareModel}=createRequire(import.meta.url)("vrm-web/prepare");
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})});
async function bundle(allowRedistribution=true){
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-test-"));roots.push(root);
 writeFileSync(join(root,"source.vrm"),model());writeFileSync(join(root,"Idle.vrma"),motion());
 await prepareModel({model:join(root,"source.vrm"),animations:[{name:"Idle",path:join(root,"Idle.vrma")}],output:join(root,"bundle"),allowRedistribution});
 return join(root,"bundle");
}
it("ships only the VRM backend and resolves every hashed motion URL",async()=>{
 const directory=await bundle(), assets=collectVrmModelAssets(directory);
 const runtime=collectRuntimeAssets(resolveRuntimeDist("vrm"),"vrm");
 expect(runtime.assets.map(a=>a.relativePath)).toEqual(["index.js","widget.css"]);
 expect(assets.assets.some(a=>a.relativePath==="motions/0.vrma")).toBe(true);
 const enabled=readEnabledConfig({config:{root:"/blog/",inochi2d_widget:{backend:"vrm",enable:true,bundle:directory,fallback:"fallback.png",publication:{confirm:true,allowRedistribution:true,sourceSha256:assets.sourceSha256},ambient:{animations:["Idle"]},gaze:{maxYawDegrees:20,maxPitchDegrees:12},dialogue:{click:{animation:"Idle",lines:["Hello"]}}}},extend:{generator:{register:vi.fn()},injector:{register:vi.fn()}},log:{warn:vi.fn()}},assets)!;
 expect(enabled.widget).toMatchObject({backend:"vrm",render:{fps:30,maxDevicePixelRatio:1.5},animations:[{name:"Idle",url:`/blog/${assets.routePrefix}/motions/0.vrma`}]});
 expect(enabled.showOnMobile).toBe(false);
 expect(enabled.widget).toMatchObject({gaze:{maxYawDegrees:20,maxPitchDegrees:12},dialogue:{click:{animation:"Idle",lines:["Hello"]}}});
});
it("keeps redistribution and source identity gates for VRM",async()=>{
 const directory=await bundle(false);expect(()=>collectVrmModelAssets(directory)).toThrow("redistribution");
 const allowed=await bundle(), assets=collectVrmModelAssets(allowed);
 const hexo:any={config:{inochi2d_widget:{backend:"vrm",enable:true,bundle:allowed,fallback:"fallback.png",publication:{confirm:true,allowRedistribution:true,sourceSha256:"0".repeat(64)}}}};
 expect(()=>readEnabledConfig(hexo,assets)).toThrow("sourceSha256");
 writeFileSync(join(allowed,"motions/0.vrma"),"broken");expect(()=>collectVrmModelAssets(allowed)).toThrow("hash mismatch");
});
