// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { mountModelWidget } from "../src/index.js";
import { mountWithDependencies } from "../../inochi2d-web/src/controller.js";
import type { ModelController } from "model-widget-core";
let scene: THREE.Scene;
let rejectTexture = false;
vi.mock("three", async (original) => ({...await original<typeof import("three")>(), WebGLRenderer: class {
 info={render:{calls:1,triangles:12},memory:{geometries:1,textures:0}};
 setClearColor(){} setPixelRatio(){} setSize(){} render(){} dispose(){} forceContextLoss(){}
 getContext(){return {getExtension:()=>null,getParameter:()=>"test WebGL2",RENDERER:0}}
}}));
vi.mock("three/addons/loaders/GLTFLoader.js",()=>({GLTFLoader:class {
 constructor(private manager: THREE.LoadingManager){}
 register(){return this}
 async parseAsync(bytes:ArrayBuffer){
  if(bytes.byteLength===1)return {userData:{vrmAnimations:[{}]}};
  if(rejectTexture)this.manager.itemError("blob:blocked-texture");
  scene=new THREE.Scene();const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name="body";scene.add(mesh);
  return {scene,userData:{vrm:{scene,meta:{metaVersion:"1"},materials:[],humanoid:{getNormalizedBoneNode:()=>null,getNormalizedPose:()=>({}),setNormalizedPose:()=>{mesh.position.x=0},update:()=>{}},expressionManager:{resetValues(){},expressions:[],setValue(){},update(){}}}}};
 }
}}));
vi.mock("@pixiv/three-vrm-animation",async(original)=>({...await original<typeof import("@pixiv/three-vrm-animation")>(),createVRMAnimationClip:()=>new THREE.AnimationClip("Action",1,[new THREE.NumberKeyframeTrack("body.position[x]",[0,.5,1],[0,1,0])])}));
vi.mock("../src/inspect.js",async(original)=>({...await original<typeof import("../src/inspect.js")>(),inspectVrma:()=>({durationMs:1000})}));
let time=0,id=0;const frames=new Map<number,FrameRequestCallback>();
function advance(ms:number){for(let end=time+ms;time<end;){time=Math.min(end,time+1000/60);const batch=[...frames];frames.clear();for(const [,callback]of batch)callback(time)}}
const requestFrame=(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id};
const cancelFrame=(handle:number)=>frames.delete(handle);
const resources:ModelController[]=[];
function model(){const text=new TextEncoder().encode(JSON.stringify({asset:{version:"2.0"},extensions:{VRMC_vrm:{specVersion:"1.0"}}}));const n=Math.ceil(text.length/4)*4;const b=new ArrayBuffer(20+n),v=new DataView(b);for(const [at,value]of [[0,0x46546c67],[4,2],[8,b.byteLength],[12,n],[16,0x4e4f534a]])v.setUint32(at!,value!,true);new Uint8Array(b,20).fill(32);new Uint8Array(b,20,text.length).set(text);return b}
beforeEach(()=>{
 rejectTexture=false;time=0;id=0;frames.clear();document.body.replaceChildren();
 vi.spyOn(performance,"now").mockImplementation(()=>time);
 vi.stubGlobal("requestAnimationFrame",requestFrame);vi.stubGlobal("cancelAnimationFrame",cancelFrame);
 vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("fetch",async(url:string)=>new Response(url.endsWith('.vrma')?new Uint8Array([1]):model()));
});
afterEach(()=>{for(const c of resources.splice(0))c.destroy();vi.restoreAllMocks();vi.unstubAllGlobals()});
async function mount(backend:string,signal?:AbortSignal,dialogue?:any){
 const host=document.createElement("div");document.body.append(host);
 let c:ModelController;
 if(backend==='vrm')c=await mountModelWidget(host,{dialogue,model:'test.vrm',fallback:'fallback.png',animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],mobile:{show:true},interactions:{pointer:false,click:false,drag:false}},{...(signal?{signal}:{})});
 else{
  const clip={timestepMs:100,length:10,leadIn:0,leadOut:8,weight:1,lanes:[{parameter:'move',defaultValues:[0,0],interpolation:'linear',keyframes:[{frame:0,value:0,tension:0},{frame:5,value:1,tension:0},{frame:10,value:0,tension:0}]}]};
  c=await mountWithDependencies(host,{dialogue,model:'test.inp',fallback:'fallback.png',animations:[{...clip,name:'Action'},{...clip,name:'Other'}] as any,mobile:{show:true},interactions:{pointer:false,click:false,drag:false}},{fetchModel:async()=>new Uint8Array([1]),createRuntime:async()=>({loadModel(){},setParameterScalar(){},setParameterVector(){},setCameraTransform(){},resize(){},renderFrame(){},destroy(){}}),requestFrame,cancelFrame,isMobile:()=>false,prefersReducedMotion:()=>false,isWebGl2Available:()=>true,devicePixelRatio:()=>1,createResizeObserver:()=>undefined,random:()=>.5},signal);
 }
 resources.push(c);return c;
}
for(const backend of ['inochi2d','vrm'])describe(`${backend} public controller contract`,()=>{
 it('lists real clips and completes a single clip',async()=>{const c=await mount(backend);expect(c.status).toBe('running');expect(c.getAnimations()).toEqual([{name:'Action',durationMs:1000},{name:'Other',durationMs:1000}]);const result=c.playAnimation('Action');advance(1200);await expect(result).resolves.toBe('completed')});
 it('keeps loops pending until interrupted or stopped',async()=>{const c=await mount(backend);const loop=c.playAnimation('Action',{mode:'loop'});const settled=vi.fn();void loop.then(settled);advance(2000);await Promise.resolve();expect(settled).not.toHaveBeenCalled();const next=c.playAnimation('Other',{mode:'loop'});await expect(loop).resolves.toBe('interrupted');c.stopAnimation();await expect(next).resolves.toBe('stopped')});
 it('pauses, resumes and destroys idempotently',async()=>{const c=await mount(backend);const result=c.playAnimation('Action');advance(200);c.pause();expect(c.status).toBe('paused');expect(frames.size).toBe(0);advance(5000);c.resume();expect(c.status).toBe('running');advance(1000);await expect(result).resolves.toBe('completed');const loop=c.playAnimation('Other',{mode:'loop'});c.destroy();c.destroy();await expect(loop).resolves.toBe('stopped');expect(document.querySelectorAll('canvas')).toHaveLength(0);expect(frames.size).toBe(0)});
 it('uses the same accessible bubble for entry, click, expiry and pause',async()=>{
  const c=await mount(backend,undefined,{enter:{animation:'Action',lines:['Hello'],delayMs:0,durationMs:1000},click:{animation:'Other',lines:['Clicked'],durationMs:1000}});
  advance(100);const bubble=document.querySelector<HTMLElement>('.model-widget__bubble')!;
  expect(bubble.hidden).toBe(false);expect(bubble.textContent).toBe('Hello');expect(bubble.getAttribute('role')).toBe('status');
  const canvas=document.querySelector('canvas')!;
  if(backend==='vrm'){canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));}
  else canvas.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  expect(bubble.textContent).toBe('Clicked');advance(1100);expect(bubble.hidden).toBe(true);
  if(backend==='vrm'){canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));}
  else canvas.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  c.pause();expect(bubble.hidden).toBe(true);c.destroy();expect(document.querySelector('.model-widget__bubble')).toBeNull();
 });
 it('cancels an owned mounted instance through AbortSignal',async()=>{const abort=new AbortController();const c=await mount(backend,abort.signal);abort.abort();expect(c.status).toBe('destroyed');expect(document.querySelectorAll('canvas')).toHaveLength(0)});
});

it('does not report a white untextured VRM as ready when an embedded image fails',async()=>{
 rejectTexture=true;
 const errors:string[]=[];document.body.addEventListener('model-error',event=>errors.push((event as CustomEvent).detail),{capture:true,once:true});
 const c=await mount('vrm');
 expect(c.status).toBe('fallback');expect(frames.size).toBe(0);
 expect(document.querySelector('canvas')?.hidden).toBe(true);
 expect(errors[0]).toContain('VRM texture loading failed');
});

it('shows reduced-motion VRM entry text without scheduling frames',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations:[{name:'Action',url:'a.vrma'}],dialogue:{enter:{animation:'Action',lines:['Hello'],durationMs:1000}}});resources.push(c);
 expect(c.status).toBe('paused');expect(frames.size).toBe(0);expect(host.querySelector<HTMLElement>('.model-widget__bubble')?.hidden).toBe(false);
 vi.advanceTimersByTime(1000);expect(host.querySelector<HTMLElement>('.model-widget__bubble')?.hidden).toBe(true);
 c.destroy();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
});

it('renders on every 60 Hz callback when configured for 60 FPS', async () => {
 const host=document.createElement('div'); document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},render:{fps:60}}); resources.push(c);
 advance(1000);
 expect(c.diagnostics().renderedFrames).toBeGreaterThanOrEqual(60);
 expect(c.diagnostics().frameTimesMs.every(value=>value<17)).toBe(true);
});
