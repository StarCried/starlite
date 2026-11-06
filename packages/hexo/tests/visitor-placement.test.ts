import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {createVisitorPlacement} from "../src/visitor-placement";

function harness(width=1360,height=900,saved?:{x:number;y:number},display={width:260,height:390},client?:{width:number;height:number}) {
  const win=new Window({width,height});
  if(client)Object.defineProperties(win.document.documentElement,{clientWidth:{value:client.width,configurable:true},clientHeight:{value:client.height,configurable:true}});
  const host=win.document.createElement("div");win.document.body.append(host);
  const controller={status:"running",setDisplaySize:vi.fn((w:number,h:number)=>{host.style.width=`${w}px`;host.style.height=`${h}px`;}),setHostPosition:vi.fn(),refreshInteractionMask:vi.fn()};
  const layout=new Function("globalThis","options",`return (${createVisitorPlacement.toString()})(options)`)(win,
    {host,controller,...display,scale:1,position:{right:112,bottom:160,zIndex:20},saved}) as ReturnType<typeof createVisitorPlacement>;
  return {win,host,controller,layout};
}
it("keeps the foot anchor and toolbar stationary through repeated resizing",async()=>{
  const h=harness(),point=h.layout.toolbar;
  for(const scale of [.5,.8,1.2,1.5,1]) {
    h.layout.setScale(scale);
    expect(h.layout.toolbar).toEqual(point);
    expect(h.layout.portrait.left+h.layout.portrait.width/2).toBeCloseTo(point.x);
    expect(h.layout.portrait.top+h.layout.portrait.height).toBeCloseTo(point.y-8);
  }
  expect(h.controller.setHostPosition.mock.calls.every(call=>call[2]?.resetMotion)).toBe(true);await h.win.happyDOM.close();
});

it.each([{width:1,height:480},{width:4096,height:1}])("keeps legal narrow display dimensions at least one pixel: %j",async display=>{
  const h=harness(911,512,undefined,display);h.layout.setScale(.5);
  expect(h.layout.portrait.width).toBeGreaterThanOrEqual(1);expect(h.layout.portrait.height).toBeGreaterThanOrEqual(1);
  for(const [width,height] of h.controller.setDisplaySize.mock.calls){expect(width).toBeGreaterThanOrEqual(1);expect(height).toBeGreaterThanOrEqual(1);}
  await h.win.happyDOM.close();
});
it("adapts the initial portrait to a short laptop viewport while preserving room for controls",async()=>{
  const h=harness(911,512),r=h.layout.portrait;
  expect(r.height).toBeLessThanOrEqual(512*.55);
  expect(r.top).toBeGreaterThanOrEqual(12);
  expect(h.layout.toolbar.y+42).toBeLessThanOrEqual(500);
  await h.win.happyDOM.close();
});
it.each([6,17])("excludes %ipx scrollbars from drag, resize and saved-position bounds",async scrollbar=>{
  const client={width:1360-scrollbar,height:900-scrollbar};
  const h=harness(1360,900,{x:1,y:1},undefined,client);
  for(const scale of [.5,1.5,1]) {
    h.layout.setScale(scale);h.layout.moveTo(1e6,1e6);
    const r=h.layout.portrait,bar=h.layout.toolbar;
    expect(r.left+r.width).toBeLessThanOrEqual(client.width-12);
    expect(bar.x+76).toBeLessThanOrEqual(client.width-12);
    expect(bar.y+42).toBeCloseTo(client.height-12);
  }
  const saved=h.layout.snapshot()!;
  expect(saved).toEqual({x:h.layout.anchor.x/client.width,y:h.layout.anchor.y/client.height});
  const restored=harness(1360,900,saved,undefined,client);
  expect(restored.layout.anchor).toEqual(h.layout.anchor);
  await h.win.happyDOM.close();await restored.win.happyDOM.close();
});
it("uses the scrollbar-reduced minimum height when reflowing",async()=>{
  const h=harness(193,92,{x:1,y:1},undefined,{width:176,height:75});
  expect(h.layout.portrait.top).toBeCloseTo(12);expect(h.layout.portrait.height).toBeCloseTo(1);
  expect(h.layout.toolbar).toEqual({x:88,y:21});
  Object.defineProperties(h.win.document.documentElement,{clientWidth:{value:177},clientHeight:{value:76}});h.layout.reflow();
  expect(h.layout.toolbar.x+76).toBeLessThanOrEqual(165);expect(h.layout.toolbar.y+42).toBeLessThanOrEqual(64);
  await h.win.happyDOM.close();
});
it.each([{width:176,height:75},{width:176,height:76},{width:1360,height:75},{width:176,height:900}])("fits the portrait and full toolbar at physical viewport boundaries, including saved corners: %j",async viewport=>{
  for(const display of [{width:260,height:390},{width:1,height:4096},{width:4096,height:1}]) {
    for(const saved of [undefined,{x:0,y:0},{x:1,y:1}]) {
      const h=harness(viewport.width,viewport.height,saved,display);
      const assertBounds=()=>{
        const r=h.layout.portrait,bar=h.layout.toolbar;
        expect(r.width).toBeGreaterThanOrEqual(1);expect(r.height).toBeGreaterThanOrEqual(1);
        expect(r.left).toBeGreaterThanOrEqual(12-1e-8);expect(r.top).toBeGreaterThanOrEqual(12-1e-8);
        expect(r.left+r.width).toBeLessThanOrEqual(viewport.width-12+1e-8);
        expect(bar.x-76).toBeGreaterThanOrEqual(12-1e-8);expect(bar.x+76).toBeLessThanOrEqual(viewport.width-12+1e-8);
        expect(bar.y+42).toBeLessThanOrEqual(viewport.height-12+1e-8);
      };
      assertBounds();
      for(const scale of [.5,1.5,1]) {h.layout.setScale(scale);assertBounds();}
      h.layout.moveTo(-1e6,-1e6);assertBounds();h.layout.moveTo(1e6,1e6);assertBounds();
      await h.win.happyDOM.close();
    }
  }
});
it("reflows a saved position through the minimum viewport and restores its normal-size placement",async()=>{
  const h=harness(1360,900,{x:.6,y:.7}),portrait=h.layout.portrait,saved=h.layout.snapshot();
  h.win.happyDOM.setWindowSize({width:176,height:75});h.layout.reflow();
  expect(h.layout.portrait.top).toBeCloseTo(12);expect(h.layout.portrait.height).toBeCloseTo(1);
  expect(h.layout.toolbar).toEqual({x:88,y:21});expect(h.layout.snapshot()).toEqual(saved);
  h.win.happyDOM.setWindowSize({width:1360,height:900});h.layout.reflow();
  expect(h.layout.portrait).toEqual(portrait);expect(h.layout.snapshot()).toEqual(saved);
  await h.win.happyDOM.close();
});
it("restricts growth at an edge instead of moving controls away from the pointer",async()=>{
  const h=harness();h.layout.moveTo(-100,400);
  const point=h.layout.toolbar,scale=h.layout.scale;
  h.layout.setScale(1.5);
  expect(h.layout.toolbar).toEqual(point);expect(h.layout.scale).toBeCloseTo(scale);
  expect(h.layout.portrait.left).toBeGreaterThanOrEqual(12);await h.win.happyDOM.close();
});
it("clamps all four drag edges and restores saved placement at a different viewport size",async()=>{
  const h=harness();h.layout.moveTo(1e6,1e6);
  expect(h.layout.toolbar.x+76).toBeLessThanOrEqual(1348);
  expect(h.layout.toolbar.y+42).toBeLessThanOrEqual(888);
  const saved=h.layout.snapshot()!;
  const smaller=harness(911,512,saved),r=smaller.layout.portrait;
  expect(r.left).toBeGreaterThanOrEqual(12);expect(r.top).toBeGreaterThanOrEqual(12);
  expect(r.left+r.width).toBeLessThanOrEqual(899);
  expect(smaller.layout.toolbar.y+42).toBeLessThanOrEqual(500);
  smaller.layout.reset();expect(smaller.layout.snapshot()).toBeUndefined();
  await h.win.happyDOM.close();await smaller.win.happyDOM.close();
});
it("a rejected size leaves both the anchor and portrait intact",async()=>{
  const h=harness(),r=h.layout.portrait,style=h.host.style.cssText;
  h.controller.setDisplaySize.mockImplementationOnce(()=>{throw Error("rejected")});
  expect(()=>h.layout.setScale(1.1)).toThrow("rejected");
  expect(h.layout.portrait).toEqual(r);expect(h.host.style.cssText).toBe(style);
  await h.win.happyDOM.close();
});
it("updates host movement for dragging and re-samples a paused model",async()=>{
  const h=harness();h.controller.status="paused";
  h.layout.moveTo(500,600);
  expect(h.controller.setHostPosition).toHaveBeenLastCalledWith(370,210,{resetMotion:false});
  expect(h.controller.refreshInteractionMask).toHaveBeenCalledOnce();
  await h.win.happyDOM.close();
});

it("rebases layout changes before the next real drag instead of adding them to spring movement",async()=>{
  const h=harness();h.layout.moveTo(700,700);h.layout.setScale(.5);
  expect(h.controller.setHostPosition).toHaveBeenLastCalledWith(635,505,{resetMotion:true});
  h.layout.moveTo(701,700);
  expect(h.controller.setHostPosition).toHaveBeenLastCalledWith(636,505,{resetMotion:false});
  h.layout.reset();expect(h.controller.setHostPosition.mock.lastCall?.[2]).toEqual({resetMotion:true});
  await h.win.happyDOM.close();
});
