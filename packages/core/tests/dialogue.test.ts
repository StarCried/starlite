import { expect, it } from "vitest";
import { DialogueScheduler, resolveDialogueSentences, resolveDialogueContext, type DialogueContext, type DialogueSchedule } from "../src/dialogue.js";

it("schedules text-only scenes without inventing an animation", () => {
  const sentences = resolveDialogueSentences({lines:["Hello"]}, [], "dialogue.click");
  const scheduler = new DialogueScheduler({enter:false,idle:false,click:{...sentences,durationMs:1000}}, () => 0);
  expect(scheduler.triggerClick(0)).toEqual({scene:"click",line:"Hello",durationMs:1000});
  expect(() => resolveDialogueSentences({linesByAnimation:{}}, [], "dialogue.click")).toThrow("needs an animation");
});

it("draws from click and idle pools on each trigger and respects foreground priority", () => {
  let value = 0;
  const scheduler = new DialogueScheduler({
    enter: false,
    idle: {animation:"Yawn",animations:["Yawn","Stretch"],lines:["Rest"],durationMs:100,intervalMinMs:1000,intervalMaxMs:1000},
    click: {animation:"Wave",animations:["Wave","Nod"],lines:["Hi"],durationMs:100},
  }, () => value);
  scheduler.start(0);
  expect(scheduler.triggerClick(0)?.animation).toBe("Wave");
  value = .99;
  expect(scheduler.triggerClick(0)?.animation).toBe("Nod");
  expect(scheduler.poll(1100,true)).toBeUndefined();
  expect(scheduler.poll(1100,false)?.animation).toBe("Stretch");
  value = 0;
  expect(scheduler.poll(2200,false)?.animation).toBe("Yawn");
});

it.each(["enter", "idle", "click"] as const)("pairs %s animation with only its bound sentences", scene => {
  const draws: number[] = [];
  const bound = { animation: "Wave", animations: ["Wave", "Nod"], lines: ["Legacy must not win"], linesByAnimation: { Wave: ["Hello", "Hi"], Nod: ["Agreed", "Yes"] }, durationMs: 100 };
  const scheduler = new DialogueScheduler({
    enter: scene === "enter" ? { ...bound, delayMs: 0 } : false,
    idle: scene === "idle" ? { ...bound, intervalMinMs: 1000, intervalMaxMs: 1000 } : false,
    click: scene === "click" ? bound : false,
  }, () => draws.shift() ?? 0);
  scheduler.start(0);
  draws.push(.99, 0);
  const action = scene === "click" ? scheduler.triggerClick(1000) : scheduler.poll(1000, false);
  expect(action).toMatchObject({ animation: "Nod", line: "Agreed" });
});

it("selects multiple possible sentences from a single animation's mapping-only library", () => {
  let value = 0;
  const scheduler = new DialogueScheduler({ enter: false, idle: false, click: { animation: "Wave", linesByAnimation: { Wave: ["Hello", "Hi"] }, durationMs: 100 } }, () => value);
  expect(scheduler.triggerClick(0)?.line).toBe("Hello");
  value = .99;
  expect(scheduler.triggerClick(100)?.line).toBe("Hi");
});

it("keeps the historical sentence-then-animation random draws for legacy scenes", () => {
  const draws = [.99, 0];
  const scheduler = new DialogueScheduler({ enter: false, idle: false, click: { animation: "Wave", animations: ["Wave", "Nod"], lines: ["Hello", "Hi"], durationMs: 100 } }, () => draws.shift()!);
  expect(scheduler.triggerClick(0)).toMatchObject({ animation: "Wave", line: "Hi" });
});

it("normalizes and copies animation-bound sentence libraries without requiring legacy lines", () => {
  const input = { linesByAnimation: { Wave: ["  Hello  "], Nod: ["Yes"] } };
  const result = resolveDialogueSentences(input, ["Wave", "Nod"], "dialogue.click");
  expect(result).toEqual({ linesByAnimation: { Wave: ["Hello"], Nod: ["Yes"] } });
  input.linesByAnimation.Wave[0] = "Changed";
  expect(result.linesByAnimation?.Wave).toEqual(["Hello"]);
});

it.each([
  {}, { linesByAnimation: {} }, { linesByAnimation: { Wave: ["Hi"] } },
  { lines: ["Must not mask missing mapping"], linesByAnimation: { Wave: ["Hi"] } },
  { linesByAnimation: { Wave: ["Hi"], Nod: ["Yes"], Unknown: ["No"] } },
  { linesByAnimation: { Wave: [], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: ["  "], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: [42], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: ["中".repeat(342)], Nod: ["Yes"] } },
  { linesByAnimation: [] },
])("rejects missing, mismatched or malformed bound libraries: %j", input => {
  expect(() => resolveDialogueSentences(input as any, ["Wave", "Nod"], "dialogue.click")).toThrow(/dialogue.click/);
});

const dialogueContext = (overrides: Partial<DialogueContext> = {}): DialogueContext => ({ id:"article-a",lines:["A","B","C"],animation:"Wave",triggers:["click","idle"],mode:"replace",order:"sequential",...overrides });
const contextBase = (): DialogueSchedule => ({ enter:false,click:{animation:"GlobalWave",lines:["Global click"],durationMs:100},idle:{animation:"GlobalRest",lines:["Global idle"],durationMs:100,intervalMinMs:1000,intervalMaxMs:1000} });

it("shares one sequential cursor between click and idle, wraps and ignores identical context refreshes",()=>{
  const scheduler=new DialogueScheduler(contextBase(),()=>0);scheduler.start(0);scheduler.setContext(dialogueContext(),0);
  expect(scheduler.triggerClick(0)).toMatchObject({line:"A",animation:"Wave"});
  expect(scheduler.poll(1100,false)?.line).toBe("B");
  expect(scheduler.setContext(dialogueContext({triggers:["idle","click"]}),1200)).toBe(false);
  expect(scheduler.triggerClick(1200)?.line).toBe("C");
  expect(scheduler.triggerClick(1400)?.line).toBe("A");
});

it("replaces only the declared trigger and restores the exact original global rules on clear",()=>{
  const scheduler=new DialogueScheduler(contextBase(),()=>0);scheduler.start(0);
  scheduler.setContext(dialogueContext({triggers:["click"]}),0);
  expect(scheduler.poll(1000,false)).toMatchObject({line:"Global idle",animation:"GlobalRest"});
  expect(scheduler.triggerClick(1100)?.line).toBe("A");
  scheduler.setContext(null,1200);
  expect(scheduler.triggerClick(1200)).toMatchObject({line:"Global click",animation:"GlobalWave"});
  expect(scheduler.poll(2300,false)).toMatchObject({line:"Global idle",animation:"GlobalRest"});
});

it("merges page-first entries while preserving global sentence/animation binding and trigger eligibility",()=>{
  const scheduler=new DialogueScheduler({...contextBase(),click:{animations:["Wave","Nod"],linesByAnimation:{Wave:["Hi"],Nod:["Yes"]},durationMs:321}},()=>0);
  scheduler.start(0);scheduler.setContext(dialogueContext({lines:["Page"],animation:"PageWave",mode:"merge"}),0);
  expect(scheduler.triggerClick(0)).toMatchObject({line:"Page",animation:"PageWave",durationMs:321});
  expect(scheduler.triggerClick(400)).toEqual({scene:"click",line:"Hi",animation:"Wave",durationMs:321});
  expect(scheduler.triggerClick(800)).toMatchObject({line:"Yes",animation:"Nod"});
  expect(scheduler.poll(2200,false)).toMatchObject({line:"Global idle",animation:"GlobalRest",durationMs:100});
  expect(scheduler.triggerClick(2400)?.line).toBe("Page");
});

it("random order can select page and global candidates without separating their animations",()=>{
  let random=0;
  const scheduler=new DialogueScheduler(contextBase(),()=>random);scheduler.start(0);
  scheduler.setContext(dialogueContext({lines:["Page"],mode:"merge",order:"random",triggers:["click"]}),0);
  expect(scheduler.triggerClick(0)).toMatchObject({line:"Page",animation:"Wave"});
  random=.999;expect(scheduler.triggerClick(200)).toMatchObject({line:"Global click",animation:"GlobalWave"});
});

it("retains a pending first entrance but never replays it when dialogue contexts change",()=>{
  const scheduler=new DialogueScheduler({...contextBase(),enter:{animation:"Enter",lines:["Welcome"],delayMs:500,durationMs:100}},()=>0);
  scheduler.start(0);scheduler.setContext(dialogueContext(),100);
  expect(scheduler.poll(500,true)).toBeUndefined();
  expect(scheduler.poll(500,false)).toMatchObject({scene:"enter",line:"Welcome"});
  expect(scheduler.triggerClick(600)?.line).toBe("A");
  scheduler.setContext(dialogueContext({id:"article-b",lines:["New"]}),800);
  expect(scheduler.poll(800,false)).toBeUndefined();
  expect(scheduler.triggerClick(900)?.line).toBe("New");
  scheduler.setContext(null,1000);expect(scheduler.poll(1000,false)).toBeUndefined();
});

it("does not consume an idle entry while foreground work blocks its trigger",()=>{
  const scheduler=new DialogueScheduler(contextBase(),()=>0);scheduler.start(0);scheduler.setContext(dialogueContext(),0);
  expect(scheduler.poll(3000,true)).toBeUndefined();expect(scheduler.poll(3100,true)).toBeUndefined();
  expect(scheduler.poll(3200,false)?.line).toBe("A");expect(scheduler.triggerClick(3300)?.line).toBe("B");
});

it("adds bounded text-only idle interaction to a model without a global dialogue library",()=>{
  const scheduler=new DialogueScheduler({enter:false,idle:false,click:false},()=>0);scheduler.start(0);
  const textOnly=dialogueContext();delete textOnly.animation;scheduler.setContext(textOnly,0);
  expect(scheduler.poll(29999,false)).toBeUndefined();
  expect(scheduler.poll(30000,false)).toEqual({scene:"idle",line:"A",durationMs:4000});
  expect(scheduler.triggerClick(35000)).toEqual({scene:"click",line:"B",durationMs:4000});
  scheduler.setContext(null,36000);expect(scheduler.poll(100000,false)).toBeUndefined();expect(scheduler.triggerClick(100000)).toBeUndefined();
});

it("copies input libraries and rejects malformed changes before replacing a valid context",()=>{
  const input=dialogueContext(),resolved=resolveDialogueContext(input);
  (input.lines as string[])[0]="Mutated";expect(resolved.lines[0]).toBe("A");
  const scheduler=new DialogueScheduler(contextBase(),()=>0);scheduler.setContext(resolved,0);
  for(const invalid of [null,{},[],{...resolved,id:""},{...resolved,lines:[]},{...resolved,lines:[" "]},{...resolved,lines:["中".repeat(342)]},{...resolved,triggers:[]},{...resolved,triggers:["click","click"]},{...resolved,mode:"append"},{...resolved,order:"all"},{...resolved,animation:""},{...resolved,extra:1}]){
    expect(()=>resolveDialogueContext(invalid)).toThrow(/dialogue context/);
  }
  expect(()=>scheduler.setContext({...resolved,lines:[]} as DialogueContext,1)).toThrow();
  expect(scheduler.triggerClick(10)?.line).toBe("A");
});
