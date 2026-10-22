import {expect,test} from "@playwright/test";

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
  await page.locator('#headStrength').focus();await page.locator('#headStrength').press('Home');
  await expect(page.locator('#config-output')).toHaveValue(/headStrength: 0/);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.locator('[data-model-status="paused"]')).toHaveCount(1);
  await page.locator('#palmTwistDegrees').focus();await page.locator('#palmTwistDegrees').press('Home');
  await expect(page.locator('#config-output')).toHaveValue(/palmTwistDegrees: -45/);
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
