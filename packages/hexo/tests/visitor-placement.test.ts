import {expect,it,vi} from "vitest";
import {Window} from "happy-dom";
import {createVisitorPlacement} from "../src/visitor-placement";

function harness(width=1360,height=900,saved?:{x:number;y:number},display={width:260,height:390}) {
  const win=new Window({width,height});
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
