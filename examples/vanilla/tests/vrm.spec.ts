import {expect,test} from "@playwright/test";
test("single VRM gets default Idle and text-only dialogue, waits for load and survives PJAX",async({page})=>{
 let loaded=false;const requests:{url:string;loaded:boolean}[]=[];
 page.on("load",()=>{loaded=true});page.on("request",r=>requests.push({url:r.url(),loaded}));
 await page.goto("http://127.0.0.1:4182/");
 await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
 await expect(page.getByRole("heading",{name:"Article first"})).toBeVisible();
 const bubble=page.locator('.model-widget__bubble');
 await expect(bubble).toHaveText("Hello from StarLite");
 const catalog = await page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.controller.getAnimations());
 expect(catalog.map((clip:any)=>clip.name)).toContain("StarLiteIdle");
 for(let i=0;i<20;i++)await page.getByRole("button",{name:"Simulate PJAX"}).click();
 await expect(page.locator("canvas")).toHaveCount(1);
 expect(requests.filter(r=>r.url.endsWith(".vrm"))).toHaveLength(1);
 expect(requests.filter(r=>r.url.endsWith(".vrma"))).toHaveLength(0);
 expect(requests.filter(r=>/\.(vrm|vrma|js)$/.test(r.url)).every(r=>r.loaded)).toBe(true);
 expect(requests.some(r=>r.url.endsWith(".wasm"))).toBe(false);
});
test("mobile makes zero VRM, motion, profile or renderer requests",async({page})=>{
 await page.setViewportSize({width:390,height:844});const requests:string[]=[];page.on("request",r=>requests.push(r.url()));
 await page.goto("http://127.0.0.1:4182/");await expect(page.locator("[data-starlite-widget-host]")).toHaveCount(0);
 expect(requests.some(url=>/\.(js|vrm|vrma|json|wasm)$/.test(url))).toBe(false);
});
test("renderer import failure hides the companion, leaves links clickable and retries a fresh module URL",async({page})=>{
 const requests:string[]=[];
 await page.route("**/vrm-widget/**/index.js*",route=>{
  requests.push(route.request().url());return requests.length===1?route.abort():route.continue();
 });
 await page.goto("http://127.0.0.1:4182/");
 const host=page.locator("[data-starlite-widget-host]");
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.failed)).toBe(true);
 await expect(host).toHaveCSS("visibility","hidden");await expect(host).toHaveCSS("pointer-events","none");await expect(host.locator("img")).toHaveCount(0);
 await page.evaluate(()=>{
  const link=document.createElement("a");link.id="under-companion";link.href="#article";link.textContent="Read article";
  link.style.cssText="position:fixed;right:16px;bottom:0;width:320px;height:480px;z-index:1";document.body.append(link);
 });
 // Use coordinates rather than forced dispatch, so normal browser hit testing
 // proves the transparent/failed companion does not intercept the link.
 await page.mouse.click(1200,650);await expect(page).toHaveURL(/#article$/);
 await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
 expect(requests).toHaveLength(2);expect(requests[1]).toContain("starlite-retry=1");
 await expect(host).toHaveCSS("visibility","visible");await expect(page.locator("canvas")).toHaveCount(1);
});
test("model fetch and later context loss recover without reimporting runtime or replaying entrance",async({page})=>{
 let attempts=0;const runtimes:string[]=[];
 page.on("request",request=>{if(/\/vrm-widget\/.*\/index\.js/.test(request.url()))runtimes.push(request.url())});
 await page.route("**/vrm-model/**/model.vrm",route=>++attempts===1?route.abort():route.continue());
 await page.goto("http://127.0.0.1:4182/");
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__hexoStarLiteWidgetState.failed)).toBe(true);
 await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);expect(attempts).toBe(2);
 await expect(page.locator('.model-widget__bubble')).toHaveText("Hello from StarLite");
 await page.evaluate(()=>document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost",{cancelable:true})));
 await expect(page.locator("[data-starlite-widget-host]")).toHaveCSS("visibility","hidden");
 await page.getByRole("button",{name:"Simulate PJAX"}).click();await expect(page.locator('#result')).toHaveText("PJAX dispatched");
 await expect(page.locator('[data-model-status="running"]')).toHaveCount(1,{timeout:10000});
 expect(attempts).toBe(3);expect(runtimes).toHaveLength(1);await expect(page.locator("canvas")).toHaveCount(1);
 await expect(page.locator('.model-widget__bubble')).not.toBeVisible();
});
