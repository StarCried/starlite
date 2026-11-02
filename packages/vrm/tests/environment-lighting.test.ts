import { expect, it } from "vitest";
import { Color } from "three";
import { EnvironmentLight } from "../src/environment-lighting.js";
const luminance=(color:Color)=>.2126*color.r+.7152*color.g+.0722*color.b;
const energy=(light:EnvironmentLight)=>light.light.intensity+light.key.intensity;
function baseline(e:EnvironmentLight){
 expect(e.light.color).toEqual(new Color(0xffffff));expect(e.light.groundColor).toEqual(new Color(0xb6c6d5));
 expect(e.light.intensity).toBe(.65);expect(e.key.intensity).toBe(2);expect(e.key.color).toEqual(new Color(0xffffff));
}
it("keeps exact original lighting by default and at zero strength even with explicit brightness",()=>{
 const e=new EnvironmentLight();baseline(e);
 e.set({color:"#ff0000",strength:1,brightness:1.1},true);
 e.set({color:"#000000",strength:0,brightness:.8},true);baseline(e);
 e.set({color:"#ff00ff",strength:1},true);e.set(null,true);baseline(e);
});
it("normalizes chroma independently of luminance and retains the neutral key colour",()=>{
 const e=new EnvironmentLight(),baseGround=luminance(e.light.groundColor);
 for(const color of ["#ff0000","#00ff00","#0000ff","#123456","#ff00ff"]){
  e.set({color,strength:1,brightness:1},true);
  expect(luminance(e.light.color)).toBeCloseTo(1,10);expect(luminance(e.light.groundColor)).toBeCloseTo(baseGround,10);
  expect(Math.max(e.light.color.r,e.light.color.g,e.light.color.b)).toBeLessThanOrEqual(2.0000001);
  expect(energy(e)).toBeCloseTo(2.65,10);expect(e.key.color).toEqual(new Color(0xffffff));expect(e.key.position.toArray()).toEqual([-3,4,2]);
 }
});
it("gives the default strength a useful chromatic contribution without adding lights",()=>{
 const e=new EnvironmentLight();e.set({color:"#ff0000",brightness:1},true);
 expect(e.light.intensity).toBeGreaterThan(1);expect(e.key.intensity).toBeLessThan(1.65);
 const red=e.key.intensity+e.light.intensity*e.light.color.r,green=e.key.intensity+e.light.intensity*e.light.color.g;
 expect(red/green).toBeGreaterThan(1.15);expect(energy(e)).toBeCloseTo(2.65);
});
it("varies achromatic brightness monotonically and within target bounds",()=>{
 const e=new EnvironmentLight();let previous=0;
 for(const color of ["#000000","#101010","#404040","#808080","#b0b0b0","#ffffff"]){
  e.set({color,strength:1},true);const gain=energy(e)/2.65;
  expect(gain).toBeGreaterThanOrEqual(.8-1e-12);expect(gain).toBeLessThanOrEqual(1.1+1e-12);expect(gain).toBeGreaterThan(previous);previous=gain;
  expect(e.light.color).toEqual(new Color(0xffffff));expect(e.light.groundColor).toEqual(new Color(0xb6c6d5));
 }
 e.set({color:"#000000",strength:1},true);expect(e.key.intensity).toBeCloseTo(1.6);expect(e.light.intensity).toBeCloseTo(.52);
 e.set({color:"#ffffff",strength:1},true);expect(e.key.intensity).toBeCloseTo(2.2);expect(e.light.intensity).toBeCloseTo(.715);
 e.set({color:"#000000"},true);expect(energy(e)/2.65).toBeCloseTo(.9024);
 e.set({color:"#ffffff"},true);expect(energy(e)/2.65).toBeCloseTo(1.0488);
});
it("uses an explicit brightness target instead of inferred brightness",()=>{
 const e=new EnvironmentLight();e.set({color:"#000000",strength:1,brightness:1.1},true);expect(energy(e)/2.65).toBeCloseTo(1.1);
 e.set({color:"#ffffff",strength:1,brightness:.8},true);expect(energy(e)/2.65).toBeCloseTo(.8);
 e.set({color:"#000000",brightness:1},true);expect(energy(e)/2.65).toBeCloseTo(1);
 e.set({color:"#000000"},true);expect(energy(e)/2.65).toBeLessThan(1);
});
it("suppresses saturated near-black noise and changes continuously near black",()=>{
 const e=new EnvironmentLight();let previous=1;
 for(const color of ["#000000","#010000","#020000"]){
  e.set({color,strength:1,brightness:1},true);
  expect(e.light.color.r).toBeGreaterThanOrEqual(previous);expect(e.light.color.r-previous).toBeLessThan(.009);
  expect(e.light.intensity-.65).toBeLessThan(.025);previous=e.light.color.r;
 }
 e.set({color:"#010101",strength:1,brightness:1},true);baseline(e);
});
it("smooths colour and both intensities together, and reaches the exact baseline after disabling",()=>{
 const e=new EnvironmentLight();e.set({color:"#0000ff",strength:1,brightness:.8});
 const blue=e.light.color.b,ambient=e.light.intensity,key=e.key.intensity;
 e.update(0);expect(e.light.color.b).toBe(blue);expect(e.key.intensity).toBe(key);
 e.update(.016);expect(e.light.color.b).toBeGreaterThan(blue);expect(e.light.intensity).toBeGreaterThan(ambient);expect(e.key.intensity).toBeLessThan(key);
 for(let i=0;i<100;i++)e.update(.1);expect(energy(e)/2.65).toBeCloseTo(.8);
 e.set(null);expect(e.light.color.b).toBeGreaterThan(1);e.update(.016);expect(e.light.color.b).toBeGreaterThan(1);
 for(let i=0;i<100;i++)e.update(.1);baseline(e);
});
it("ignores invalid time, rejects invalid settings without mutation and bounds resumed interpolation",()=>{
 const e=new EnvironmentLight();e.set({color:"#00ffff",brightness:.8},true);const tinted=e.light.color.clone(),total=energy(e);
 e.update(NaN);e.update(-1);expect(e.light.color).toEqual(tinted);
 for(const value of [{color:"#xx0000"},{color:"#ff0000",brightness:NaN},{color:"#ff0000",brightness:Infinity},{color:"#ff0000",brightness:.79},{color:"#ff0000",brightness:1.11}])expect(()=>e.set(value)).toThrow();
 expect(e.light.color).toEqual(tinted);expect(energy(e)).toBe(total);
 const a=new EnvironmentLight(),b=new EnvironmentLight();a.set({color:"#ff0000"});b.set({color:"#ff0000"});a.update(30);b.update(.1);expect(a.light.color).toEqual(b.light.color);expect(a.key.intensity).toBe(b.key.intensity);
});
