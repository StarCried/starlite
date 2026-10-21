import type {BrowserWidgetConfig, PageDialogueDefaults, PageDialogueInput, RenderedPage} from "./types";

const fields = ["animation", "triggers", "mode", "order"];
const marker = /<!-- starlite-page:start -->[\s\S]*?<!-- starlite-page:end -->/gu;
const rawMarker = /<script type="application\/json" data-starlite-page-dialogue-raw>([\s\S]*?)<\/script>/gu;
interface PageInput extends PageDialogueDefaults {lines: readonly string[]}
interface RawPage {path:string;source:string;input:PageInput}

function record(value:unknown):value is Record<string,unknown> {
  return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function rules(value:unknown,field:string,allowLines=false):PageDialogueDefaults {
  if(!record(value))throw new Error(`${field} must be an object`);
  for(const key of Object.keys(value))if(!fields.includes(key)&&!(allowLines&&key==="lines"))throw new Error(`${field}.${key} is not a supported option`);
  const output:PageDialogueDefaults={};
  if(value.animation!==undefined){
    if(typeof value.animation!=="string"||!value.animation.trim()||value.animation.length>128)throw new Error(`${field}.animation must be a non-empty animation name (up to 128 characters)`);
    output.animation=value.animation.trim();
  }
  if(value.triggers!==undefined){
    if(!Array.isArray(value.triggers)||value.triggers.length<1||value.triggers.length>2||new Set(value.triggers).size!==value.triggers.length||value.triggers.some(trigger=>trigger!=="click"&&trigger!=="idle"))throw new Error(`${field}.triggers must contain click and/or idle without duplicates`);
    output.triggers=[...value.triggers];
  }
  if(value.mode!==undefined){
    if(value.mode!=="replace"&&value.mode!=="merge")throw new Error(`${field}.mode must be replace or merge`);
    output.mode=value.mode;
  }
  if(value.order!==undefined){
    if(value.order!=="sequential"&&value.order!=="random")throw new Error(`${field}.order must be sequential or random`);
    output.order=value.order;
  }
  return output;
}

export function readPageDialogueDefaults(value:unknown):PageDialogueDefaults {
  return value===undefined?{}:rules(value,"starlite.pageDialogue");
}
export function readPageDialogue(value:unknown,source:string):PageInput|undefined {
  if(value===undefined)return undefined;
  const field=`${source}: starlite`;
  const input=Array.isArray(value)?{lines:value}:value;
  const options=rules(input,field,true);
  const lines=(input as Record<string,unknown>).lines;
  if(!Array.isArray(lines)||lines.length<1||lines.length>128)throw new Error(`${field}.lines must contain 1..128 sentences; use '- "text"' with a space after the hyphen`);
  const output=lines.map((line,index)=>{
    if(typeof line!=="string"||!line.trim()||Buffer.byteLength(line.trim(),"utf8")>1024)throw new Error(`${field}.lines[${index}] must contain 1..1024 UTF-8 bytes of plain text`);
    return line.trim();
  });
  return {...options,lines:output};
}
function json(value:unknown):string {
  return JSON.stringify(value).replaceAll("<","\\u003c").replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029");
}
function pagePath(value:unknown,source:string):string {
  const invalid = () => new Error(`${source}: starlite requires a valid relative Hexo page.path (up to 2048 decoded UTF-8 bytes)`);
  if(typeof value!=="string"||!value||value.length>8192||/[\\:?#\u0000-\u001f]/u.test(value)||value.startsWith("//"))throw invalid();
  // Hexo's explicit post permalink filter returns a leading slash, whereas
  // generated post/page paths are relative. Both identify the same route.
  const relative=value.startsWith("/")?value.slice(1):value;
  if(!relative)return "index.html";
  let parts:string[];
  try { parts=relative.split("/").map(part=>decodeURIComponent(part)); } catch { throw invalid(); }
  if(parts.some((part,index)=>part===".."||part==="."||/[/\\:?#\u0000-\u001f]/u.test(part)||(!part&&index<parts.length-1)))throw invalid();
  const decoded=parts.join("/");
  const normalized=decoded.endsWith("/")?`${decoded}index.html`:!parts.at(-1)!.includes(".")?`${decoded}/index.html`:decoded;
  if(Buffer.byteLength(normalized,"utf8")>2048)throw invalid();
  return relative;
}

/** Cache raw article options only. Site defaults may change without Hexo
 * re-rendering cached Markdown, so resolution happens on each full HTML render. */
export function markPageDialogue(page:RenderedPage,enabled:boolean):RenderedPage {
  const source=page.source??page.path??"page";
  const input=enabled?readPageDialogue(page.starlite,source):undefined;
  const payload=input?`<!-- starlite-page:start --><script type="application/json" data-starlite-page-dialogue-raw>${json({path:pagePath(page.path,source),source,input})}</script><!-- starlite-page:end -->`:"";
  for(const key of ["content","more"] as const)if(typeof page[key]==="string")page[key]=page[key]!.replace(marker,"")+payload;
  return page;
}

/** No model paths or page prose are added to a global manifest. Each article
 * carries its own inert payload, which follows article-only PJAX replacement. */
export function resolvePageDialogueMarkers(html:string,defaults:PageDialogueDefaults,widget:BrowserWidgetConfig|undefined):string {
  if(!widget)return html.replace(marker,"");
  return html.replace(rawMarker,(_match,text:string)=>{
    if(Buffer.byteLength(text,"utf8")>1024*1024)throw new Error("starlite page dialogue payload exceeds its limit");
    const raw=JSON.parse(text) as RawPage;
    if(!record(raw)||raw.input===undefined)throw new Error("starlite page dialogue payload must contain an article and its lines");
    const source=typeof raw.source==="string"?raw.source:"page";
    const input=readPageDialogue(raw.input,source)!;
    const path=pagePath(raw.path,source);
    const inherited=widget.dialogue?.enter;
    const animation=input.animation??defaults.animation??(inherited?inherited.animation??inherited.animations?.[0]:undefined);
    if(animation!==undefined){
      const names=new Set([...(widget.animations??[]).map(clip=>clip.name),...(widget.backend==="vrm"?widget.embeddedAnimations??[]:[])]);
      if(widget.backend==="vrm"&&(widget.neutralAnimation==="StarLiteIdle"||widget.ambient?.animations?.includes("StarLiteIdle")||!names.size))names.add("StarLiteIdle");
      if(!names.has(animation))throw new Error(`${source}: starlite.animation references unavailable animation ${JSON.stringify(animation)}; choose an existing model animation`);
    }
    const context={lines:input.lines,...(animation!==undefined?{animation}:{}),triggers:input.triggers??defaults.triggers??["click","idle"],mode:input.mode??defaults.mode??"replace",order:input.order??defaults.order??"sequential"};
    return `<script type="application/json" data-starlite-page-dialogue>${json({path,context})}</script>`;
  });
}

// Public types describe authored data; normalization stays private to Hexo.
export type {PageDialogueDefaults,PageDialogueInput};
