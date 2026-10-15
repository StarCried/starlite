import {expect,it,vi} from "vitest";
import {Window,type HTMLElement} from "happy-dom";
import {createBootstrapSource} from "../src/bootstrap";
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(mobile=false,ready="complete",entered=false,passThrough=false) {
 const win=new Window({url:"https://blog.example/"}), idle: (()=>void)[]=[];
 Object.defineProperty(win.document,"readyState",{value:ready,configurable:true});
 Object.defineProperty(win.document,"visibilityState",{value:"visible",writable:true,configurable:true});
 Object.defineProperty(win.navigator,"onLine",{value:true,writable:true,configurable:true});
 let now=0, timerId=0;
 const timers=new Map<number,{run:()=>void,delay:number}>();
 win.Date.now=()=>now;
 win.setTimeout=((run:()=>void,delay:number)=>{const id=++timerId;timers.set(id,{run,delay});return id}) as any;
 win.clearTimeout=((id:number)=>{timers.delete(id)}) as any;
 const media={matches:mobile,addEventListener:vi.fn()};
 win.matchMedia=vi.fn(()=>media) as any;
 if(entered) win.sessionStorage.setItem("model-companion:entered:vrm:/m.vrm","1");
 (win as any).requestIdleCallback=(run:any)=>{idle.push(run);return 1};
 const load=vi.fn(), controller={status:"running",destroy:vi.fn()}, mount=vi.fn(async(..._args:any[])=>controller);
 load.mockResolvedValue({mountModelWidget:mount});
 const source=createBootstrapSource({entryUrl:"/runtime.js",config:{backend:"vrm",model:"/m.vrm",fallback:"/fallback.png",interactions:{passThrough},dialogue:{enter:{animation:"Click",lines:["Hello"]}}},breakpoint:768,showOnMobile:false}).replace("import(entryUrl.href)","load(entryUrl.href)");
 new Function("globalThis","document","load",source)(win,win.document,load);
 const run=async()=>{idle.shift()?.();await tick()};
 return {win,media,idle,load,mount,controller,timers,source,run,retry:async()=>{
  const [id,timer]=timers.entries().next().value!;timers.delete(id);now+=timer.delay;timer.run();await run();
 }};
}
it("waits for document parsing and an idle opportunity",async()=>{
 const h=harness(false,"loading");expect(h.idle).toHaveLength(0);expect(h.load).not.toHaveBeenCalled();
 h.win.document.dispatchEvent(new h.win.Event("DOMContentLoaded"));expect(h.load).not.toHaveBeenCalled();await h.run();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("does not wait for pending third-party resources after the body is ready",async()=>{
 const h=harness(false,"interactive");expect(h.idle).toHaveLength(1);expect(h.load).not.toHaveBeenCalled();
 await h.run();expect(h.mount).toHaveBeenCalledOnce();
 h.win.dispatchEvent(new h.win.Event("load"));expect(h.idle).toHaveLength(0);expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("mobile never imports runtime or mounts a model",async()=>{
 const h=harness(true);await h.run();expect(h.load).not.toHaveBeenCalled();expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(0);await h.win.happyDOM.close();
});
it("PJAX reattaches the same pending canvas and removes incoming duplicate hosts",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 const original=h.win.document.querySelector("[data-starlite-widget-host]")!; original.remove();
 const incoming=h.win.document.createElement("div");incoming.setAttribute("data-starlite-widget-host","");h.win.document.body.append(incoming);h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 const late={destroy:vi.fn()};finish(late);await tick();expect(late.destroy).not.toHaveBeenCalled();expect(original.isConnected).toBe(true);expect(incoming.isConnected).toBe(false);
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.mount).toHaveBeenCalledTimes(1);expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(1);await h.win.happyDOM.close();
});
it("reattaches a ready instance synchronously rather than waiting for idle after PJAX",async()=>{
 const h=harness();await h.run();
 const host=h.win.document.querySelector("[data-starlite-widget-host]")!;
 host.remove();h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));
 expect(host.isConnected).toBe(true);expect(h.idle).toHaveLength(0);expect(h.mount).toHaveBeenCalledOnce();
 await h.win.happyDOM.close();
});
it("hides import failures without intercepting page clicks and restores a successful retry",async()=>{
 const h=harness(false,"complete",false,true);h.load.mockRejectedValueOnce(new Error("offline"));await h.run();
 const failed=h.win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
 expect(failed.style.visibility).toBe("hidden");expect(failed.style.pointerEvents).toBe("none");expect(failed.querySelector("img")).toBeNull();
 expect([...h.timers.values()].map(t=>t.delay)).toEqual([2000]);
 expect(h.win.sessionStorage.getItem("model-companion:entered:vrm:/m.vrm")).toBeNull();
 await h.retry();
 const recovered=h.win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
 expect(recovered).not.toBe(failed);expect(recovered.style.visibility).toBe("");expect(recovered.style.pointerEvents).toBe("none");
 expect(h.load.mock.calls.map(call=>call[0])).toEqual(["https://blog.example/runtime.js","https://blog.example/runtime.js?starlite-retry=1"]);
 expect(h.mount).toHaveBeenCalledOnce();expect(h.timers.size).toBe(0);
 expect(h.win.sessionStorage.getItem("model-companion:entered:vrm:/m.vrm")).toBe("1");await h.win.happyDOM.close();
});

it("disposes a controller that resolves in fallback and recovers without requiring a page refresh",async()=>{
 const h=harness();const failed={status:"fallback",destroy:vi.fn()};h.mount.mockResolvedValueOnce(failed);await h.run();
 expect(failed.destroy).toHaveBeenCalledOnce();expect(h.timers.size).toBe(1);
 await h.retry();expect(h.mount).toHaveBeenCalledTimes(2);expect(h.controller.destroy).not.toHaveBeenCalled();await h.win.happyDOM.close();
});

it.each(["modelStatus","inochi2dStatus"])("recovers runtime %s failures even without an error event",async(status)=>{
 const h=harness();await h.run();const host=h.win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
 host.dataset[status]="fallback";await tick();
 expect(host.style.visibility).toBe("hidden");expect(host.style.pointerEvents).toBe("none");expect(h.controller.destroy).toHaveBeenCalledOnce();
 await h.retry();expect(h.mount).toHaveBeenCalledTimes(2);expect(h.mount.mock.calls[1]?.[1].dialogue.enter).toBe(false);await h.win.happyDOM.close();
});

it("recovers from a timeout before the old mount settles and isolates its late destruction",async()=>{
 const h=harness();let finish!:(value:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));await h.run();
 const old=h.win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
 old.dataset.modelStatus="fallback";await tick();expect(h.mount.mock.calls[0]?.[2].signal.aborted).toBe(true);
 const recovered={status:"running",destroy:vi.fn()};h.mount.mockResolvedValueOnce(recovered);await h.retry();
 const current=h.win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
 const late={destroy:vi.fn(()=>{old.dataset.modelStatus="destroyed";old.replaceChildren()})};finish(late);await tick();
 expect(late.destroy).toHaveBeenCalledOnce();expect(recovered.destroy).not.toHaveBeenCalled();expect(current).not.toBe(old);
 expect(current.isConnected).toBe(true);expect(current.style.visibility).toBe("");expect(h.timers.size).toBe(0);await h.win.happyDOM.close();
});

it("bounds repeated failures across PJAX, online and visibility events",async()=>{
 const h=harness();h.load.mockRejectedValue(new Error("unavailable"));await h.run();
 for(const delay of [2000,5000,15000]) {expect([...h.timers.values()].map(t=>t.delay)).toEqual([delay]);await h.retry()}
 expect(h.load).toHaveBeenCalledTimes(4);expect(h.timers.size).toBe(0);
 h.win.dispatchEvent(new h.win.Event("online"));h.win.document.dispatchEvent(new h.win.Event("visibilitychange"));
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 expect(h.load).toHaveBeenCalledTimes(4);expect(h.timers.size).toBe(0);await h.win.happyDOM.close();
});

it("suspends retries while offline or hidden without consuming attempts",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();
 Object.defineProperty(h.win.navigator,"onLine",{value:false});h.win.dispatchEvent(new h.win.Event("offline"));expect(h.timers.size).toBe(0);
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.load).toHaveBeenCalledOnce();
 Object.defineProperty(h.win.document,"visibilityState",{value:"hidden"});Object.defineProperty(h.win.navigator,"onLine",{value:true});
 h.win.dispatchEvent(new h.win.Event("online"));expect(h.timers.size).toBe(0);
 Object.defineProperty(h.win.document,"visibilityState",{value:"visible"});h.win.document.dispatchEvent(new h.win.Event("visibilitychange"));
 expect([...h.timers.values()].map(t=>t.delay)).toEqual([2000]);await h.retry();expect(h.load).toHaveBeenCalledTimes(2);await h.win.happyDOM.close();
});

it("does not consume a retry while its idle callback is delayed in the background",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();
 const [id,timer]=h.timers.entries().next().value!;h.timers.delete(id);timer.run();
 Object.defineProperty(h.win.document,"visibilityState",{value:"hidden"});await h.run();
 const state=(h.win as any).__hexoStarLiteWidgetState;
 expect(h.load).toHaveBeenCalledOnce();expect(state.retryCount).toBe(0);
 Object.defineProperty(h.win.document,"visibilityState",{value:"visible"});h.win.document.dispatchEvent(new h.win.Event("visibilitychange"));await h.run();
 expect(h.load).toHaveBeenCalledTimes(2);expect(state.retryCount).toBe(1);expect(h.timers.size).toBe(0);await h.win.happyDOM.close();
});

it("PJAX and repeated bootstrap evaluation preserve one recovery timer and one ready instance",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();
 const failed=h.win.document.querySelector("[data-starlite-widget-host]")!;failed.remove();
 const duplicate=h.win.document.createElement("div");duplicate.dataset.starliteWidgetHost="";h.win.document.body.append(duplicate);
 new Function("globalThis","document","load",h.source)(h.win,h.win.document,h.load);await h.run();
 expect(h.timers.size).toBe(1);expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(1);
 await h.retry();h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 expect(h.load).toHaveBeenCalledTimes(2);expect(h.mount).toHaveBeenCalledOnce();expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(1);await h.win.happyDOM.close();
});

it("mobile cancels a pending retry and never imports until desktop is restored",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();
 h.media.matches=true;h.media.addEventListener.mock.calls[0]![1]();await h.run();
 expect(h.timers.size).toBe(0);expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(0);
 h.win.dispatchEvent(new h.win.Event("online"));await h.run();expect(h.load).toHaveBeenCalledOnce();
 h.media.matches=false;h.media.addEventListener.mock.calls[0]![1]();await h.run();expect(h.timers.size).toBe(1);
 await h.retry();expect(h.load).toHaveBeenCalledTimes(2);await h.win.happyDOM.close();
});

it("suppresses entrance after a full navigation in the same tab session",async()=>{
 const first=harness();await first.run();expect(first.mount.mock.calls[0]?.[1].dialogue.enter).toBeTruthy();
 expect(first.win.sessionStorage.getItem("model-companion:entered:vrm:/m.vrm")).toBe("1");await first.win.happyDOM.close();
 const next=harness(false,"complete",true);await next.run();expect(next.mount.mock.calls[0]?.[1].dialogue.enter).toBe(false);await next.win.happyDOM.close();
});
it("cancels a pending desktop model when switching to mobile, and can remount",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 h.media.matches=true;h.media.addEventListener.mock.calls[0]![1]();await h.run();
 const late={destroy:vi.fn()};finish(late);await tick();expect(late.destroy).toHaveBeenCalledOnce();
 expect(h.win.document.querySelectorAll("[data-starlite-widget-host]")).toHaveLength(0);
 h.media.matches=false;h.media.addEventListener.mock.calls[0]![1]();await h.run();expect(h.mount).toHaveBeenCalledTimes(2);await h.win.happyDOM.close();
});

it("preserves a load that resolves before PJAX completion reattaches its host",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 const host=h.win.document.querySelector("[data-starlite-widget-host]")!;host.remove();finish(h.controller);await tick();
 expect(host.isConnected).toBe(true);expect(h.controller.destroy).not.toHaveBeenCalled();
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
