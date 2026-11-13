import {expect, test, type Page} from "@playwright/test";

async function bodyPoint(page: Page) {
  return page.evaluate(() => {
    const c=(globalThis as any).__hexoStarLiteWidgetState.controller;
    c.captureFrame();
    const canvas=document.querySelector<HTMLCanvasElement>('.model-vrm-widget canvas')!, rect=canvas.getBoundingClientRect();
    const sample=document.createElement('canvas');sample.width=canvas.width;sample.height=canvas.height;
    const ctx=sample.getContext('2d')!;ctx.drawImage(canvas,0,0);
    const data=ctx.getImageData(0,0,sample.width,sample.height).data;
    for(let y=Math.floor(sample.height*.45);y<sample.height;y++)for(let x=Math.floor(sample.width*.5);x<sample.width;x++) {
      if(data[(y*sample.width+x)*4+3]!>128) return {x:rect.x+(x+.5)/sample.width*rect.width,y:rect.y+(y+.5)/sample.height*rect.height};
    }
    throw new Error('No visible model pixel');
  });
}

test('middle-button inspection preserves page clicks, playback, gaze preferences and pause', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4182/');
  await expect(page.locator('.model-vrm-widget')).toHaveAttribute('data-model-status','running');
  await page.evaluate(() => {
    const g=globalThis as any;g.inspectionCanvas=document.querySelector('canvas');g.underlyingClicks=0;
    const link=document.createElement('a');link.href='#inspection-underlay';link.id='inspection-link';link.textContent='Underlying article';
    link.style.cssText='position:fixed;inset:0;z-index:1';link.addEventListener('click',()=>g.underlyingClicks++);document.body.append(link);
  });
  const point=await bodyPoint(page);
  const popups:any[]=[];page.on('popup',p=>popups.push(p));
  await page.mouse.move(point.x,point.y);await page.mouse.down({button:'middle'});
  await page.mouse.move(point.x-85,point.y+25,{steps:12});await page.mouse.up({button:'middle'});
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.controller.inspecting)).toBe(true);
  const hint=page.locator('[data-starlite-inspection-hint]');await expect(hint).toBeVisible();
  await page.mouse.move(50,50);
  await expect.poll(()=>page.evaluate(()=>Math.abs((globalThis as any).__hexoStarLiteWidgetState.controller.diagnostics().gaze.headYawDegrees))).toBeLessThan(.05);
  await expect(hint).toBeHidden({timeout:4500});
  expect(await page.evaluate(()=>location.hash)).toBe('');expect(popups).toHaveLength(0);
  const result=await page.evaluate(async()=>{
    const c=(globalThis as any).__hexoStarLiteWidgetState.controller;
    c.setDisplaySize(280,400);
    return {play:await c.playAnimation('StarLiteCuriousPeek'),inspecting:c.inspecting};
  });
  expect(result).toEqual({play:'completed',inspecting:true});
  const rotated=await bodyPoint(page);
  await page.mouse.click(rotated.x,rotated.y,{button:'middle'});
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.controller.inspecting)).toBe(false);
  await page.waitForTimeout(350);await page.mouse.move(30,30);
  await expect.poll(()=>page.evaluate(()=>Math.abs((globalThis as any).__hexoStarLiteWidgetState.controller.diagnostics().gaze.headYawDegrees))).toBeGreaterThan(.1);
  const restored=await bodyPoint(page);await page.mouse.click(restored.x,restored.y);
  await expect(page).toHaveURL(/#inspection-underlay$/);expect(await page.evaluate(()=>(globalThis as any).underlyingClicks)).toBe(1);
  await page.evaluate(()=>{const c=(globalThis as any).__hexoStarLiteWidgetState.controller;c.setPointerEnabled(false);c.pause();});
  const paused=await bodyPoint(page);
  await page.mouse.move(paused.x,paused.y);await page.mouse.down({button:'middle'});await page.mouse.move(paused.x-50,paused.y,{steps:6});await page.mouse.up({button:'middle'});
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.controller.inspecting)).toBe(true);
  await page.evaluate(()=>{const c=(globalThis as any).__hexoStarLiteWidgetState.controller;c.resetCamera();});await page.waitForTimeout(350);
  await expect(page.locator('.model-vrm-widget')).toHaveAttribute('data-model-status','paused');
  await page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.controller.resume());await page.mouse.move(60,60);await page.waitForTimeout(500);
  await expect.poll(()=>page.evaluate(()=>Math.abs((globalThis as any).__hexoStarLiteWidgetState.controller.diagnostics().gaze.headYawDegrees))).toBeLessThan(.01);
  expect(await page.evaluate(()=>document.querySelector('canvas')===(globalThis as any).inspectionCanvas)).toBe(true);
  expect(errors).toEqual([]);
});
