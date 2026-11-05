// Run with NODE_PATH pointing to a locally installed Playwright. No external requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const url='http://127.0.0.1:8769/mypage/';
 let checked=0;
 for (const width of [320,390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:width<768?600:900}});
  let nonGet=0;
  await page.route('**/*',route=>{
   const request=route.request();
   if(request.method()!=='GET'){nonGet++;return route.abort();}
   if(request.url().startsWith(url))return route.continue();
   if(request.url().startsWith('https://challenges.cloudflare.com/turnstile/'))return route.fulfill({
    contentType:'text/javascript',
    body:'window.turnstile={render(selector,{action, language, size}){window.widgetOptions={action, language, size};document.querySelector(selector).style.height="140px";return 1}};'
   });
   return route.abort();
  });
  for (const path of ['', 'vakansii/', 'uk/', 'uk/vakansii/']) {
   const uk=path.startsWith('uk/');
   const label=width+'px /'+path;
   assert.equal((await page.goto(url+path)).status(),200,label);
   await page.evaluate(()=>document.fonts.ready.then(()=>true));
   const dialog=page.getByRole('dialog');
   const close=page.locator('.application-close');
   const links=page.locator('a[href="#application"]');
   const form=page.locator('#candidate-form');
   const name=form.locator('[name="name"]');
   const consent=form.locator('[name="consent"]');
   assert.equal(await dialog.count(),0,label);
   assert.equal(await page.locator('script[src*="turnstile"]').count(),0,label);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label);
   assert.equal(await links.count(),path.endsWith('vakansii/')?1:3,label);
   for(let i=0;i<await links.count();i++){
    const link=links.nth(i);
    if(i===0){await link.focus();await page.keyboard.press('Enter');}
    else await link.click();
    await dialog.waitFor({state:'visible'});
    assert.equal(new URL(page.url()).hash,'#application',label);
    assert.equal(await close.evaluate(e=>e===document.activeElement),true,label);
    assert.equal(await dialog.evaluate(e=>{
     const r=e.getBoundingClientRect();
     return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth;
    }),true,label);
    await page.waitForFunction(()=>window.widgetOptions);
    assert.deepEqual(await page.evaluate(()=>window.widgetOptions),{
     action:'candidate',language:uk?'uk':undefined,size:'compact'
    },label);
    assert.equal(await form.evaluate(e=>e.checkValidity()),false,label);
    assert.equal(await form.locator('button[type=submit]').isDisabled(),true,label);
    if(width===320){
     assert.equal(await dialog.evaluate(e=>e.scrollHeight>e.clientHeight),true,label);
     await dialog.evaluate(e=>{e.scrollTop=e.scrollHeight;});
     assert.equal(await dialog.evaluate(e=>e.scrollTop>0),true,label);
    }
    await page.keyboard.press('Tab');
    assert.equal(await name.evaluate(e=>e===document.activeElement),true,label);
    await name.fill('Draft');
    await consent.check();
    if(i===0)await page.keyboard.press('Escape');else await close.click();
    await dialog.waitFor({state:'hidden'});
    await page.waitForFunction(()=>location.hash!=='#application');
    assert.equal(await link.evaluate(e=>e===document.activeElement),true,label);
   }
   await links.first().click();
   assert.equal(await name.inputValue(),'Draft',label);
   assert.equal(await consent.isChecked(),true,label);
   for(const [field,value] of Object.entries({contact:'@draft_user',city:'Draft City',job:'Draft job'})){
    await form.locator(`[name="${field}"]`).fill(value);
   }
   await consent.uncheck();
   assert.equal(await form.evaluate(e=>e.checkValidity()),false,label);
   await consent.check();
   assert.equal(await form.evaluate(e=>e.checkValidity()),true,label);
   assert.equal(await form.locator('button[type=submit]').isDisabled(),true,label);
   await page.goBack();
   await dialog.waitFor({state:'hidden'});
   await page.goForward();
   await dialog.waitFor({state:'visible'});
   assert.equal(await name.inputValue(),'Draft',label);
   await page.goto(url+path+'?direct=1#application');
   await dialog.waitFor({state:'visible'});
   await close.click();
   await page.waitForFunction(()=>location.hash==='');
   assert.equal(new URL(page.url()).search,'?direct=1',label);
   assert.equal(await links.first().evaluate(e=>e===document.activeElement),true,label);
   if(!path.endsWith('vakansii/')){
    await page.locator('.ctas a[href="#contacts"]').click();
    assert.equal(new URL(page.url()).hash,'#contacts',label);
    await page.locator('#contacts a[href="#application"]').click();
    await dialog.waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>location.hash==='#contacts');
    const vacanciesLink=page.locator('.card-link a');
    await vacanciesLink.click();
    assert.equal(new URL(page.url()).pathname,new URL(url+path+'vakansii/').pathname,label);
    await page.goBack();
   }
   const other=page.locator('.language-switch a:not([aria-current])');
   const alternate=await other.getAttribute('href');
   await other.click();
   assert.equal(new URL(page.url()).pathname,alternate,label);
   checked++;
  }
  assert.equal(nonGet,0);
  await page.close();
 }
 if(process.argv.includes('--modal-only')){
  await browser.close();
  console.log('PASS: '+checked+' modal page/width combinations; no POST requests.');
  return;
 }
 // Clearly isolated fake transport to verify UI receipt logic; not a working integration.
 for(const mode of ['saved','negative','wrong-id','rate','timeout','bad-json','captcha','duplicate','empty-token','double-click']){
  const page=await browser.newPage();let body,posts=0;
  await page.route('**/*',async route=>{
   const u=route.request().url();
   if(u.endsWith('/assets/leads-config.js'))return route.fulfill({contentType:'text/javascript',body:'export const config={enabled:true,privacyApproved:true,privacyVersion:"mypage-privacy-2026-11-04-v1",endpoint:"https://offline.invalid/applications",turnstileSiteKey:"offline"};'});
   if(u.includes('challenges.cloudflare.com'))return route.fulfill({contentType:'text/javascript',body:`let c; window.turnstile={render:(el,opts)=>{c=opts.callback;queueMicrotask(c);return 1},getResponse:()=>${JSON.stringify(mode==='empty-token'?'':'offline')},reset:()=>queueMicrotask(c)};`});
   if(u==='https://offline.invalid/applications'){
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8769','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
    posts++;body=JSON.parse(route.request().postData());
    if(mode==='timeout')return route.abort();
    return route.fulfill({status:mode==='rate'?429:mode==='captcha'?403:mode==='duplicate'?409:200,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8769'},contentType:'application/json',body:mode==='bad-json'?'<html>error</html>':JSON.stringify({saved:['saved','double-click','wrong-id'].includes(mode),requestId:mode==='wrong-id'?'wrong':body.requestId,code:mode==='duplicate'?'DUPLICATE':undefined})});
   }
   if(u.startsWith('http://127.0.0.1:8769/'))return route.continue();
   return route.abort();
  });
  await page.goto(url);await page.locator('a[href="#application"]').first().click();await page.waitForFunction(()=>!document.querySelector('#candidate-form button').disabled);
  for(const [name,value] of Object.entries({name:'Test Candidate',contact:'@test_candidate',city:'Test City',job:'Test job'}))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="consent"]').check();await page.locator('#candidate-form button').click();
  if(mode==='double-click')await page.locator('#candidate-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>!document.querySelector('#application-status').textContent.includes('Ожидаем'));
  const message=await page.locator('#application-status').innerText();
  assert.equal(message.startsWith('Заявка сохранена.'),['saved','double-click'].includes(mode));
  assert.equal(posts,mode==='empty-token'?0:1);
  if(body)assert.equal(body.consent,true);
  if(['saved','double-click','negative','wrong-id','timeout','bad-json','duplicate'].includes(mode)){
   assert.equal(await page.locator('#candidate-form button').isDisabled(),true);
   await page.locator('#candidate-form').evaluate(f=>f.requestSubmit());assert.equal(posts,1);
  }
  if(['negative','wrong-id','timeout','bad-json'].includes(mode))assert.ok(message.includes(body.requestId));
  checked++;await page.close();
 }
 await browser.close();console.log('PASS: '+checked+' browser cases (modal and isolated receipt scenarios; no live Turnstile/API).');
})().catch(e=>{console.error(e);process.exit(1)});
