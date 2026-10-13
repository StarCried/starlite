import {expect,test} from "@playwright/test";
test("VRM Hexo waits for document load and retains one instance across PJAX",async({page})=>{
 let loaded=false;const requests:{url:string;loaded:boolean}[]=[];
 page.on("load",()=>{loaded=true});page.on("request",r=>requests.push({url:r.url(),loaded}));
 await page.goto("http://127.0.0.1:4182/");
 await expect(page.locator('[data-model-status="running"]')).toHaveCount(1);
 await expect(page.getByRole("heading",{name:"Article first"})).toBeVisible();
 const bubble=page.locator('.model-widget__bubble');
 await expect(bubble).toHaveText("Hello from Idle");await expect(bubble).toHaveAttribute("data-model-animation","Idle");
 for(let i=0;i<20;i++)await page.getByRole("button",{name:"Simulate PJAX"}).click();
 await expect(page.locator("canvas")).toHaveCount(1);
 expect(requests.filter(r=>r.url.endsWith(".vrm"))).toHaveLength(1);
 expect(requests.filter(r=>r.url.endsWith(".vrma"))).toHaveLength(1);
 expect(requests.filter(r=>/\.(vrm|vrma|js)$/.test(r.url)).every(r=>r.loaded)).toBe(true);
 expect(requests.some(r=>r.url.endsWith(".wasm"))).toBe(false);
});
test("mobile makes zero VRM, motion, profile or renderer requests",async({page})=>{
 await page.setViewportSize({width:390,height:844});const requests:string[]=[];page.on("request",r=>requests.push(r.url()));
 await page.goto("http://127.0.0.1:4182/");await expect(page.locator("[data-starlite-widget-host]")).toHaveCount(0);
 expect(requests.some(url=>/\.(js|vrm|vrma|json|wasm)$/.test(url))).toBe(false);
});
test("renderer load failure leaves a visible static companion",async({page})=>{
 await page.route("**/vrm-widget/**/index.js",route=>route.abort());await page.goto("http://127.0.0.1:4182/");
 await expect(page.getByAltText("角色暂时无法加载")).toBeVisible();await expect(page.locator("canvas")).toHaveCount(0);
});
