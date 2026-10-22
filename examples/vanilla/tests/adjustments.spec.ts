import {expect,test,type Page} from "@playwright/test";

const consoleDiagnostics=new WeakMap<Page,{time:number;type:string;text:string}[]>();

test.beforeEach(async({page})=>{
  const messages:{time:number;type:string;text:string}[]=[];
  consoleDiagnostics.set(page,messages);
  page.on('console',message=>{
    if(messages.length<40&&['warning','error'].includes(message.type()))messages.push({time:Date.now(),type:message.type(),text:message.text().slice(0,8192)});
  });
  await page.addInitScript(()=>{
    const evidence:{context?:Record<string,unknown>;events:Record<string,unknown>[]}={events:[]};
    (globalThis as any).__starliteGpuDiagnostics=evidence;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:any[]):any{
      const context=Reflect.apply(original,this,args);
      if(args[0]==='webgl2'&&evidence.context===undefined){
        const record:Record<string,unknown>={time:performance.now(),available:Boolean(context)};
        evidence.context=record;
        if(context){
          const gl=context as WebGL2RenderingContext;
          try{
            record.version=gl.getParameter(gl.VERSION);record.vendor=gl.getParameter(gl.VENDOR);record.renderer=gl.getParameter(gl.RENDERER);
            record.shadingLanguageVersion=gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
            const debug=gl.getExtension('WEBGL_debug_renderer_info');
            if(debug){record.unmaskedVendor=gl.getParameter(debug.UNMASKED_VENDOR_WEBGL);record.unmaskedRenderer=gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);}
            record.parallelShaderCompile=Boolean(gl.getExtension('KHR_parallel_shader_compile'));
          }catch(error){record.readError=String(error).slice(0,1024);}
          for(const type of ['webglcontextlost','webglcontextrestored'])this.addEventListener(type,event=>{
            if(evidence.events.length<12)evidence.events.push({type,time:performance.now(),statusMessage:(event as WebGLContextEvent).statusMessage?.slice(0,1024)});
          });
        }
      }
      return context;
    } as typeof original;
  });
});

test.afterEach(async({page,browser},testInfo)=>{
  if(testInfo.status===testInfo.expectedStatus)return;
  const pageEvidence=await page.evaluate(()=>({gpu:(globalThis as any).__starliteGpuDiagnostics,modelStatus:document.querySelector('#model')?.getAttribute('data-model-status'),notice:document.querySelector('#status')?.textContent})).catch(()=>({unavailable:'Page could not be inspected after failure'}));
  await testInfo.attach('webgl-diagnostics',{contentType:'application/json',body:JSON.stringify({browserVersion:browser.version(),channel:process.env.STARLITE_BROWSER_CHANNEL??'chromium',workerIndex:testInfo.workerIndex,console:consoleDiagnostics.get(page)??[],...pageEvidence},null,2)});
});

test("model adjustments preserve one loaded model and export zero values",async({page})=>{
  const models:string[]=[],errors:string[]=[];
  page.on("request",request=>{if(request.url().endsWith('.vrm'))models.push(request.url());});
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4183/adjust');
  await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
  await page.evaluate(()=>{(globalThis as any).__adjustCanvas=document.querySelector('canvas');});
  await page.locator('#armLiftDegrees').focus();await page.locator('#armLiftDegrees').press('End');
  await expect(page.locator('#config-output')).toHaveValue(/armLiftDegrees: 45/);
  await expect(page.locator('#config-output')).toHaveValue(/neutralAnimation: StarLiteIdle/);
  await page.locator('#wristLiftDegrees').focus();await page.locator('#wristLiftDegrees').press('End');
  await expect(page.locator('#config-output')).toHaveValue(/wristLiftDegrees: 45/);
  await page.locator('#palmTwistDegrees').focus();await page.locator('#palmTwistDegrees').press('End');
  await expect(page.locator('#config-output')).toHaveValue(/palmTwistDegrees: 45/);
  await page.locator('#headStrength').focus();await page.locator('#headStrength').press('Home');
  await expect(page.locator('#config-output')).toHaveValue(/headStrength: 0/);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.locator('[data-model-status="paused"]')).toHaveCount(1);
  await page.locator('#palmTwistDegrees').focus();await page.locator('#palmTwistDegrees').press('Home');
  await expect(page.locator('#config-output')).toHaveValue(/palmTwistDegrees: -45/);
  await page.locator('#wristLiftDegrees').focus();await page.locator('#wristLiftDegrees').press('Home');
  await expect(page.locator('#config-output')).toHaveValue(/wristLiftDegrees: -45/);
  await page.getByRole('button',{name:'还原手腕抬高',exact:true}).click();
  await expect(page.locator('#config-output')).not.toHaveValue(/wristLiftDegrees:/);
  await page.getByRole('button',{name:'全部还原',exact:true}).click();
  await expect(page.locator('#config-output')).toHaveValue('starlite:\n  adjustments: {}');
  await page.locator('#headStrength').focus();await page.locator('#headStrength').press('Home');
  await expect(page.locator('#config-output')).not.toHaveValue(/neutralAnimation:/);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.querySelector('canvas')===(globalThis as any).__adjustCanvas)).toBe(true);
  expect(models).toHaveLength(1);expect(errors).toEqual([]);
});

test("adjustment preview explains absent eye and finger capabilities",async({page})=>{
  await page.goto('http://127.0.0.1:4183/adjust');
  await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
  await expect(page.locator('#eyeStrength')).toBeDisabled();
  await expect(page.locator('#hand-manual')).toBeDisabled();
  await expect(page.locator('#capabilities')).toContainText('无有效眼球绑定');
  await expect(page.locator('#capabilities')).toContainText('无标准手指映射');
});
