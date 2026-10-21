import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {readPageDialogue} from "../src/page-dialogue-browser";
import {createBootstrapSource} from "../src/bootstrap";

const context={lines:["Page A","Next"],animation:"Wave",triggers:["click","idle"],mode:"replace",order:"sequential"};
function marker(win:Window,path:string,value:unknown=context){
  const node=win.document.createElement("script");node.type="application/json";node.dataset.starlitePageDialogue="";node.textContent=JSON.stringify({path,context:value});win.document.body.append(node);return node;
}
function read(win:Window,root="/"){
  return new Function("document","pathname","root",`return (${readPageDialogue.toString()})(document,pathname,root)`)(win.document,win.location.pathname,root);
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

it("matches the current page under a subdirectory and normalizes Unicode, index and URL decorations",async()=>{
  const win=new Window({url:"https://blog.example/blog/%E6%96%87%E7%AB%A0/?utm=test#part"});
  marker(win,"other/index.html",{...context,lines:["Other"]});marker(win,"文章/index.html");
  expect(read(win,"/blog/")).toEqual({...context,id:"文章/index.html"});
  win.history.replaceState(null,"","/blog/文章/index.html#next");expect(read(win,"/blog/")?.id).toBe("文章/index.html");
  win.history.replaceState(null,"","/outside/文章/");expect(read(win,"/blog/")).toBeNull();
  await win.happyDOM.close();
});
it("does not use article-excerpt markers on an index page or make a network request",async()=>{
  const win=new Window({url:"https://blog.example/"});marker(win,"article/index.html");
  const fetch=vi.spyOn(win,"fetch");expect(read(win)).toBeNull();expect(fetch).not.toHaveBeenCalled();await win.happyDOM.close();
});
it("accepts bounded decoded text even when safe JSON escaping expands its serialized size",async()=>{
  const win=new Window({url:"https://blog.example/a/"}),lines=Array(128).fill("<".repeat(1024));
  const node=marker(win,"a/index.html",{...context,lines});
  node.textContent=node.textContent!.replaceAll("<","\\u003c");
  expect(node.textContent.length).toBeGreaterThan(140*1024);expect(read(win)?.lines).toEqual(lines);
  node.textContent=" ".repeat(1024*1024)+node.textContent;expect(read(win)).toBeNull();
  await win.happyDOM.close();
});
it("bounds normalized path identities in decoded UTF-8 bytes and supports escaped Unicode paths",async()=>{
  const path=`${"文".repeat(679)}/index.html`,win=new Window({url:`https://blog.example/${encodeURI(path)}`});
  marker(win,path);expect(read(win)?.id).toBe(path);
  const tooLong=`${"文".repeat(680)}/index.html`;
  win.history.replaceState(null,"",`/${encodeURI(tooLong)}`);win.document.body.replaceChildren();marker(win,tooLong);expect(read(win)).toBeNull();
  await win.happyDOM.close();
});
it.each([
  {...context,lines:[]},{...context,lines:[" "]},{...context,lines:[42]},{...context,lines:["a".repeat(1025)]},
  {...context,lines:Array(129).fill("A")},{...context,triggers:["enter"]},{...context,triggers:["click","click"]},
  {...context,mode:"other"},{...context,order:"other"},{...context,animation:" "},{...context,script:"alert(1)"},
])("rejects malformed current-page context without using another page's data: %j",async value=>{
  const win=new Window({url:"https://blog.example/a/"});marker(win,"a/index.html",value);marker(win,"b/index.html");
  expect(read(win)).toBeNull();await win.happyDOM.close();
});
it("keeps text literal, rejects malformed paths and conflicting duplicate page data",async()=>{
  const win=new Window({url:"https://blog.example/a/"});const value={...context,lines:['</script><img src=x onerror="alert(1)">']};
  marker(win,"a/index.html",value);expect(read(win)?.lines).toEqual(value.lines);expect(win.document.querySelector("img")).toBeNull();
  const duplicate=marker(win,"a/index.html",value);expect(read(win)?.lines).toEqual(value.lines);
  duplicate.textContent=JSON.stringify({path:"a/index.html",context:{...context,lines:["Conflict"]}});expect(read(win)).toBeNull();
  win.document.body.replaceChildren();marker(win,"%2e%2e/a/index.html");expect(read(win)).toBeNull();
  await win.happyDOM.close();
});

function harness(root="/",mobile=false){
  const win=new Window({url:`https://blog.example${root}a/`}),idle:(()=>void)[]=[];
  Object.defineProperty(win.document,"readyState",{value:"complete",configurable:true});
  Object.defineProperty(win.document,"visibilityState",{value:"visible",configurable:true});
  const media={matches:mobile,addEventListener:vi.fn()};win.matchMedia=vi.fn(()=>media) as any;
  (win as any).requestIdleCallback=(run:()=>void)=>{idle.push(run);return 1;};
  marker(win,"a/index.html");
  const controller={status:"running",destroy:vi.fn(),setDialogueContext:vi.fn()},mount=vi.fn(async(..._args:any[])=>controller),load=vi.fn(async()=>({mountModelWidget:mount}));
  const source=createBootstrapSource({entryUrl:"/runtime.js",pageRoot:root,config:{backend:"vrm",model:"/m.vrm",fallback:"/f.png",dialogue:{enter:{animation:"Wave",lines:["Welcome"]}}},breakpoint:768,showOnMobile:false}).replace("import(entryUrl.href)","load(entryUrl.href)");
  new Function("globalThis","document","load",source)(win,win.document,load);
  const run=async()=>{idle.shift()?.();await tick();};
  const page=async(path:string,value:unknown|undefined=context,event="pjax:complete")=>{
    for(const node of win.document.querySelectorAll("[data-starlite-page-dialogue]"))node.remove();
    win.history.pushState(null,"",`${root}${path}`);
    if(value!==null)marker(win,path,value);
    (event==="popstate"?win:win.document).dispatchEvent(new win.Event(event));await run();
  };
  return{win,media,controller,mount,load,run,page,state:()=> (win as any).__hexoStarLiteWidgetState};
}
it("switches A to B to global and back without remounting, replaying entry or resetting an unchanged page",async()=>{
  const h=harness();await h.run();const first={...context,id:"a/index.html"};
  expect(h.controller.setDialogueContext).toHaveBeenLastCalledWith(first);
  const update=vi.fn();h.state().quickSettings={reattach:vi.fn(),updateDialogueAvailability:update};
  h.win.document.dispatchEvent(new h.win.Event("pjax:complete"));await h.run();expect(h.controller.setDialogueContext).toHaveBeenCalledOnce();
  await h.page("b/",{...context,lines:["B"]});expect(h.controller.setDialogueContext).toHaveBeenLastCalledWith({...context,lines:["B"],id:"b/index.html"});
  await h.page("plain/",null);expect(h.controller.setDialogueContext).toHaveBeenLastCalledWith(null);expect(update).toHaveBeenLastCalledWith(false);
  await h.page("a/",context,"popstate");expect(h.controller.setDialogueContext).toHaveBeenLastCalledWith(first);expect(update).toHaveBeenLastCalledWith(true);
  expect(h.mount).toHaveBeenCalledOnce();expect(h.load).toHaveBeenCalledOnce();expect(h.controller.destroy).not.toHaveBeenCalled();
  expect(h.mount.mock.calls[0]?.[1].dialogue.enter).toEqual({animation:"Wave",lines:["Welcome"]});await h.win.happyDOM.close();
});
it("applies only the latest page when a slow model mount completes after rapid navigation",async()=>{
  const h=harness("/blog/");let finish!:(value:any)=>void;h.mount.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await h.run();
  await h.page("b/",{...context,lines:["B"]});await h.page("c/",{...context,lines:["C"]});
  finish(h.controller);await tick();expect(h.controller.setDialogueContext).toHaveBeenCalledExactlyOnceWith({...context,lines:["C"],id:"c/index.html"});
  expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("disables a rejected page action without failing the model or requesting recovery",async()=>{
  const h=harness();h.controller.setDialogueContext.mockImplementation(value=>{if(value?.animation==="Missing")throw new Error("unknown animation");});await h.run();
  await h.page("b/",{...context,animation:"Missing"});expect(h.controller.setDialogueContext).toHaveBeenLastCalledWith(null);
  expect(h.state().failed).not.toBe(true);expect(h.controller.destroy).not.toHaveBeenCalled();expect(h.mount).toHaveBeenCalledOnce();await h.win.happyDOM.close();
});
it("keeps the mobile import guard ahead of page-context loading",async()=>{
  const h=harness("/",true);await h.run();expect(h.load).not.toHaveBeenCalled();expect(h.mount).not.toHaveBeenCalled();expect(h.controller.setDialogueContext).not.toHaveBeenCalled();
  expect(h.state().dialogueContext).toBeUndefined();await h.win.happyDOM.close();
});
