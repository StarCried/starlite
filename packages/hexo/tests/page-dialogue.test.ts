import {expect,it,vi} from "vitest";
import {registerHexoWidget} from "../src/index";
import {markPageDialogue,readPageDialogue,readPageDialogueDefaults,resolvePageDialogueMarkers} from "../src/page-dialogue";
import type {BrowserWidgetConfig,HexoLike,RenderedPage} from "../src/types";

const widget:BrowserWidgetConfig={backend:"vrm",model:"/m.vrm",fallback:"/f.png",embeddedAnimations:["Idle","Wave","Thinking"],dialogue:{enter:{animation:"Wave",lines:["Global hello"]},click:{animation:"Thinking",lines:["Global click"]}}};
const post=(starlite:unknown,path="articles/example/index.html"):RenderedPage=>({path,source:"_posts/example.md",content:"<p>Body</p>",more:"<p>More</p>",starlite});
const payload=(html:string)=>JSON.parse(html.match(/data-starlite-page-dialogue>([\s\S]*?)<\/script>/u)![1]!);

it("normalizes both compact forms identically and trims bounded plain text",()=>{
  const expected={lines:["AAA","BBB"]};
  expect(readPageDialogue([" AAA ","BBB"],"a.md")).toEqual(expected);
  expect(readPageDialogue({lines:[" AAA ","BBB"]},"a.md")).toEqual(expected);
  expect(readPageDialogue(undefined,"a.md")).toBeUndefined();
});
it("inherits all built-in defaults and the configured entrance animation without altering the global library",()=>{
  const before=JSON.stringify(widget),page=markPageDialogue(post(["AAA","BBB"]),true);
  const result=payload(resolvePageDialogueMarkers(page.content!,{},widget));
  expect(result).toEqual({path:"articles/example/index.html",context:{lines:["AAA","BBB"],animation:"Wave",triggers:["click","idle"],mode:"replace",order:"sequential"}});
  expect(JSON.stringify(widget)).toBe(before);
  expect(page.more).toContain("data-starlite-page-dialogue-raw");
});
it("resolves explicit page fields above site defaults above built-ins",()=>{
  const defaults=readPageDialogueDefaults({animation:"Thinking",triggers:["idle"],mode:"merge",order:"random"});
  const a=markPageDialogue(post(["A"]),true);
  expect(payload(resolvePageDialogueMarkers(a.content!,defaults,widget)).context).toEqual({lines:["A"],...defaults});
  const b=markPageDialogue(post({lines:["B"],animation:"Wave",triggers:["click"],mode:"replace",order:"sequential"}),true);
  expect(payload(resolvePageDialogueMarkers(b.content!,defaults,widget)).context).toEqual({lines:["B"],animation:"Wave",triggers:["click"],mode:"replace",order:"sequential"});
});
it("updates cached raw Markdown data when only site defaults change",()=>{
  const cached=markPageDialogue(post(["A"]),true).content!;
  expect(payload(resolvePageDialogueMarkers(cached,{order:"sequential"},widget)).context.order).toBe("sequential");
  expect(payload(resolvePageDialogueMarkers(cached,{order:"random",animation:"Thinking"},widget)).context).toMatchObject({order:"random",animation:"Thinking"});
  expect(cached).toContain("data-starlite-page-dialogue-raw");
});
it("uses a text-only context for a model without an entrance action",()=>{
  const bare:BrowserWidgetConfig={backend:"vrm",model:"/plain.vrm",fallback:"/f.png"};
  expect(payload(resolvePageDialogueMarkers(markPageDialogue(post(["A"]),true).content!,{},bare)).context.animation).toBeUndefined();
});
it("retains exact animation names and diagnoses invalid ones with the article source",()=>{
  const raw=markPageDialogue(post({lines:["A"],animation:"missing"}),true).content!;
  expect(()=>resolvePageDialogueMarkers(raw,{},widget)).toThrow('_posts/example.md: starlite.animation references unavailable animation "missing"');
  expect(()=>resolvePageDialogueMarkers(markPageDialogue(post(["A"]),true).content!,{animation:"missing"},widget)).toThrow("starlite.animation");
});
it("serializes hostile markup as data and allows no closing-script injection",()=>{
  const line='</script><script>globalThis.pwned=true</script>\u2028<tag>';
  const html=resolvePageDialogueMarkers(markPageDialogue(post([line]),true).content!,{},widget);
  expect(html).not.toContain("<script>globalThis");
  expect(html).toContain("\\u003c/script>");
  expect(html).toContain("\\u2028");
  expect(payload(html).context.lines).toEqual([line]);
  expect(html).not.toContain('"source"');
});
it("does not duplicate markers and strips cached page data when disabled or removed",()=>{
  const page=markPageDialogue(post(["A"]),true);markPageDialogue(page,true);
  expect(page.content!.match(/data-starlite-page-dialogue-raw/gu)).toHaveLength(1);
  expect(resolvePageDialogueMarkers(page.content!,{},undefined)).toBe("<p>Body</p>");
  delete page.starlite;markPageDialogue(page,true);expect(page.content).toBe("<p>Body</p>");
  const disabled=post({bad:"invalid"});expect(()=>markPageDialogue(disabled,false)).not.toThrow();expect(disabled.content).toBe("<p>Body</p>");
});
it.each([null,"AAA",[],[123],[""],["a".repeat(1025)],new Array(129).fill("a"),{lines:["A"],extra:true},{lines:["A"],order:"forward"},{lines:["A"],mode:"append"},{lines:["A"],animation:""},{lines:["A"],triggers:[]},{lines:["A"],triggers:["click","click"]},{lines:["A"],triggers:["enter"]}])("rejects malformed front matter with a source and field: %j",input=>{
  expect(()=>readPageDialogue(input,"_posts/bad.md")).toThrow("_posts/bad.md: starlite");
});
it.each([null,[],{lines:["A"]},{mode:"append"},{order:"forward"},{triggers:["enter"]}])("validates only the supported site default rules: %j",input=>{
  expect(()=>readPageDialogueDefaults(input)).toThrow("starlite.pageDialogue");
});
it.each(["../escape/index.html","//example.org/a","https://example.org/a","a?b","a\\b","a/%2e%2e/b","a/%2f/b","a/%ff/b","中".repeat(683)+".html"])('rejects a malformed page identity: %s',path=>{
  expect(()=>markPageDialogue(post(["A"],path),true)).toThrow("page.path");
});
it("normalizes root-relative explicit Hexo permalinks",()=>{
  for(const [path,expected] of [["/2026/10/21/starlite/","2026/10/21/starlite/"],["/","index.html"]]){
    const html=markPageDialogue(post(["A"],path),true).content!;
    expect(payload(resolvePageDialogueMarkers(html,{},widget)).path).toBe(expected);
  }
});
it("accepts the largest permitted escaped text and decoded Unicode paths",()=>{
  const lines=Array.from({length:128},()=>"<".repeat(1024));
  const path=encodeURI("中".repeat(678)+"/index.html");
  const raw=markPageDialogue(post(lines,path),true).content!;
  expect(Buffer.byteLength(raw)).toBeGreaterThan(512*1024);
  expect(payload(resolvePageDialogueMarkers(raw,{},widget))).toMatchObject({path,context:{lines}});
});
it("refreshes cached Post and Page markers after config-only disable/re-enable",async()=>{
  const pages={Post:[post(["A"])],Page:[post(["B"],"about/index.html")]};
  let prepare:(()=>Promise<void>)|undefined;
  const hexo:HexoLike={config:{starlite:{backend:"vrm",model:"/custom.vrm",fallback:"/f.png",embeddedAnimations:["Wave"],enable:false}},model:name=>({toArray:()=>pages[name]}),extend:{
    filter:{register:vi.fn((name:string,callback:any,priority?:number)=>{if(name==="before_generate"){prepare=callback;expect(priority).toBe(20);}})},
    generator:{register:vi.fn()},injector:{register:vi.fn()},
  },log:{warn:vi.fn()}};
  registerHexoWidget(hexo);
  await prepare!();
  expect(pages.Post[0]!.content).toBe("<p>Body</p>");
  hexo.config.starlite!.enable=true;
  await prepare!();
  for(const page of [...pages.Post,...pages.Page])expect(page.content).toContain("data-starlite-page-dialogue-raw");
  await prepare!();
  expect(pages.Post[0]!.content!.match(/data-starlite-page-dialogue-raw/gu)).toHaveLength(1);
  pages.Page[0]!.starlite={lines:["B"],animation:"Missing"};
  await expect(prepare!()).rejects.toThrow('_posts/example.md: starlite.animation references unavailable animation "Missing"');
  pages.Page[0]!.starlite=["B"];
  hexo.config.starlite!.enable=false;
  await prepare!();
  expect(pages.Post[0]!.content).toBe("<p>Body</p>");
  pages.Post[0]!.starlite={lines:["A"],typo:true};
  await expect(prepare!()).resolves.toBeUndefined();
  hexo.config.starlite!.enable=true;
  await expect(prepare!()).rejects.toThrow("_posts/example.md: starlite.typo");
});
