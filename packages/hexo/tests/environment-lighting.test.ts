import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {createBootstrapSource} from "../src/bootstrap";
import {createEnvironmentLighting} from "../src/environment-lighting-browser";
import {readEnabledConfig} from "../src/config";
import {resolveDefaultPreset} from "../src/default-preset";
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const author={color:"#ffe6cc",darkColor:"#adc6ff",strength:.4};
function harness(lighting: typeof author | {color:string; darkColor?:string; strength?:number; brightness?:number; darkBrightness?:number} = author) {
 const win=new Window({url:"https://example.test/"});
 Object.defineProperty(win.document,"readyState",{value:"complete"});
 Object.defineProperty(win.document,"visibilityState",{value:"visible"});
 const mobile={matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 const theme={matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 win.matchMedia=vi.fn(query=>query.includes("prefers-color-scheme")?theme:mobile) as any;
 const idle:(()=>void)[]=[];(win as any).requestIdleCallback=(fn:()=>void)=>idle.push(fn);
 const controller={status:"running",destroy:vi.fn(),setEnvironmentLighting:vi.fn()};
 const mount=vi.fn(async(..._args:any[])=>controller),load=vi.fn(async()=>({mountModelWidget:mount}));
 const options={entryUrl:"/runtime.js",config:{backend:"vrm" as const,model:"/avatar.vrm",fallback:"/fallback.svg"},environmentLighting:lighting,breakpoint:768,showOnMobile:false};
 const source=createBootstrapSource(options).replace("import(entryUrl.href)","load(entryUrl.href)");
 const evaluate=()=>new Function("globalThis","document","load",source)(win,win.document,load);
 evaluate();
 return {win,mobile,theme,controller,mount,load,evaluate,run:async()=>{idle.shift()?.();await tick()}};
}
it("starts in the actual theme, switches live without remount or mutating author defaults",async()=>{
 const h=harness();h.win.document.documentElement.dataset.theme="dark";await h.run();
 expect(h.mount.mock.calls[0]![1].environmentLighting).toEqual({color:author.darkColor,strength:.4});
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.4});
 h.win.document.documentElement.dataset.theme="light";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,strength:.4});
 h.theme.matches=true;h.theme.addEventListener.mock.calls[0]![1]();
 expect(h.controller.setEnvironmentLighting).toHaveBeenCalledTimes(2); // Explicit theme wins over OS.
 delete h.win.document.documentElement.dataset.theme;await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.4});
 expect(author).toEqual({color:"#ffe6cc",darkColor:"#adc6ff",strength:.4});expect(h.mount).toHaveBeenCalledOnce();
 (h.win as any).__hexoStarLiteWidgetState.environmentLighting.destroy();await h.win.happyDOM.close();
});
it("keeps one observer through PJAX/re-evaluation, and removes it when mobile hides the model",async()=>{
 const h=harness();await h.run();h.evaluate();h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 expect(h.theme.addEventListener).toHaveBeenCalledOnce();expect(h.mount).toHaveBeenCalledOnce();
 const replacement=h.win.document.createElement("body");replacement.dataset.userColorScheme="dark";h.win.document.body.replaceWith(replacement);await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.4});
 h.mobile.matches=true;h.mobile.addEventListener.mock.calls[0]![1]();await h.run();
 expect(h.theme.removeEventListener).toHaveBeenCalledOnce();expect(h.controller.destroy).toHaveBeenCalledOnce();
 const calls=h.controller.setEnvironmentLighting.mock.calls.length;replacement.dataset.userColorScheme="light";await tick();expect(h.controller.setEnvironmentLighting).toHaveBeenCalledTimes(calls);
 await h.win.happyDOM.close();
});
it("switches explicit per-theme brightness without remounting and preserves the author input",async()=>{
 const lighting={...author,brightness:1.05,darkBrightness:.85},h=harness(lighting);await h.run();
 expect(h.mount.mock.calls[0]![1].environmentLighting).toEqual({color:author.color,strength:.4,brightness:1.05});
 h.win.document.documentElement.dataset.theme="dark";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.4,brightness:.85});
 h.evaluate();h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 expect(h.mount).toHaveBeenCalledOnce();expect(h.theme.addEventListener).toHaveBeenCalledOnce();
 h.win.document.documentElement.dataset.theme="light";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,strength:.4,brightness:1.05});
 expect(lighting).toEqual({...author,brightness:1.05,darkBrightness:.85});
 (h.win as any).__hexoStarLiteWidgetState.environmentLighting.destroy();await h.win.happyDOM.close();
});
it.each(["light","dark"] as const)("keeps omitted %s-mode brightness automatic rather than inheriting the other mode",async automatic=>{
 const h=harness({...author,...(automatic==="light"?{darkBrightness:.8}:{brightness:1.1})});await h.run();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,strength:.4,...(automatic==="light"?{}:{brightness:1.1})});
 h.win.document.body.className="dark";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.4,...(automatic==="dark"?{}:{brightness:.8})});
 h.win.document.body.className="light";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,strength:.4,...(automatic==="light"?{}:{brightness:1.1})});
 (h.win as any).__hexoStarLiteWidgetState.environmentLighting.destroy();await h.win.happyDOM.close();
});
it.each(["brightness","darkBrightness"] as const)("tracks %s without a separate dark colour and releases the listener",async key=>{
 const h=harness({color:author.color,[key]:.9});await h.run();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,...(key==="brightness"?{brightness:.9}:{})});
 h.theme.matches=true;h.theme.addEventListener.mock.calls[0]![1]();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.color,...(key==="darkBrightness"?{brightness:.9}:{})});
 h.mobile.matches=true;h.mobile.addEventListener.mock.calls[0]![1]();await h.run();
 expect(h.theme.removeEventListener).toHaveBeenCalledOnce();expect(h.controller.destroy).toHaveBeenCalledOnce();
 await h.win.happyDOM.close();
});
it("does not install theme tracking before a pending mount settles or when that mount is cancelled",async()=>{
 const h=harness();let resolve!:(value:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>resolve=r));await h.run();
 expect(h.theme.addEventListener).not.toHaveBeenCalled();h.mobile.matches=true;h.mobile.addEventListener.mock.calls[0]![1]();await h.run();
 resolve(h.controller);await tick();expect(h.controller.destroy).toHaveBeenCalledOnce();expect(h.theme.addEventListener).not.toHaveBeenCalled();await h.win.happyDOM.close();
});
it("releases theme tracking on a runtime fallback",async()=>{
 const h=harness();await h.run();const state=(h.win as any).__hexoStarLiteWidgetState;
 const cleanup=vi.spyOn(state.environmentLighting,"destroy");state.host.dataset.modelStatus="fallback";await tick();
 expect(cleanup).toHaveBeenCalledOnce();expect(h.theme.removeEventListener).toHaveBeenCalledOnce();h.win.clearTimeout(state.retryTimer);await h.win.happyDOM.close();
});
it.each(["data-theme","data-color-mode","data-user-color-scheme"])("recognizes explicit %s and keeps one-colour setups listener-free",async attribute=>{
 const win=new Window(),setEnvironmentLighting=vi.fn();win.document.body.setAttribute(attribute,"dark");
 const light=createEnvironmentLighting(author,win as any);expect(light.current().color).toBe(author.darkColor);light.destroy();
 const media=vi.spyOn(win,"matchMedia"),single=createEnvironmentLighting({color:"#aabbcc"},win as any);single.attach({setEnvironmentLighting});
 expect(media).not.toHaveBeenCalled();expect(setEnvironmentLighting).toHaveBeenLastCalledWith({color:"#aabbcc"});single.destroy();await win.happyDOM.close();
});
it("recognizes theme classes and lets an unsupported theme follow the system",async()=>{
 const win=new Window();win.matchMedia=vi.fn(()=>({matches:false})) as any;
 win.document.documentElement.className="dark";const light=createEnvironmentLighting(author,win as any);expect(light.current().color).toBe(author.darkColor);
 win.document.documentElement.className="light-mode";expect(light.current().color).toBe(author.color);
 win.document.documentElement.className="custom";expect(light.current().color).toBe(author.color);light.destroy();await win.happyDOM.close();
});
function config(value:unknown,backend="vrm") {return readEnabledConfig({config:{starlite:{enable:true,backend,model:"/avatar.vrm",fallback:"/fallback.svg",environmentLighting:value}}} as any)}
it("forwards separate theme colours but only the selected hint to the VRM runtime",()=>{
 expect(config(author)).toMatchObject({environmentLighting:author,widget:{environmentLighting:{color:author.color,strength:.4}}});
 expect((config(author)!.widget as any).environmentLighting).not.toHaveProperty("darkColor");
 expect(config(undefined)).not.toHaveProperty("environmentLighting");
 expect(config({color:"#000000",strength:0})!.widget).toHaveProperty("environmentLighting",{color:"#000000",strength:0});
});
it("accepts 0–200% strength without changing explicit values or adding a lighting default to an unconfigured model",()=>{
 for(const strength of [0,.2,1,2]) {
  const value={color:author.color,strength};
  expect(config(value)).toMatchObject({environmentLighting:value,widget:{environmentLighting:value}});
 }
 expect(()=>config({color:author.color,strength:2.01})).toThrow("environmentLighting");
 const light={color:author.color};
 expect(config(light)).toMatchObject({environmentLighting:light,widget:{environmentLighting:light}});
 expect((config(light)!.widget as any).environmentLighting).not.toHaveProperty("strength");
 const defaults=resolveDefaultPreset(undefined,"/avatar.vrm");
 expect(defaults).not.toHaveProperty("environmentLighting");
 const selected=resolveDefaultPreset({environmentLighting:light},"/avatar.vrm");
 expect(selected).toHaveProperty("environmentLighting",light);
 expect(light).toEqual({color:author.color});
});
it("leaves omitted strength for the runtime's 100% default and preserves authored 20% across themes",async()=>{
 const h=harness({color:author.color,darkColor:author.darkColor});await h.run();
 expect(h.mount.mock.calls[0]![1].environmentLighting).toEqual({color:author.color});
 h.win.document.documentElement.dataset.theme="dark";await tick();
 expect(h.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor});
 (h.win as any).__hexoStarLiteWidgetState.environmentLighting.destroy();await h.win.happyDOM.close();
 const explicit=harness({color:author.color,darkColor:author.darkColor,strength:.2});await explicit.run();
 explicit.win.document.documentElement.dataset.theme="dark";await tick();
 expect(explicit.controller.setEnvironmentLighting).toHaveBeenLastCalledWith({color:author.darkColor,strength:.2});
 (explicit.win as any).__hexoStarLiteWidgetState.environmentLighting.destroy();await explicit.win.happyDOM.close();
});
it("forwards only light-mode brightness in base runtime config, retaining both modes for bootstrap",()=>{
 const input={...author,brightness:1.1,darkBrightness:.8};
 expect(config(input)).toMatchObject({environmentLighting:input,widget:{environmentLighting:{color:author.color,strength:.4,brightness:1.1}}});
 expect((config(input)!.widget as any).environmentLighting).not.toHaveProperty("darkBrightness");
 const darkOnly={color:author.color,darkBrightness:.9};
 expect(config(darkOnly)).toMatchObject({environmentLighting:darkOnly,widget:{environmentLighting:{color:author.color}}});
 expect((config(darkOnly)!.widget as any).environmentLighting).not.toHaveProperty("brightness");
});
it.each(["brightness","darkBrightness"] as const)("rejects invalid %s and accepts closed bounds",key=>{
 for(const value of [null,"1",NaN,Infinity,-Infinity,.7999,1.1001,false]) expect(()=>config({color:author.color,[key]:value})).toThrow("environmentLighting");
 for(const value of [.8,1,1.1]) expect(config({color:author.color,[key]:value})!.environmentLighting).toHaveProperty(key,value);
});
it.each([false,null,[],{},"#ffffff",{color:"red"},{color:"#ffffff",darkColor:"#000"},{color:"#ffffff",darkColor:null},{color:"#ffffff",strength:NaN},{color:"#ffffff",strength:2.01},{color:"#ffffff",source:"screen"}])("rejects malformed author config %j",value=>expect(()=>config(value)).toThrow("environmentLighting"));
it("rejects the unsupported Inochi2D lighting option explicitly",()=>expect(()=>config(author,"inochi2d")).toThrow("VRM backend"));
