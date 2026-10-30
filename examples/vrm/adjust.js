import {mountModelWidget,resolveLocale} from '/runtime/index.js';
import {translateAdjustmentPage} from '/adjust-locale.js';
const locale=resolveLocale(new URL(location.href).searchParams.get('lang') || navigator.language);
const t=(zh,en)=>locale==='en'?en:zh;
translateAdjustmentPage(document,locale);

const $=selector=>document.querySelector(selector);
const specs=[
  {group:'idle',key:'armLiftDegrees',label:t("双臂抬高", "Arm lift"),min:-30,max:45,step:1,initial:0,unit:'°',hint:t("左右对称抬高或放低上臂。", "Raise or lower both upper arms symmetrically.")},
  {group:'idle',key:'palmTwistDegrees',label:t("掌心朝向", "Palm direction"),min:-45,max:45,step:1,initial:0,unit:'°',hint:t("沿前臂方向调整掌心内外朝向。", "Twist both palms inward or outward along the forearm.")},
  {group:'idle',key:'wristLiftDegrees',label:t("手腕抬高", "Wrist lift"),min:-45,max:45,step:1,initial:0,unit:'°',hint:t("左右对称抬高或压低手掌，不改变手臂的位置。", "Bend both hands up or down without moving the arms.")},
  {group:'idle',key:'handCurl',label:t("手部张合", "Hand curl"),min:0,max:1,step:.01,initial:.25,manual:true,hint:t("0% 张开，100% 握拳；不手动设置时保留原动作。", "0% open, 100% closed; leave manual adjustment off to keep the authored pose.")},
  {group:'gaze',key:'headStrength',label:t("转头灵敏度", "Head following"),min:0,max:2,step:.05,initial:1,unit:'×',hint:t("0 为不转头；仍然保留最大转动角度限制。", "Zero disables head following; maximum angle limits still apply.")},
  {group:'gaze',key:'eyeStrength',label:t("眼球灵敏度", "Eye following"),min:0,max:2,step:.05,initial:1,unit:'×',hint:t("根据模型有效的眼球骨骼或表情驱动视线。", "Uses the model's valid eye-bone or expression bindings.")},
  {group:'idle',key:'elbowBendDegrees',label:t("肘部弯曲", "Elbow bend"),min:-20,max:45,step:1,initial:0,unit:'°',advanced:true,hint:t("小幅弯曲前臂，避免双臂过直。", "Add a small forearm bend to soften straight arms.")},
  {group:'gaze',key:'smoothingMs',label:t("跟随缓动时间", "Follow smoothing"),min:20,max:1000,step:10,initial:100,unit:' ms',advanced:true,hint:t("数值越小跟上越快，越大越柔和。", "Lower values respond faster; higher values ease more slowly.")},
];
const controls=new Map(), saved=new Map();
let controller,currentModel,models=[],adjustments={},generation=0,abort;
const valueText=(spec,value)=>spec.key==='handCurl'?`${Math.round(value*100)}%`:`${Number(value.toFixed(2))}${spec.unit??''}`;
const setValue=(spec,value)=>{
  const group={...adjustments[spec.group]};
  if(value===undefined)delete group[spec.key];else group[spec.key]=value;
  const next={...adjustments};if(Object.keys(group).length)next[spec.group]=group;else delete next[spec.group];
  controller?.setModelAdjustments(next);adjustments=next;saved.set(currentModel?.id,structuredClone(next));refreshControls();
};
for(const spec of specs){
  const row=document.createElement('div');row.className='control';
  const heading=document.createElement('div');heading.className='control-heading';
  const label=document.createElement('label');label.htmlFor=spec.key;label.textContent=spec.label;
  const output=document.createElement('output');output.htmlFor=spec.key;
  const reset=document.createElement('button');reset.type='button';reset.className='reset';reset.textContent=t("还原", "Reset");reset.setAttribute('aria-label',`${t("还原", "Reset ")}${spec.label}`);reset.onclick=()=>setValue(spec,undefined);
  heading.append(label,output,reset);
  const input=document.createElement('input');Object.assign(input,{type:'range',id:spec.key,min:String(spec.min),max:String(spec.max),step:String(spec.step),value:String(spec.initial)});
  input.oninput=()=>{try{setValue(spec,Number(input.value));}catch(error){$('#status').textContent=error.message;}};
  const hint=document.createElement('p');hint.className='hint';hint.textContent=spec.hint;
  row.append(heading,input);
  let manual;
  if(spec.manual){const wrap=document.createElement('label');wrap.className='manual';manual=document.createElement('input');manual.type='checkbox';manual.id='hand-manual';manual.onchange=()=>setValue(spec,manual.checked?Number(input.value):undefined);wrap.append(manual,document.createTextNode(t("手动设置张合", "Adjust hand curl")));row.append(wrap);}
  row.append(hint);$(spec.advanced?'#advanced-controls':'#basic-controls').append(row);controls.set(spec.key,{input,output,reset,manual});
}
function refreshControls(){
  const optional=currentModel?.capabilities.humanoid.optionalBones??[];
  const hasFingers=optional.some(name=>/(Thumb|Index|Middle|Ring|Little)/.test(name));
  for(const spec of specs){
    const c=controls.get(spec.key),value=adjustments[spec.group]?.[spec.key],available=Boolean(controller)&&(spec.key!=='eyeStrength'||currentModel.capabilities.lookAt.eyes)&&(spec.key!=='handCurl'||hasFingers);
    c.input.value=String(value??spec.initial);c.input.disabled=!available||(spec.manual&&value===undefined);c.reset.disabled=!available||value===undefined;
    if(c.manual){c.manual.checked=value!==undefined;c.manual.disabled=!available;}
    c.output.textContent=!available?t("不可用", "Unavailable"):spec.manual&&value===undefined?t("保持原动作", "Keep authored pose"):valueText(spec,value??spec.initial);
  }
  const lines=['starlite:'];
  if(Object.keys(adjustments.idle??{}).length)lines.push('  neutralAnimation: StarLiteIdle','  ambient:','    animations: [StarLiteIdle]');
  if(!Object.keys(adjustments).length)lines.push('  adjustments: {}');
  else{lines.push('  adjustments:');for(const [group,values]of Object.entries(adjustments)){lines.push(`    ${group}:`);for(const [key,value]of Object.entries(values))lines.push(`      ${key}: ${value}`);}}
  $('#config-output').value=lines.join('\n');
}
async function mount(id){
  const serial=++generation;abort?.abort();controller?.destroy();controller=undefined;abort=new AbortController();
  currentModel=models.find(model=>model.id===id);adjustments=structuredClone(saved.get(id)??{});refreshControls();$('#status').textContent=t("正在载入…", "Loading\u2026");
  const rect=$('#stage').getBoundingClientRect(),height=Math.min(650,rect.height-10),width=Math.min(430,rect.width-12);
  try{
    const next=await mountModelWidget($('#model'),{backend:'vrm',locale,model:currentModel.url,fallback:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',embeddedAnimations:currentModel.animations.map(a=>a.name),neutralAnimation:'StarLiteIdle',ambient:{animations:['StarLiteIdle']},adjustments,display:{width,height},render:{fps:60,maxDevicePixelRatio:1,fitPadding:.88},camera:{yawDegrees:0,pitchDegrees:3,fovDegrees:24,targetHeight:.52},mobile:{show:true},interactions:{pointer:$('#pointer').checked,click:false,drag:false}},{signal:abort.signal});
    if(serial!==generation){next.destroy();return;}controller=next;
    if(next.status!=='running'&&next.status!=='paused')throw Error(t("模型加载失败，请检查文件。", "Could not load the model. Check the file."));
    $('#status').textContent=t("已就绪 · 调节即时生效", "Ready \u00b7 Changes apply immediately");$('#pause').textContent=next.status==='paused'?t("继续", "Resume"):t("暂停", "Pause");
    const animations=next.getAnimations();$('#animation').replaceChildren(...animations.map(a=>new Option(a.name==='StarLiteIdle'?t("系统默认 Idle", "Built-in Idle"):a.name,a.name)));$('#animation').value='StarLiteIdle';
    const caps=currentModel.capabilities;$('#capabilities').textContent=`${currentModel.title} · ${caps.lookAt.eyes?t("眼球跟随可用", "Eye following available"):t("无有效眼球绑定，仅头部跟随", "No valid eye bindings; head following only")} · ${caps.humanoid.optionalBones.some(name=>/(Thumb|Index|Middle|Ring|Little)/.test(name))?t("按已映射的手指调整", "Adjusts mapped fingers"):t("无标准手指映射", "No standard finger mappings")}`;
    refreshControls();
  }catch(error){if(serial===generation){$('#status').textContent=error.message;refreshControls();}}
}
$('#model').addEventListener('model-error',e=>{$('#status').textContent=e.detail;});
$('#model-select').onchange=e=>void mount(e.target.value);
$('#pointer').onchange=e=>controller?.setPointerEnabled(e.target.checked);
$('#pause').onclick=()=>{if(!controller)return;if(controller.status==='paused'){controller.resume();$('#pause').textContent=t("暂停", "Pause");}else{controller.pause();$('#pause').textContent=t("继续", "Resume");}};
$('#animation').onchange=()=>{const name=$('#animation').value;void controller?.playAnimation(name,{mode:name==='StarLiteIdle'?'loop':'once',restart:true}).then(()=>{if(controller?.diagnostics().activeAnimation==='StarLiteIdle')$('#animation').value='StarLiteIdle';});};
$('#reset-all').onclick=()=>{controller?.setModelAdjustments({});adjustments={};saved.set(currentModel?.id,{});refreshControls();};
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#config-output').value);$('#copy-result').textContent=t("已复制", "Copied");}catch{$('#copy-result').textContent=t("请手动选择上方配置复制", "Select and copy the configuration above manually");}};
window.adjustmentPreview={get controller(){return controller;},get adjustments(){return structuredClone(adjustments);},get model(){return currentModel;},mount};
try{models=await(await fetch('/adjust-models.json')).json();if(!models.length)throw Error(t("请以 --model <avatar.vrm> 启动预览。", "Start the preview with --model <avatar.vrm>."));$('#model-select').replaceChildren(...models.map(model=>new Option(model.title,model.id)));await mount(models[0].id);}catch(error){$('#status').textContent=error.message;}
