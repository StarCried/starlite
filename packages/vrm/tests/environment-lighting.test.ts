import { expect, it } from "vitest";
import { Color } from "three";
import { EnvironmentLight } from "../src/environment-lighting.js";
it("keeps original lighting by default and at zero strength",()=>{
 const e=new EnvironmentLight(); const sky=e.light.color.clone(),ground=e.light.groundColor.clone();
 e.set({color:"#ff0000",strength:0});e.update(.1);
 expect(e.light.color).toEqual(sky);expect(e.light.groundColor).toEqual(ground);expect(e.light.intensity).toBe(.65);
});
it("interprets RGB in linear space, bounds dark/saturated input and changes smoothly",()=>{
 const e=new EnvironmentLight();e.set({color:"#808080",strength:1},true);
 const linear=new Color("#808080").r*.55+.45;expect(e.light.color.r).toBeCloseTo(linear);
 e.set({color:"#ff0000",strength:1});const previous=e.light.color.clone();e.update(0);expect(e.light.color).toEqual(previous);
 e.update(.016);expect(e.light.color.r).toBeGreaterThan(previous.r);expect(e.light.color.r).toBeLessThan(1);
 for(let i=0;i<100;i++)e.update(.1);
 expect(e.light.color.r).toBeCloseTo(1);expect(e.light.color.g).toBeCloseTo(.45);
 e.set({color:"#000000",strength:1},true);expect(e.light.color.r).toBeCloseTo(.45);
});
it("restores the exact baseline, ignores invalid elapsed time and rejects mutation on invalid input",()=>{
 const e=new EnvironmentLight(),base=e.light.groundColor.clone();e.set({color:"#00ffff"},true);const tinted=e.light.color.clone();
 e.update(NaN);e.update(-1);expect(e.light.color).toEqual(tinted);
 expect(()=>e.set({color:"#xx0000"})).toThrow();expect(e.light.color).toEqual(tinted);
 e.set(null,true);expect(e.light.color).toEqual(new Color(0xffffff));expect(e.light.groundColor).toEqual(base);
});
