import { expect, it } from "vitest";
import type { HexoWidgetConfig } from "../src/types";
import {
  isDefaultPreset,
  resolveDefaultPreset,
  WEIGUANG_ASSETS,
  WEIGUANG_CACHE_DIRECTORY,
  WEIGUANG_POSITION,
  WEIGUANG_VERSION,
} from "../src/default-preset";

const model = "/cache/Weiguang-StarLite-Blog.vrm";
const config = (input: object): HexoWidgetConfig => input as HexoWidgetConfig;
const clickScene = (input: HexoWidgetConfig) => {
  const scene = input.dialogue?.click;
  if (!scene) throw new Error("expected an enabled click scene");
  return scene;
};

it("selects Weiguang only when there is no explicit model, bundle, disabled setting or Inochi2D backend", () => {
  expect(isDefaultPreset()).toBe(true);
  expect(isDefaultPreset({})).toBe(true);
  expect(isDefaultPreset(config({backend:"vrm",enable:true}))).toBe(true);
  for (const input of [{enable:false},{backend:"inochi2d"},{model:"avatar.vrm"},{bundle:"prepared"},
    {model:""},{model:"  "},{model:null},{model:123},{bundle:""},{bundle:null},{bundle:false}]) {
    expect(isDefaultPreset(config(input))).toBe(false);
  }
});

it("pins public assets by immutable release URL, exact byte length and digest", () => {
  expect(WEIGUANG_VERSION).toBe("weiguang-v3.0.0-starlite.1");
  expect(WEIGUANG_CACHE_DIRECTORY).toBe(`node_modules/.cache/hexo-starlite/${WEIGUANG_VERSION}`);
  expect(WEIGUANG_ASSETS.map(asset=>asset.file)).toEqual([
    "Weiguang-StarLite-Blog.vrm", "LICENSE-Weiguang.md", "ASSET-SOURCES.md",
  ]);
  expect(WEIGUANG_ASSETS.map(asset=>asset.bytes)).toEqual([9116328,4399,2595]);
  for (const asset of WEIGUANG_ASSETS) {
    expect(asset.url).toBe(`https://github.com/StarCried/starlite/releases/download/${WEIGUANG_VERSION}/${asset.file}`);
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/u);
  }
});

it("reproduces the accepted blog's display, motion pools, dialogue and timing without external motion files", () => {
  const result=resolveDefaultPreset(undefined,model);
  expect(result).toMatchObject({enable:true,backend:"vrm",model,neutralAnimation:"Idle",
    display:{width:260,height:390},render:{fps:60,maxDevicePixelRatio:1,fitPadding:.92},
    mobile:{show:false,breakpoint:900},position:WEIGUANG_POSITION,
    camera:{yawDegrees:0,pitchDegrees:5,fovDegrees:20,targetHeight:.54},
    gaze:{maxYawDegrees:25,maxPitchDegrees:15,smoothingMs:100},ambient:{animations:["Idle"]},
    interactions:{pointer:true,passThrough:true,drag:false},
    publication:{confirm:true,allowRedistribution:true,sourceSha256:WEIGUANG_ASSETS[0].sha256},
  });
  expect(result).toHaveProperty("embeddedAnimations.length",13);
  expect(result.animations).toBeUndefined();
  expect(result).not.toHaveProperty("profile");
  const click=clickScene(result);
  expect(click.animations).toEqual(["GentleWave","HighFive","HighWave","StumbleAndRecover","PlayfulScare","Thinking","HaveAnIdea","AwkwardHeadScratch"]);
  expect(click.durationMs).toBe(6300);
  expect(Object.keys(click.linesByAnimation!)).toEqual(click.animations);
  expect(click.linesByAnimation!.HighFive).toEqual(["High Five!","耶！"]);
  expect(result.dialogue?.enter).toMatchObject({animation:"RaisedHandWave",delayMs:500,durationMs:6300});
  expect(result.dialogue?.idle).toMatchObject({durationMs:9000,intervalMinMs:60000,intervalMaxMs:120000,
    animations:["Stretch","BackStretch","AbsentmindedWait","Thinking","RaisedHandWave","HaveAnIdea","AwkwardHeadScratch"]});
});

it("deeply overrides individual settings, replaces arrays, and does not mutate input or future presets", () => {
  const input=config({render:{fps:30},camera:{pitchDegrees:2},position:{right:20},
    ambient:{animations:[]},dialogue:{click:{linesByAnimation:{GentleWave:["My welcome"]}}}});
  const original=JSON.stringify(input);
  const result=resolveDefaultPreset(input,model);
  expect(result.render).toEqual({fps:30,maxDevicePixelRatio:1,fitPadding:.92});
  expect(result).toMatchObject({camera:{yawDegrees:0,pitchDegrees:2,fovDegrees:20,targetHeight:.54}});
  expect(result.position).toEqual({right:20,bottom:160});
  expect(result.ambient?.animations).toEqual([]);
  expect(clickScene(result).linesByAnimation!.GentleWave).toEqual(["My welcome"]);
  expect(clickScene(result).linesByAnimation!.HighFive).toEqual(["High Five!","耶！"]);
  (clickScene(result).linesByAnimation!.HighFive as string[]).push("mutated");
  expect(JSON.stringify(input)).toBe(original);
  expect(clickScene(resolveDefaultPreset(undefined,model)).linesByAnimation!.HighFive).toEqual(["High Five!","耶！"]);
});

it("uses shared custom lines instead of inherited animation-bound lines", () => {
  const result=resolveDefaultPreset(config({dialogue:{click:{lines:["Hello"]}}}),model);
  expect(clickScene(result).lines).toEqual(["Hello"]);
  expect(clickScene(result).linesByAnimation).toBeUndefined();
  expect(clickScene(result).animations).toHaveLength(8);
});

it("replaces singular and pooled scene selections and removes unrelated inherited sentence bindings", () => {
  const single=resolveDefaultPreset(config({dialogue:{click:{animation:"HighFive"}}}),model);
  expect(clickScene(single).animation).toBe("HighFive");
  expect(clickScene(single).animations).toBeUndefined();
  expect(clickScene(single).linesByAnimation).toEqual({HighFive:["High Five!","耶！"]});
  const pool=resolveDefaultPreset(config({dialogue:{click:{animations:["HighFive"],linesByAnimation:{HighFive:["Custom"]}}}}),model);
  expect(clickScene(pool).animation).toBeUndefined();
  expect(clickScene(pool).animations).toEqual(["HighFive"]);
  expect(clickScene(pool).linesByAnimation).toEqual({HighFive:["Custom"]});
});

it("respects explicit false settings including disabled inherited click dialogue", () => {
  const result=resolveDefaultPreset(config({interactions:{pointer:false,passThrough:false,click:false},
    mobile:{show:false},dialogue:{enter:false,idle:false},publication:{confirm:false}}),model);
  expect(result.interactions).toMatchObject({pointer:false,passThrough:false,click:false});
  expect(result.dialogue).toEqual({enter:false,idle:false,click:false});
  expect(result.publication?.confirm).toBe(false);
});

it("aligns an interaction click override with inherited dialogue, while explicit dialogue takes precedence", () => {
  const single=resolveDefaultPreset(config({interactions:{click:{animation:"HighFive"}}}),model);
  expect(single.interactions?.click).toEqual({animation:"HighFive"});
  expect(clickScene(single).animations).toBeUndefined();
  expect(clickScene(single).linesByAnimation).toEqual({HighFive:["High Five!","耶！"]});
  const pool=resolveDefaultPreset(config({interactions:{click:{animations:["HighFive"]}}}),model);
  expect(pool.interactions?.click).toEqual({animations:["HighFive"]});
  expect(clickScene(pool).animations).toEqual(["HighFive"]);
  const explicit=resolveDefaultPreset(config({interactions:{click:false},dialogue:{click:{animation:"GentleWave",lines:["Explicit"]}}}),model);
  expect(explicit.interactions?.click).toBe(false);
  expect(clickScene(explicit)).toMatchObject({animation:"GentleWave",lines:["Explicit"]});
});

it("does not leak Weiguang behavior into replacement models or the Inochi2D backend", () => {
  for (const input of [{model:"other.vrm"},{bundle:"other-bundle"},{backend:"inochi2d",model:"other.inp"},{enable:false},
    {model:""},{model:null},{model:123},{bundle:""},{bundle:null},{bundle:false}]) {
    const original=config(input), result=resolveDefaultPreset(original,model);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result.dialogue).toBeUndefined();
    expect(result).not.toHaveProperty("embeddedAnimations");
    expect(result.publication).toBeUndefined();
    expect(result.position).toBeUndefined();
  }
});

it("copies own keys without changing object prototypes", () => {
  const input=config(JSON.parse('{"render":{"__proto__":{"polluted":true}},"__proto__":{"polluted":true}}'));
  const result=resolveDefaultPreset(input,model);
  expect(({} as {polluted?:boolean}).polluted).toBeUndefined();
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(result.render)).toBe(Object.prototype);
  expect(Object.hasOwn(result,"__proto__")).toBe(true);
});
