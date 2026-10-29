// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { framePortrait, sampleBubbleAnchor } from "../src/camera.js";
afterEach(()=>vi.restoreAllMocks());
it("samples visible alpha once in host CSS pixels, ignoring transparent quads and DPR",()=>{
 const canvas=document.createElement("canvas");canvas.width=1152;canvas.height=1344;
 const bounds=new Box3(new Vector3(-.4,0,-.2),new Vector3(.4,1.8,.2)),camera=new PerspectiveCamera();
 framePortrait(camera,bounds,2/3,{fitPadding:.9},{targetHeight:.53,pitchDegrees:5});
 const read=vi.fn((x,y,w,h)=>{const data=new Uint8ClampedArray(w*h*4);data[3]=0;data[(128*w+100)*4+3]=255;return {data}});
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage:vi.fn(),getImageData:read} as any);
 const point=sampleBubbleAnchor(canvas,{left:-128,top:-64,width:576,height:672,baseWidth:320,baseHeight:480},camera,bounds)!;
 const projected=point.clone().project(camera);expect((1-projected.y)*240).toBeCloseTo(104);expect((projected.x+1)*160).toBeCloseTo(160);
 expect(read).toHaveBeenCalledOnce();expect(read.mock.calls[0]![3]).toBe(512);
 // A resized portrait reprojects the stored world point, with no extra sampling.
 expect((1-point.clone().project(camera).y)*480).toBeCloseTo(208);expect(read).toHaveBeenCalledOnce();
});
it("falls back to geometry for empty or unreadable pixels",()=>{
 const canvas=document.createElement("canvas"),camera=new PerspectiveCamera(),bounds=new Box3(new Vector3(-1,-1,-1),new Vector3(1,1,1));
 const viewport={left:0,top:0,width:320,height:480,baseWidth:320,baseHeight:480};
 const get=vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(300*150*4)})} as any);
 expect(sampleBubbleAnchor(canvas,viewport,camera,bounds)).toBeUndefined();
 get.mockReturnValue({drawImage(){throw Error("unreadable")}} as any);expect(sampleBubbleAnchor(canvas,viewport,camera,bounds)).toBeUndefined();
});
