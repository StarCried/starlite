import {mountModelWidget} from '/runtime/index.js';

const $=selector=>document.querySelector(selector);
const specs=[
  {group:'idle',key:'armLiftDegrees',label:'双臂抬高',min:-30,max:45,step:1,initial:0,unit:'°',hint:'左右对称抬高或放低上臂。'},
  {group:'idle',key:'palmTwistDegrees',label:'掌心朝向',min:-45,max:45,step:1,initial:0,unit:'°',hint:'沿前臂方向调整掌心内外朝向。'},
  {group:'idle',key:'wristLiftDegrees',label:'手腕抬高',min:-45,max:45,step:1,initial:0,unit:'°',hint:'左右对称抬高或压低手掌，不改变手臂的位置。'},
  {group:'idle',key:'handCurl',label:'手部张合',min:0,max:1,step:.01,initial:.25,manual:true,hint:'0% 张开，100% 握拳；不手动设置时保留原动作。'},
  {group:'gaze',key:'headStrength',label:'转头灵敏度',min:0,max:2,step:.05,initial:1,unit:'×',hint:'0 为不转头；仍然保留最大转动角度限制。'},
  {group:'gaze',key:'eyeStrength',label:'眼球灵敏度',min:0,max:2,step:.05,initial:1,unit:'×',hint:'根据模型有效的眼球骨骼或表情驱动视线。'},
  {group:'idle',key:'elbowBendDegrees',label:'肘部弯曲',min:-20,max:45,step:1,initial:0,unit:'°',advanced:true,hint:'小幅弯曲前臂，避免双臂过直。'},
  {group:'gaze',key:'smoothingMs',label:'跟随缓动时间',min:20,max:1000,step:10,initial:100,unit:' ms',advanced:true,hint:'数值越小跟上越快，越大越柔和。'},
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
  const reset=document.createElement('button');reset.type='button';reset.className='reset';reset.textContent='还原';reset.setAttribute('aria-label',`还原${spec.label}`);reset.onclick=()=>setValue(spec,undefined);
  heading.append(label,output,reset);
  const input=document.createElement('input');Object.assign(input,{type:'range',id:spec.key,min:String(spec.min),max:String(spec.max),step:String(spec.step),value:String(spec.initial)});
  input.oninput=()=>{try{setValue(spec,Number(input.value));}catch(error){$('#status').textContent=error.message;}};
  const hint=document.createElement('p');hint.className='hint';hint.textContent=spec.hint;
  row.append(heading,input);
  let manual;
  if(spec.manual){const wrap=document.createElement('label');wrap.className='manual';manual=document.createElement('input');manual.type='checkbox';manual.id='hand-manual';manual.onchange=()=>setValue(spec,manual.checked?Number(input.value):undefined);wrap.append(manual,document.createTextNode('手动设置张合'));row.append(wrap);}
  row.append(hint);$(spec.advanced?'#advanced-controls':'#basic-controls').append(row);controls.set(spec.key,{input,output,reset,manual});
}
function refreshControls(){
  const optional=currentModel?.capabilities.humanoid.optionalBones??[];
  const hasFingers=optional.some(name=>/(Thumb|Index|Middle|Ring|Little)/.test(name));
  for(const spec of specs){
    const c=controls.get(spec.key),value=adjustments[spec.group]?.[spec.key],available=Boolean(controller)&&(spec.key!=='eyeStrength'||currentModel.capabilities.lookAt.eyes)&&(spec.key!=='handCurl'||hasFingers);
    c.input.value=String(value??spec.initial);c.input.disabled=!available||(spec.manual&&value===undefined);c.reset.disabled=!available||value===undefined;
    if(c.manual){c.manual.checked=value!==undefined;c.manual.disabled=!available;}
    c.output.textContent=!available?'不可用':spec.manual&&value===undefined?'保持原动作':valueText(spec,value??spec.initial);
  }
  const lines=['starlite:'];
  if(Object.keys(adjustments.idle??{}).length)lines.push('  neutralAnimation: StarLiteIdle','  ambient:','    animations: [StarLiteIdle]');
  if(!Object.keys(adjustments).length)lines.push('  adjustments: {}');
  else{lines.push('  adjustments:');for(const [group,values]of Object.entries(adjustments)){lines.push(`    ${group}:`);for(const [key,value]of Object.entries(values))lines.push(`      ${key}: ${value}`);}}
  $('#config-output').value=lines.join('\n');
}
async function mount(id){
  const serial=++generation;abort?.abort();controller?.destroy();controller=undefined;abort=new AbortController();
  currentModel=models.find(model=>model.id===id);adjustments=structuredClone(saved.get(id)??{});refreshControls();$('#status').textContent='正在载入…';
  const rect=$('#stage').getBoundingClientRect(),height=Math.min(650,rect.height-10),width=Math.min(430,rect.width-12);
  try{
    const next=await mountModelWidget($('#model'),{backend:'vrm',model:currentModel.url,fallback:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',embeddedAnimations:currentModel.animations.map(a=>a.name),neutralAnimation:'StarLiteIdle',ambient:{animations:['StarLiteIdle']},adjustments,display:{width,height},render:{fps:60,maxDevicePixelRatio:1,fitPadding:.88},camera:{yawDegrees:0,pitchDegrees:3,fovDegrees:24,targetHeight:.52},mobile:{show:true},interactions:{pointer:$('#pointer').checked,click:false,drag:false}},{signal:abort.signal});
    if(serial!==generation){next.destroy();return;}controller=next;
    if(next.status!=='running'&&next.status!=='paused')throw Error('模型加载失败，请检查文件。');
    $('#status').textContent='已就绪 · 调节即时生效';$('#pause').textContent=next.status==='paused'?'继续':'暂停';
    const animations=next.getAnimations();$('#animation').replaceChildren(...animations.map(a=>new Option(a.name==='StarLiteIdle'?'系统默认 Idle':a.name,a.name)));$('#animation').value='StarLiteIdle';
    const caps=currentModel.capabilities;$('#capabilities').textContent=`${currentModel.title} · ${caps.lookAt.eyes?'眼球跟随可用':'无有效眼球绑定，仅头部跟随'} · ${caps.humanoid.optionalBones.some(name=>/(Thumb|Index|Middle|Ring|Little)/.test(name))?'按已映射的手指调整':'无标准手指映射'}`;
    refreshControls();
  }catch(error){if(serial===generation){$('#status').textContent=error.message;refreshControls();}}
}
$('#model').addEventListener('model-error',e=>{$('#status').textContent=e.detail;});
$('#model-select').onchange=e=>void mount(e.target.value);
$('#pointer').onchange=e=>controller?.setPointerEnabled(e.target.checked);
$('#pause').onclick=()=>{if(!controller)return;if(controller.status==='paused'){controller.resume();$('#pause').textContent='暂停';}else{controller.pause();$('#pause').textContent='继续';}};
$('#animation').onchange=()=>{const name=$('#animation').value;void controller?.playAnimation(name,{mode:name==='StarLiteIdle'?'loop':'once',restart:true}).then(()=>{if(controller?.diagnostics().activeAnimation==='StarLiteIdle')$('#animation').value='StarLiteIdle';});};
$('#reset-all').onclick=()=>{controller?.setModelAdjustments({});adjustments={};saved.set(currentModel?.id,{});refreshControls();};
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#config-output').value);$('#copy-result').textContent='已复制';}catch{$('#copy-result').textContent='请手动选择上方配置复制';}};
window.adjustmentPreview={get controller(){return controller;},get adjustments(){return structuredClone(adjustments);},get model(){return currentModel;},mount};
try{models=await(await fetch('/adjust-models.json')).json();if(!models.length)throw Error('请以 --model <avatar.vrm> 启动预览。');$('#model-select').replaceChildren(...models.map(model=>new Option(model.title,model.id)));await mount(models[0].id);}catch(error){$('#status').textContent=error.message;}
