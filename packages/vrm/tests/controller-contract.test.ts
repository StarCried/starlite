// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VRMLookAt, type VRMHumanoid } from "@pixiv/three-vrm";
import { mountModelWidget } from "../src/index.js";
import { validateVrmWidgetConfig } from "../src/config.js";
import { mountWithDependencies } from "../../inochi2d/src/controller.js";
import type { ModelController } from "@starcried/starlite-core";
let scene: THREE.Scene;
let rejectTexture = false;
let materialDeltas: number[] = [];
let throwMaterial = false;
let compileGate: Promise<void> | undefined;
let compileCalls = 0;
let renderCalls = 0;
let onAnimationParse: (() => void) | undefined;
let embeddedModel = false;
let relaxedIdle = false;
vi.mock("three", async (original) => ({...await original<typeof import("three")>(), WebGLRenderer: class {
 info={render:{calls:1,triangles:12},memory:{geometries:1,textures:0}};
 setClearColor(){} setPixelRatio(){} setSize(){} render(){renderCalls++} dispose(){} forceContextLoss(){}
 async compileAsync(){compileCalls++;await compileGate}
 getContext(){return {getExtension:()=>null,getParameter:()=>"test WebGL2",RENDERER:0}}
}}));
vi.mock("three/addons/loaders/GLTFLoader.js",()=>({GLTFLoader:class {
 constructor(private manager: THREE.LoadingManager){}
 register(){return this}
 async parseAsync(bytes:ArrayBuffer){
  if(bytes.byteLength===1 || new TextDecoder().decode(bytes).includes('"VRMC_vrm_animation"')){onAnimationParse?.();return {userData:{vrmAnimations:[{}]}};}
  if(rejectTexture)this.manager.itemError("blob:blocked-texture");
  scene=new THREE.Scene();const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name="body";scene.add(mesh);
  const head=new THREE.Object3D();head.name="head";head.position.y=.4;scene.add(head);
  const humanoid={getNormalizedBoneNode:()=>head,getRawBoneNode:()=>head,getNormalizedPose:()=>({head:{rotation:head.quaternion.toArray()}}),setNormalizedPose:(pose:any)=>{mesh.position.x=0;head.quaternion.fromArray(pose.head?.rotation??[0,0,0,1])},update:()=>{}};
  const lookAt=new VRMLookAt(humanoid as unknown as VRMHumanoid,{applyYawPitch(){}});
  return {scene,animations:embeddedModel?[new THREE.AnimationClip("Jump",1,[new THREE.NumberKeyframeTrack("body.position[x]",[0,.5,1],[0,1,0])])]:[],userData:{vrm:{scene,meta:{metaVersion:"1"},materials:[{update:(delta:number)=>{if(throwMaterial)throw new Error('material update failed');materialDeltas.push(delta)}}],humanoid,lookAt,expressionManager:{getExpression(){return null},resetValues(){},expressions:[],setValue(){},update(){}}}}};
 }
}}));
vi.mock("@pixiv/three-vrm-animation",async(original)=>({...await original<typeof import("@pixiv/three-vrm-animation")>(),createVRMAnimationClip:()=>new THREE.AnimationClip("Action",1,relaxedIdle?[new THREE.QuaternionKeyframeTrack("head.quaternion",[0,1],[0,0,.2,Math.sqrt(.96),0,0,.2,Math.sqrt(.96)])]:[new THREE.NumberKeyframeTrack("body.position[x]",[0,.5,1],[0,1,0])])}));
vi.mock("../src/inspect.js",async(original)=>({...await original<typeof import("../src/inspect.js")>(),inspectVrma:()=>({durationMs:1000})}));
let time=0,id=0;const frames=new Map<number,FrameRequestCallback>();
function advance(ms:number){for(let end=time+ms;time<end;){time=Math.min(end,time+1000/60);const batch=[...frames];frames.clear();for(const [,callback]of batch)callback(time)}}
const requestFrame=(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id};
const cancelFrame=(handle:number)=>frames.delete(handle);
const resources:ModelController[]=[];
function model(){
 const json={asset:{version:"2.0"},extensions:{VRMC_vrm:{specVersion:"1.0"}},...(embeddedModel?{
  nodes:[{}],buffers:[{byteLength:32}],bufferViews:[{buffer:0,byteOffset:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:24}],
  accessors:[{bufferView:0,componentType:5126,count:2,type:"SCALAR",max:[1]},{bufferView:1,componentType:5126,count:2,type:"VEC3"}],
  animations:[{name:"Jump",samplers:[{input:0,output:1}],channels:[{sampler:0,target:{node:0,path:"translation"}}]}],
 }:{})};
 const text=new TextEncoder().encode(JSON.stringify(json)),n=Math.ceil(text.length/4)*4,b=new ArrayBuffer(20+n+(embeddedModel?40:0)),v=new DataView(b);
 for(const [at,value]of [[0,0x46546c67],[4,2],[8,b.byteLength],[12,n],[16,0x4e4f534a]])v.setUint32(at!,value!,true);new Uint8Array(b,20,n).fill(32);new Uint8Array(b,20,text.length).set(text);
 if(embeddedModel){v.setUint32(20+n,32,true);v.setUint32(24+n,0x004e4942,true);v.setFloat32(32+n,1,true);}
 return b;
}
beforeEach(()=>{
 rejectTexture=false;materialDeltas=[];throwMaterial=false;compileGate=undefined;compileCalls=0;renderCalls=0;onAnimationParse=undefined;embeddedModel=false;relaxedIdle=false;time=0;id=0;frames.clear();document.body.replaceChildren();
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
 if(backend==='vrm')c=await mountModelWidget(host,{dialogue,model:'test.vrm',fallback:'fallback.png',animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],ambient:{animations:[]},mobile:{show:true},interactions:{pointer:false,click:false,drag:false}},{...(signal?{signal}:{})});
 else{
  const clip={timestepMs:100,length:10,leadIn:0,leadOut:8,weight:1,lanes:[{parameter:'move',defaultValues:[0,0],interpolation:'linear',keyframes:[{frame:0,value:0,tension:0},{frame:5,value:1,tension:0},{frame:10,value:0,tension:0}]}]};
  c=await mountWithDependencies(host,{dialogue,model:'test.inp',fallback:'fallback.png',animations:[{...clip,name:'Action'},{...clip,name:'Other'}] as any,mobile:{show:true},interactions:{pointer:false,click:false,drag:false}},{fetchModel:async()=>new Uint8Array([1]),createRuntime:async()=>({loadModel(){},setParameterScalar(){},setParameterVector(){},setCameraTransform(){},resize(){},renderFrame(){},destroy(){}}),requestFrame,cancelFrame,isMobile:()=>false,prefersReducedMotion:()=>false,isWebGl2Available:()=>true,devicePixelRatio:()=>1,createResizeObserver:()=>undefined,random:()=>.5},signal);
 }
 resources.push(c);return c;
}
it('gives a model without motions a bundled Idle and allows text-only click bubbles',async()=>{
 relaxedIdle=true;const host=document.createElement('div');document.body.append(host);
 const fetched=vi.spyOn(globalThis,'fetch');
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},dialogue:{click:{lines:['Hello without gesture']}},interactions:{pointer:false}});resources.push(c);
 expect(c.status).toBe('running');expect(c.getAnimations().map(a=>a.name)).toEqual(['StarLiteIdle']);
 expect(fetched).toHaveBeenCalledOnce();expect(c.diagnostics().activeAnimation).toBe('StarLiteIdle');
 const canvas=host.querySelector('canvas')!;canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
 expect(host.querySelector('.model-widget__bubble')!.textContent).toBe('Hello without gesture');
 expect(c.diagnostics().activeAnimation).toBe('StarLiteIdle');
 c.stopAnimation();expect(scene.getObjectByName('head')!.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(.3);
});
it('lists and plays a model embedded animation alongside the program-provided Idle',async()=>{
 embeddedModel=true;const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},embeddedAnimations:['Jump'],
  animations:[{name:'StarLiteIdle',url:'Idle.vrma'}],ambient:{animations:['StarLiteIdle']},interactions:{pointer:false,click:{animation:'Jump'}}});resources.push(c);
 expect(c.status).toBe('running');expect(c.getAnimations()).toEqual([{name:'Jump',durationMs:1000},{name:'StarLiteIdle',durationMs:1000}]);
 const action=c.playAnimation('Jump');advance(1500);await expect(action).resolves.toBe('completed');expect(c.diagnostics().activeAnimation).toBe('StarLiteIdle');
});
it('rejects an external clip that silently shadows an embedded clip',async()=>{
 embeddedModel=true;const host=document.createElement('div');document.body.append(host);
 const error=vi.fn();host.addEventListener('model-error',error);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations:[{name:'Jump',url:'Jump.vrma'}]});resources.push(c);
 expect(c.status).toBe('fallback');expect((error.mock.calls[0]![0] as CustomEvent).detail).toContain('duplicates embedded');
});
it('keeps the selected Idle baseline when stopping a generic model without a character profile',async()=>{
 relaxedIdle=true;const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations:[{name:'StarLiteIdle',url:'Idle.vrma'}],
  neutralAnimation:'StarLiteIdle',ambient:{animations:['StarLiteIdle']},interactions:{pointer:false}});resources.push(c);
 expect(c.status).toBe('running');advance(500);c.stopAnimation();
 const rotation=scene.getObjectByName('head')!.quaternion;
 expect(rotation.angleTo(new THREE.Quaternion(0,0,.2,Math.sqrt(.96)))).toBeCloseTo(0);
 expect(rotation.angleTo(new THREE.Quaternion())).toBeGreaterThan(.3);
});
it('keeps a fixed canvas and emits no viewport changes while an action begins, completes or returns to neutral',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const changed=vi.fn();host.addEventListener('model-viewport-change',changed);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},render:{viewportPadding:{left:128,top:64,right:128,bottom:128}},interactions:{pointer:false},animations:[{name:'Action',url:'a.vrma'}]});resources.push(c);
 const viewport={left:-128,top:-64,width:576,height:672,baseWidth:320,baseHeight:480};
 expect(changed).toHaveBeenCalledOnce();expect(c.diagnostics().framing?.viewport).toEqual(viewport);
 const action=c.playAnimation('Action');advance(1500);await expect(action).resolves.toBe('completed');
 c.stopAnimation();c.resetCamera();advance(500);
 expect(changed).toHaveBeenCalledOnce();expect(c.diagnostics().framing?.viewport).toEqual(viewport);
 const canvas=host.querySelector('canvas')!;expect(canvas.style.width).toBe('576px');expect(canvas.style.top).toBe('-64px');
});
for(const backend of ['inochi2d','vrm'])describe(`${backend} public controller contract`,()=>{
 it('uses animation-bound entry and click sentences through the public mount',async()=>{
  const original=Math.random;let selection:number|undefined;
  vi.spyOn(Math,'random').mockImplementation(()=>selection??original());
  await mount(backend,undefined,{enter:{animation:'Action',linesByAnimation:{Action:['Entry first',' Entry second ']},delayMs:100,durationMs:1000},click:{animation:'Action',animations:['Action','Other'],linesByAnimation:{Action:['Action only'],Other:['Other first',' Other second ']},durationMs:1000}});
  selection=.5;
  advance(200);const bubble=document.querySelector<HTMLElement>('.model-widget__bubble')!;
  expect(bubble.textContent).toBe('Entry second');expect(bubble.dataset.modelAnimation).toBe('Action');advance(1100);
  const canvas=document.querySelector('canvas')!;
  if(backend==='vrm'){canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));}
  else canvas.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  expect(bubble.textContent).toBe('Other second');expect(bubble.dataset.modelAnimation).toBe('Other');
 });
 it('lists real clips and completes a single clip',async()=>{const c=await mount(backend);expect(c.status).toBe('running');expect(c.getAnimations()).toEqual([{name:'Action',durationMs:1000},{name:'Other',durationMs:1000}]);const result=c.playAnimation('Action');advance(1200);await expect(result).resolves.toBe('completed')});
 it('keeps loops pending until interrupted or stopped',async()=>{const c=await mount(backend);const loop=c.playAnimation('Action',{mode:'loop'});const settled=vi.fn();void loop.then(settled);advance(2000);await Promise.resolve();expect(settled).not.toHaveBeenCalled();const next=c.playAnimation('Other',{mode:'loop'});await expect(loop).resolves.toBe('interrupted');c.stopAnimation();await expect(next).resolves.toBe('stopped')});
 it('pauses, resumes and destroys idempotently',async()=>{const c=await mount(backend);const result=c.playAnimation('Action');advance(200);c.pause();expect(c.status).toBe('paused');expect(frames.size).toBe(0);advance(5000);c.resume();expect(c.status).toBe('running');advance(1000);await expect(result).resolves.toBe('completed');const loop=c.playAnimation('Other',{mode:'loop'});c.destroy();c.destroy();await expect(loop).resolves.toBe('stopped');expect(document.querySelectorAll('canvas')).toHaveLength(0);expect(frames.size).toBe(0)});
 it('uses the same accessible bubble for entry, click, expiry and pause',async()=>{
  const c=await mount(backend,undefined,{enter:{animation:'Action',lines:['Hello'],delayMs:0,durationMs:1000},click:{animation:'Other',lines:['Clicked'],durationMs:1000}});
  advance(100);const bubble=document.querySelector<HTMLElement>('.model-widget__bubble')!;
  expect(bubble.hidden).toBe(false);expect(bubble.textContent).toBe('Hello');expect(bubble.getAttribute('role')).toBe('status');
  advance(1100); // Let entry finish before requesting another foreground scene.
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

it.each([144,320])('renders every %i Hz callback with real elapsed time in display mode',async(hz)=>{
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},render:{fps:'display'}});resources.push(c);
 const initialFrames=c.diagnostics().renderedFrames;materialDeltas=[];
 const timestamps=[0,1,2,4.5,5.5].map(frame=>frame*1000/hz);
 for(const timestamp of timestamps){time=timestamp;const batch=[...frames];frames.clear();expect(batch).toHaveLength(1);for(const[,callback]of batch)callback(time)}
 expect(c.diagnostics().renderedFrames-initialFrames).toBe(timestamps.length);
 expect(materialDeltas).toHaveLength(timestamps.length);
 expect(materialDeltas[0]).toBe(0);
 for(let i=1;i<timestamps.length;i++)expect(materialDeltas[i]).toBeCloseTo((timestamps[i]!-timestamps[i-1]!)/1000,10);
 expect(c.diagnostics().frameTimesMs).toEqual(timestamps.slice(1).map((timestamp,i)=>timestamp-timestamps[i]!));
});

it('resumes display sampling without advancing animation or physics through paused time',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},render:{fps:'display'},interactions:{pointer:false},animations:[{name:'Action',url:'a.vrma'}]});resources.push(c);
 const result=c.playAnimation('Action');advance(200);
 const position=scene.children[0]!.position.x;
 c.pause();expect(frames.size).toBe(0);advance(5000);
 c.resume();materialDeltas=[];
 const batch=[...frames];frames.clear();for(const[,callback]of batch)callback(time);
 expect(materialDeltas).toEqual([0]);expect(scene.children[0]!.position.x).toBe(position);
 advance(1000);await expect(result).resolves.toBe('completed');
});

it('does not count a render stall before the trigger toward the new gesture',async()=>{
 const c=await mount('vrm');advance(100);
 time+=100; // The previous rendered frame is now older than the new trigger.
 const result=c.playAnimation('Action',{mode:'once',restart:true}),settled=vi.fn();
 void result.then(settled);
 advance(950);await Promise.resolve();expect(settled).not.toHaveBeenCalled();
 advance(100);await expect(result).resolves.toBe('completed');
});

it('samples the configured click dialogue pool and resumes the base loop',async()=>{
 const random=Math.random;let selection:number|undefined;
 vi.spyOn(Math,'random').mockImplementation(()=>selection??random());
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],ambient:{animations:['Action']},dialogue:{click:{animation:'Action',animations:['Action','Other'],lines:['Hello']}}});resources.push(c);
 selection=.99;
 const canvas=host.querySelector('canvas')!;
 canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
 expect(c.diagnostics().activeAnimation).toBe('Other');
 advance(1200);expect(c.status).toBe('running');expect(c.diagnostics().activeAnimation).toBe('Action');
});

it('finishes entry despite expired speech and repeated clicks, then returns to Idle',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},
  animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],ambient:{animations:['Action']},
  dialogue:{enter:{animation:'Other',lines:['Hello'],durationMs:50,delayMs:0},click:{animation:'Other',lines:['Hi']}}});resources.push(c);
 expect(c.diagnostics().activeAnimation).toBe('Other');
 advance(600);
 expect(host.querySelector<HTMLElement>('.model-widget__bubble')?.hidden).toBe(true);
 const canvas=host.querySelector('canvas')!;
 for(let i=0;i<4;i++){
  canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:i}));
  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:i}));
 }
 advance(200);expect(c.diagnostics().activeAnimation).toBe('Other');
 advance(400);expect(c.diagnostics().activeAnimation).toBe('Action');
});

it('does not restart a click response when clicked again before it finishes',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},
  animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],ambient:{animations:['Action']},
  interactions:{click:{animation:'Other'}}});resources.push(c);
 const canvas=host.querySelector('canvas')!;
 const click=()=>{canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));};
 click();advance(600);click();advance(600);
 expect(c.diagnostics().activeAnimation).toBe('Action');
});

it('rejects missing, duplicate and empty animation pools before loading',()=>{
 const config={model:'test.vrm',fallback:'fallback.png',animations:[{name:'Action',url:'a.vrma'}]};
 for(const animations of [[],['Missing'],['Action','Action']])expect(()=>validateVrmWidgetConfig({...config,dialogue:{click:{animation:'Action',animations,lines:['Hi']}}})).toThrow('pool');
});

it('suspends both head and eye pointer following throughout a gesture, then resumes in Idle',async()=>{
 const host=document.createElement('div');document.body.append(host);
 vi.spyOn(host,'getBoundingClientRect').mockReturnValue(new DOMRect(100,100,320,480));
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},
  animations:[{name:'Idle',url:'idle.vrma'},{name:'Gesture',url:'gesture.vrma'}],ambient:{animations:['Idle']}});resources.push(c);
 c.setPointerPosition(10000,-10000);advance(400);
 const idle=c.diagnostics().gaze!;
 expect(Math.abs(idle.headYawDegrees)).toBeGreaterThan(1);expect(Math.abs(idle.yawDegrees)).toBeGreaterThan(1);
 const result=c.playAnimation('Gesture',{mode:'once',restart:true});advance(100);
 const pose=scene.children[1]!.quaternion.clone();
 for(const [x,y] of [[-10000,10000],[10000,-10000]]){
  c.setPointerPosition(x!,y!);advance(300);
  expect(c.diagnostics().gaze).toEqual({headYawDegrees:0,headPitchDegrees:0,yawDegrees:0,pitchDegrees:0});
  expect(scene.children[1]!.quaternion.angleTo(pose)).toBeCloseTo(0);
 }
 advance(400);await expect(result).resolves.toBe('completed');
 expect(c.diagnostics().activeAnimation).toBe('Idle');
 c.setPointerPosition(-10000,10000);advance(400);
 expect(c.diagnostics().gaze!.headYawDegrees * idle.headYawDegrees).toBeLessThan(0);
 expect(Math.abs(c.diagnostics().gaze!.yawDegrees)).toBeGreaterThan(1);
});


it('emits growing transparent viewport bounds while keeping the logical host and portrait distance fixed',async()=>{
 const host=document.createElement('div');document.body.append(host);
 vi.spyOn(host,'getBoundingClientRect').mockReturnValue(new DOMRect(100,100,320,480));
 const viewports:any[]=[],onViewport=(event:Event)=>viewports.push((event as CustomEvent).detail);
 document.body.addEventListener('model-viewport-change',onViewport);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},interactions:{pointer:false},animations:[{name:'Action',url:'a.vrma'}]});resources.push(c);
 expect(viewports[0]).toEqual({left:0,top:0,width:320,height:480,baseWidth:320,baseHeight:480});
 const initial=c.diagnostics().framing!,canvas=host.querySelector('canvas')!;
 void c.playAnimation('Action',{mode:'once'});advance(600);
 const gesture=c.diagnostics().framing!;
 expect(gesture.viewport.width).toBeGreaterThan(320);expect(gesture.distance).toBe(initial.distance);
 expect(gesture.maxAbsX).toBeLessThan(1);expect(gesture.maxAbsY).toBeLessThan(1);
 expect(canvas.style.width).toBe(`${gesture.viewport.width}px`);expect(canvas.style.left).toBe(`${gesture.viewport.left}px`);
 expect(host.style.width).toBe('320px');expect(host.style.height).toBe('480px');
 advance(600);expect(c.diagnostics().framing!.viewport).toEqual(gesture.viewport);
 const count=viewports.length;c.resetCamera();expect(viewports).toHaveLength(count);
 expect(c.diagnostics().framing!.distance).toBe(initial.distance);
 c.destroy();expect(viewports.at(-1)).toEqual(viewports[0]);
 document.body.removeEventListener('model-viewport-change',onViewport);
});

it('keeps the original viewport when transparent gesture expansion is disabled',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},render:{autoFit:false},interactions:{pointer:false},animations:[{name:'Action',url:'a.vrma'}]});resources.push(c);
 void c.playAnimation('Action',{mode:'once'});advance(600);
 expect(c.diagnostics().framing!.viewport).toEqual({left:0,top:0,width:320,height:480,baseWidth:320,baseHeight:480});
 expect(c.diagnostics().framing!.maxAbsX).toBeGreaterThan(1);
});


it('preserves pointer gaze when an unrelated posed limb expands the transparent surface',async()=>{
 const host=document.createElement('div');document.body.append(host);
 vi.spyOn(host,'getBoundingClientRect').mockReturnValue(new DOMRect(100,100,320,480));
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},ambient:{animations:[]}});resources.push(c);
 c.setPointerPosition(300,300);advance(1500);
 const gaze=c.diagnostics().gaze!,viewport=c.diagnostics().framing!.viewport;
 scene.getObjectByName('body')!.position.x=2;advance(1500);
 expect(c.diagnostics().framing!.viewport.width).toBeGreaterThan(viewport.width);
 for(const field of ['yawDegrees','pitchDegrees','headYawDegrees','headPitchDegrees'] as const) expect(c.diagnostics().gaze![field]).toBeCloseTo(gaze[field],3);
});

it('prefetches at most four animations alongside the model and preserves configured clip order',async()=>{
 const requested:string[]=[];let active=0,maximum=0,releaseModel!:(response:Response)=>void;
 vi.stubGlobal('fetch',async(url:string)=>{
  requested.push(url);
  if(url.endsWith('.vrm'))return new Promise<Response>(resolve=>{releaseModel=resolve});
  maximum=Math.max(maximum,++active);
  await new Promise(resolve=>setTimeout(resolve,5));active--;
  return new Response(new Uint8Array([1]));
 });
 const host=document.createElement('div');document.body.append(host);
 const animations=Array.from({length:7},(_,index)=>({name:`Clip${index}`,url:`${index}.vrma`}));
 const loading=mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations});
 expect(requested).toEqual(['test.vrm','0.vrma','1.vrma','2.vrma','3.vrma']);
 releaseModel(new Response(model()));const c=await loading;resources.push(c);
 expect(maximum).toBe(4);expect(c.status).toBe('running');
 expect(c.getAnimations().map(clip=>clip.name)).toEqual([...animations.map(clip=>clip.name),'StarLiteIdle']);
});

it('aborts remaining downloads and does not start queued clips after an asset fails',async()=>{
 const requested:string[]=[],signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
  requested.push(url);const signal=options.signal as AbortSignal;signals.push(signal);
  if(url.endsWith('.vrm'))return new Response(model());
  if(url==='0.vrma')return new Response('',{status:503});
  return new Promise<Response>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 });
 const host=document.createElement('div');document.body.append(host);const error=vi.fn();host.addEventListener('model-error',error);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},animations:Array.from({length:7},(_,index)=>({name:`Clip${index}`,url:`${index}.vrma`}))});resources.push(c);
 expect(c.status).toBe('fallback');expect(error).toHaveBeenCalledOnce();expect(frames.size).toBe(0);
 expect(requested).toEqual(['test.vrm','0.vrma','1.vrma','2.vrma','3.vrma']);
 expect(signals.every(signal=>signal.aborted)).toBe(true);
});

it('lets a queued page task run between animation retargeting tasks',async()=>{
 const events:string[]=[];
 onAnimationParse=()=>{events.push('parse');if(events.length===1)setTimeout(()=>events.push('page input'),0)};
 await mount('vrm');expect(events).toEqual(['parse','page input','parse']);
});

it('waits for shader compilation before its first rendered frame',async()=>{
 let release!:()=>void;compileGate=new Promise<void>(resolve=>{release=resolve});
 const host=document.createElement('div');document.body.append(host);
 const loading=mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true}});
 await vi.waitFor(()=>expect(compileCalls).toBe(1));
 expect(host.dataset.modelStatus).toBe('loading');expect(renderCalls).toBe(0);expect(frames.size).toBe(0);
 release();const c=await loading;resources.push(c);
 expect(c.status).toBe('running');expect(renderCalls).toBe(1);
});

it('does not resurrect a cancelled instance when shader compilation finishes late',async()=>{
 let release!:()=>void;compileGate=new Promise<void>(resolve=>{release=resolve});
 const abort=new AbortController(),host=document.createElement('div');document.body.append(host);
 const loading=mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true}},{signal:abort.signal});
 await vi.waitFor(()=>expect(compileCalls).toBe(1));abort.abort();release();
 const c=await loading;resources.push(c);
 expect(c.status).toBe('destroyed');expect(renderCalls).toBe(0);expect(frames.size).toBe(0);expect(host.querySelector('canvas')).toBeNull();
});

it('shows the timeout fallback while non-abortable shader compilation is still pending',async()=>{
 vi.useFakeTimers();
 try{
  let release!:()=>void;compileGate=new Promise<void>(resolve=>{release=resolve});
  const host=document.createElement('div');document.body.append(host);const error=vi.fn();host.addEventListener('model-error',error);
  const loading=mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},network:{requestTimeoutMs:100}});
  await vi.waitFor(()=>expect(compileCalls).toBe(1));vi.advanceTimersByTime(100);
  expect(host.dataset.modelStatus).toBe('fallback');expect(host.querySelector('canvas')?.hidden).toBe(true);expect(error).toHaveBeenCalledOnce();
  expect((error.mock.calls[0]![0] as CustomEvent).detail).toBe('model loading timed out');
  release();const c=await loading;resources.push(c);
  expect(c.status).toBe('fallback');expect(renderCalls).toBe(0);expect(error).toHaveBeenCalledOnce();expect(frames.size).toBe(0);
 }finally{vi.useRealTimers()}
});

it('resumes after document hiding without advancing through hidden time',async()=>{
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 const c=await mount('vrm'),result=c.playAnimation('Action');advance(200);
 visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));
 expect(c.status).toBe('paused');expect(frames.size).toBe(0);advance(5000);
 visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));
 expect(c.status).toBe('running');advance(1000);await expect(result).resolves.toBe('completed');
});

it('reports a rendering failure once and keeps fallback terminal across visibility and resume',async()=>{
 const host=document.createElement('div');document.body.append(host);const error=vi.fn();host.addEventListener('model-error',error);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true}});resources.push(c);
 throwMaterial=true;advance(100);
 expect(c.status).toBe('fallback');expect(error).toHaveBeenCalledOnce();expect((error.mock.calls[0]![0] as CustomEvent).detail).toBe('material update failed');
 expect(frames.size).toBe(0);expect(host.querySelector('canvas')?.hidden).toBe(true);
 c.resume();document.dispatchEvent(new Event('visibilitychange'));advance(1000);
 expect(c.status).toBe('fallback');expect(error).toHaveBeenCalledOnce();expect(frames.size).toBe(0);
});

it('observes one native page click through the model and shows its animation-bound dialogue',async()=>{
 const host=document.createElement('div'),button=document.createElement('button');document.body.append(button,host);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',mobile:{show:true},
  animations:[{name:'Action',url:'a.vrma'},{name:'Other',url:'b.vrma'}],ambient:{animations:['Action']},
  interactions:{passThrough:true},dialogue:{click:{animation:'Other',lines:['Hello from Other']}}});resources.push(c);
 const canvas=host.querySelector('canvas')!;
 vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue(new DOMRect(100,100,320,480));
 const pageClick=vi.fn();button.addEventListener('click',pageClick);
 expect(host.hasAttribute('data-model-pass-through')).toBe(true);
 const click=()=>{
  const init={clientX:150,clientY:150,button:0,pointerId:1,isPrimary:true,bubbles:true,cancelable:true};
  button.dispatchEvent(new PointerEvent('pointerdown',init));button.dispatchEvent(new PointerEvent('pointerup',init));
  const event=new MouseEvent('click',{...init,detail:1});button.dispatchEvent(event);return event;
 };
 expect(click().defaultPrevented).toBe(false);expect(pageClick).toHaveBeenCalledOnce();
 expect(c.diagnostics().activeAnimation).toBe('Other');expect(host.querySelector('.model-widget__bubble')?.textContent).toBe('Hello from Other');
 c.destroy();expect(host.hasAttribute('data-model-pass-through')).toBe(false);
 expect(click().defaultPrevented).toBe(false);expect(pageClick).toHaveBeenCalledTimes(2);expect(c.status).toBe('destroyed');
});
it('rejects a pass-through drag conflict before requesting a model',async()=>{
 await expect(mountModelWidget(document.createElement('div'),{model:'test.vrm',fallback:'fallback.png',interactions:{passThrough:true,drag:true}})).rejects.toThrow('passThrough and drag');
 expect(()=>validateVrmWidgetConfig({model:'test.vrm',fallback:'fallback.png',interactions:{passThrough:'yes' as unknown as boolean}})).toThrow('must be boolean');
});
it('rejects a remote null profile instead of silently ignoring it',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>new Response(url==='profile.json'?'null':model()));
 const host=document.createElement('div');document.body.append(host);const error=vi.fn();host.addEventListener('model-error',error);
 const c=await mountModelWidget(host,{model:'test.vrm',fallback:'fallback.png',profile:'profile.json',mobile:{show:true}});resources.push(c);
 expect(c.status).toBe('fallback');expect(error).toHaveBeenCalledOnce();expect((error.mock.calls[0]![0] as CustomEvent).detail).toBe('invalid character profile');
});
