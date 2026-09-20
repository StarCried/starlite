import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {createBootstrapSource} from "../src/bootstrap";
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(mobile=false,ready="complete") {
 const win=new Window(), idle: (()=>void)[]=[];
 Object.defineProperty(win.document,"readyState",{value:ready,configurable:true});
 win.matchMedia=vi.fn(()=>({matches:mobile})) as any;
 (win as any).requestIdleCallback=(run:any)=>{idle.push(run);return 1};
 const load=vi.fn(), controller={destroy:vi.fn()}, mount=vi.fn(async()=>controller);
 load.mockResolvedValue({mountModelWidget:mount});
 const source=createBootstrapSource({entryUrl:"/runtime.js",config:{backend:"vrm",model:"/m.vrm",fallback:"/fallback.png"},breakpoint:768,showOnMobile:false}).replace("import(options.entryUrl)","load(options.entryUrl)");
 new Function("globalThis","document","load",source)(win,win.document,load);
 return {win,idle,load,mount,controller,run:async()=>{idle.shift()?.();await tick()}};
}
it("waits for the page load and idle opportunity",async()=>{
 const h=harness(false,"loading");expect(h.idle).toHaveLength(0);expect(h.load).not.toHaveBeenCalled();
 h.win.dispatchEvent(new h.win.Event("load"));expect(h.load).not.toHaveBeenCalled();await h.run();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("mobile never imports runtime or mounts a model",async()=>{
 const h=harness(true);await h.run();expect(h.load).not.toHaveBeenCalled();expect(h.win.document.querySelectorAll("[data-inochi2d-widget-host]")).toHaveLength(0);await h.win.happyDOM.close();
});
it("PJAX shares one instance and cancels a detached pending mount",async()=>{
 const h=harness();let finish!:(v:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(r=>finish=r));await h.run();
 h.win.document.querySelector("[data-inochi2d-widget-host]")!.remove();h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();
 const late={destroy:vi.fn()};finish(late);await tick();expect(late.destroy).toHaveBeenCalledOnce();
 h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.mount).toHaveBeenCalledTimes(2);expect(h.win.document.querySelectorAll("[data-inochi2d-widget-host]")).toHaveLength(1);await h.win.happyDOM.close();
});
it("shows a static image when importing the renderer fails",async()=>{
 const h=harness();h.load.mockRejectedValueOnce(new Error("offline"));await h.run();expect(h.win.document.querySelector("img")?.getAttribute("src")).toBe("/fallback.png");await h.win.happyDOM.close();
});
