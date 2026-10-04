const output=document.querySelector("#qa");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value,message)=>{if(!value)throw new Error(message)};
const percentile=(array,p)=>{const a=[...array].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]??0};
const measure=c=>{const d=c.diagnostics();return {...d,frameTimesMs:undefined,renderCostsMs:undefined,frameP50:percentile(d.frameTimesMs,.5),frameP95:percentile(d.frameTimesMs,.95),frameP99:percentile(d.frameTimesMs,.99),updateP95:percentile(d.renderCostsMs,.95),heapUsed:performance.memory?.usedJSHeapSize}};
const save=async report=>{report.browser=navigator.userAgent;report.date=new Date().toISOString();await fetch('/qa-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)})};
let busy=false;
async function run(kind){
 if(busy)return;busy=true;
 const environment=["webview2","edge"].includes(new URLSearchParams(location.search).get("environment"))?new URLSearchParams(location.search).get("environment"):"iab";
 const report={kind,environment,checks:[],samples:[]};
 try{
  const {mount}=window.preview;let c;
  if(kind==='long'){
   c=await mount('desktop',30);assert(c.status==='running','model not running');
   const started=performance.now();
   while(performance.now()-started<15*60*1000){await delay(10000);assert(c.status==='running','tab hidden or renderer paused; benchmark invalid');report.samples.push({...measure(c),elapsedMs:performance.now()-started});output.textContent=`待机检查 ${Math.floor((performance.now()-started)/60000)} / 15 分钟`}
   report.elapsedMs=performance.now()-started;
  }else{
   c=await mount('desktop',30);assert(c.status==='running','model not running');
   for(const a of c.getAnimations()){
    output.textContent='动作检查：'+a.name;
    const first=c.playAnimation(a.name,{mode:'loop',restart:true});await delay(a.durationMs/2);
    await new Promise(requestAnimationFrame);
    const image=new Image();image.src=c.captureFrame();image.alt=a.name;image.title=a.name;image.style.cssText='width:180px;height:270px;object-fit:contain;background:#26384c';
    let gallery=document.querySelector('#gallery');if(!gallery){gallery=document.createElement('section');gallery.id='gallery';gallery.style.cssText='position:absolute;top:100vh;left:0;right:0;display:flex;flex-wrap:wrap;padding:24px;gap:12px;background:#101c2a';document.body.append(gallery)}
    gallery.append(image);
    c.pause();const frames=c.diagnostics().renderedFrames;await delay(200);assert(c.diagnostics().renderedFrames===frames,'pause advanced frames');c.resume();
    await delay(300);c.stopAnimation();assert(await first==='stopped','loop did not stop');
    const once=c.playAnimation(a.name,{mode:'once',restart:true});await delay(a.durationMs+300);
    assert(await once==='completed','single clip did not complete');report.checks.push(a.name);
   }
   const response=c.getAnimations().find(a=>a.name.startsWith('Click'));
   if(response&&c.getAnimations().some(a=>a.name==='Working')){
    const click=c.playAnimation(response.name,{mode:'once'});const working=c.playAnimation('Working',{mode:'once'});assert(await click==='interrupted','click interruption');c.stopAnimation();assert(await working==='stopped','working stop');
   }
   for(let i=0;i<20;i++){
    output.textContent=`挂载检查 ${i+1} / 20`;const old=c;c=await mount('desktop',30);old.destroy();old.destroy();assert(c.status==='running','remount failed');assert(document.querySelectorAll('#model canvas').length===1,'duplicate canvas');await delay(100);report.samples.push({cycle:i+1,...measure(c)});
   }
   for(const variant of ['original','desktop','blog'])for(const fps of [30,60]){
    output.textContent=`帧时间检查 ${variant} / ${fps}`;c=await mount(variant,fps);assert(c.status==='running','variant failed');await delay(30000);report.samples.push({variant,fps,...measure(c)});
   }
  }
  report.passed=true;output.textContent='检查通过，报告已保存在本地';await save(report);return true;
 }catch(e){report.passed=false;report.error=String(e);output.textContent=String(e);await save(report)}finally{busy=false}
}
document.querySelector('#check').onclick=async()=>{if(await run('validation'))await run('long')};document.querySelector('#long').onclick=()=>run('long');

if(new URLSearchParams(location.search).get("run")==="full") { if(await run("validation"))await run("long"); }

async function gallery(){
 if(busy)return;busy=true;
 try{const c=window.preview.controller;document.querySelector('#gallery')?.remove();
 const section=document.createElement('section');section.id='gallery';section.style.cssText='position:absolute;top:100vh;left:0;right:0;display:flex;flex-wrap:wrap;padding:24px;gap:12px;background:#101c2a';document.body.append(section);
 for(const a of c.getAnimations()){output.textContent='姿态预览：'+a.name;c.resume();void c.playAnimation(a.name,{mode:'loop',restart:true});await delay(a.durationMs/2);c.pause();const item=document.createElement('figure');item.style.margin='0';const img=new Image();img.src=c.captureFrame();img.alt=a.name;img.style.cssText='width:220px;height:330px;background:#26384c';const label=document.createElement('figcaption');label.textContent=a.name;item.append(img,label);section.append(item)}
 c.stopAnimation();c.resume();output.textContent='全部已配置动作预览已生成';
 }finally{busy=false}
}
document.querySelector('#gallery-button').onclick=gallery;
