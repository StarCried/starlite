import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {createBootstrapSource} from "../src/bootstrap";
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(mobile=false,ready="complete",entered=false) {
 const win=new Window(), idle: (()=>void)[]=[];
 Object.defineProperty(win.document,"readyState",{value:ready,configurable:true});
 const media={matches:mobile,addEventListener:vi.fn()};
 win.matchMedia=vi.fn(()=>media) as any;
 if(entered) win.sessionStorage.setItem("model-companion:entered:vrm:/m.vrm","1");
 (win as any).requestIdleCallback=(run:any)=>{idle.push(run);return 1};
 const load=vi.fn(), controller={destroy:vi.fn()}, mount=vi.fn(async(..._args:any[])=>controller);
 load.mockResolvedValue({mountModelWidget:mount});
 const source=createBootstrapSource({entryUrl:"/runtime.js",config:{backend:"vrm",model:"/m.vrm",fallback:"/fallback.png",dialogue:{enter:{animation:"Click",lines:["Hello"]}}},breakpoint:768,showOnMobile:false}).replace("import(options.entryUrl)","load(options.entryUrl)");
 new Function("globalThis","document","load",source)(win,win.document,load);
 return {win,media,idle,load,mount,controller,run:async()=>{idle.shift()?.();await tick()}};
}
it("waits for the page load and idle opportunity",async()=>{
 const h=harness(false,"loading");expect(h.idle).toHaveLength(0);expect(h.load).not.toHaveBeenCalled();
 h.win.dispatchEvent(new h.win.Event("load"));expect(h.load).not.toHaveBeenCalled();await h.run();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("mobile never imports runtime or mounts a model",async()=>{
 const h=harness(true);await h.run();expect(h.load).not.toHaveBeenCalled();expect(h.win.document.querySelectorAll("[data-inochi2d-widget-host]")).toHaveLength(0);await h.win.happyDOM.close();
});
it("PJAX reattaches the same pending canvas and removes incoming duplicate hosts",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 const original=h.win.document.querySelector("[data-inochi2d-widget-host]")!; original.remove();
 const incoming=h.win.document.createElement("div");incoming.setAttribute("data-inochi2d-widget-host","");h.win.document.body.append(incoming);h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 const late={destroy:vi.fn()};finish(late);await tick();expect(late.destroy).not.toHaveBeenCalled();expect(original.isConnected).toBe(true);expect(incoming.isConnected).toBe(false);
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.mount).toHaveBeenCalledTimes(1);expect(h.win.document.querySelectorAll("[data-inochi2d-widget-host]")).toHaveLength(1);await h.win.happyDOM.close();
});
it("shows a static image when importing the renderer fails",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();expect(h.win.document.querySelector("img")?.getAttribute("src")).toBe("/fallback.png");await h.win.happyDOM.close();
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
 expect(h.win.document.querySelectorAll("[data-inochi2d-widget-host]")).toHaveLength(0);
 h.media.matches=false;h.media.addEventListener.mock.calls[0]![1]();await h.run();expect(h.mount).toHaveBeenCalledTimes(2);await h.win.happyDOM.close();
});

it("preserves a load that resolves before PJAX completion reattaches its host",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 const host=h.win.document.querySelector("[data-inochi2d-widget-host]")!;host.remove();finish(h.controller);await tick();
 expect(host.isConnected).toBe(true);expect(h.controller.destroy).not.toHaveBeenCalled();
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
