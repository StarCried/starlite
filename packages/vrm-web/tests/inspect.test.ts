import { describe, expect, it } from "vitest";
import { parseGlb, inspectVrma } from "../src/inspect.js";
import { validateVrmWidgetConfig } from "../src/config.js";
function glb(json: unknown): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json)); const size = Math.ceil(text.length/4)*4;
  const b=new ArrayBuffer(20+size), v=new DataView(b);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,b.byteLength,true);v.setUint32(12,size,true);v.setUint32(16,0x4e4f534a,true);
  new Uint8Array(b,20).fill(32);new Uint8Array(b,20,text.length).set(text);return b;
}
const model = {asset:{version:"2.0"},extensions:{VRM:{specVersion:"0.0"}}};
describe("self-contained VRM import",()=>{
  it("recognizes both VRM versions and rejects external resources",()=>{
    expect(parseGlb(glb(model),"vrm")).toBeTruthy();
    expect(parseGlb(glb({asset:{version:"2.0"},extensions:{VRMC_vrm:{specVersion:"1.0"}}}),"vrm")).toBeTruthy();
    for(const uri of ["https://example.invalid/a.png","file:///secret","../local.bin","data:image/png;base64,AA=="]){
      expect(()=>parseGlb(glb({...model,images:[{uri}]}),"vrm")).toThrow("external");
    }
  });
  it("rejects truncated headers, lengths, required codecs and buffer ranges",()=>{
    const valid=glb(model);expect(()=>parseGlb(valid.slice(0,-4),"vrm")).toThrow();
    expect(()=>parseGlb(glb({...model,extensionsRequired:["KHR_draco_mesh_compression"]}),"vrm")).toThrow();
    expect(()=>parseGlb(glb({...model,bufferViews:[{buffer:0,byteLength:4}]}),"vrm")).toThrow();
    expect(()=>inspectVrma(glb(model))).toThrow();
  });
  it("rejects cycles, repeated parents and oversized decoded allocations",()=>{
    for (const nodes of [[{children:[0]}],[{children:[1]},{children:[0]}],[{children:[2]},{children:[2]},{}]]) expect(()=>parseGlb(glb({...model,nodes}),"vrm")).toThrow();
    expect(()=>parseGlb(glb({...model,accessors:[{componentType:5126,type:"VEC3",count:1e12}]}),"vrm")).toThrow("allocation");
  });
  it("validates exact action names independently of model expressions",()=>{
    const config={model:"model.vrm",fallback:"fallback.png",animations:[{name:"Idle",url:"Idle.vrma"}]};
    expect(()=>validateVrmWidgetConfig(config)).not.toThrow();
    expect(()=>validateVrmWidgetConfig({...config,interactions:{click:{animation:"idle"}}})).toThrow();
    expect(()=>validateVrmWidgetConfig({...config,animations:[...config.animations,...config.animations]})).toThrow();
    expect(()=>validateVrmWidgetConfig({...config,render:{fps:Infinity}})).toThrow();
  });
});
