// Run with NODE_PATH pointing to a locally installed Playwright. No external requests.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const useWebKit=process.argv.includes('--webkit');
 const browser=useWebKit?await webkit.launch():await chromium.launch({
  headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
 });
 const url=process.env.MYPAGE_TEST_URL||'http://127.0.0.1:8769/mypage/';
 const origin=new URL(url).origin;
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
 // Intercept all nonlocal traffic. These receipts never reach a server.
 const {validate}=await import('../backend/worker.mjs');
 const version='mypage-privacy-2026-11-04-v1';
 const successModes=['saved','double-click','multiline'];
 const cases=[...successModes,'negative','wrong-id','rate','timeout','bad-json','captcha','duplicate','validation','upstream','empty-token','expired'];
 for(const mode of cases){
  const uk=mode==='validation'||mode==='multiline';
  const page=await browser.newPage({viewport:{width:390,height:600}});
  let body,posts=0;
  const allowOrigin={'Access-Control-Allow-Origin':origin};
  await page.route('**/*',async route=>{
   const request=route.request(), u=request.url();
   if(u.endsWith('/assets/leads-config.js'))return route.fulfill({
    contentType:'text/javascript',
    body:`export const config={enabled:true,privacyApproved:true,privacyVersion:"${version}",endpoint:"https://offline.invalid/applications",turnstileSiteKey:"offline"};`
   });
   if(u.includes('challenges.cloudflare.com'))return route.fulfill({
    contentType:'text/javascript',
    body:`window.resets=0; window.renders=0; let callbacks;
    window.turnstile={
     render(selector,options){
      window.renders++; callbacks=options; window.expire=options['expired-callback'];
      document.querySelector(selector).style.height='140px';
      queueMicrotask(()=>options.callback(${JSON.stringify(mode==='empty-token'?'':'offline-token')}));
      return 1;
     },
     reset(){
      window.resets++;
      callbacks['error-callback']();
      queueMicrotask(()=>callbacks.callback('offline-fresh-token'));
     }
    };`
   });
   if(u==='https://offline.invalid/applications'){
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
     ...allowOrigin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'
    }});
    posts++;
    body=JSON.parse(request.postData());
    if(mode==='timeout')return route.abort();
    if(mode==='multiline')assert.equal(validate(body,version).job,'First line Second line');
    const status={rate:429,captcha:403,duplicate:409,validation:400,upstream:502}[mode]??200;
    return route.fulfill({status,headers:allowOrigin,contentType:'application/json',
     body:mode==='bad-json'?'<html>error</html>':JSON.stringify({
      saved:successModes.includes(mode)||mode==='wrong-id',
      requestId:mode==='wrong-id'?'wrong':body.requestId,
      code:mode==='duplicate'?'DUPLICATE':undefined
     })
    });
   }
   if(u.startsWith(url)&&request.method()==='GET')return route.continue();
   return route.abort();
  });

  await page.goto(url+(uk?'uk/':''));
  const entry=page.locator('a[href="#application"]').first();
  await entry.click();
  await page.waitForFunction(()=>window.renders===1);
  const form=page.locator('#candidate-form');
  const status=page.locator('#application-status');
  const submit=form.locator('button[type=submit]');
  const job=['multiline','validation'].includes(mode)?'First line\nSecond line':'Test job';
  for(const [name,value] of Object.entries({name:'Test Candidate',contact:'@test_candidate',city:'Test City',job}))
   await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="consent"]').check();
  if(mode==='expired')await page.evaluate(()=>window.expire());
  if(['empty-token','expired'].includes(mode)){
   assert.equal(await submit.isDisabled(),true);
   await form.evaluate(e=>e.requestSubmit());
   assert.match(await status.textContent(),/Пройдите проверку/);
   assert.equal(posts,0);
   assert.equal(await page.evaluate(()=>window.resets),0);
  }else{
   await submit.click();
   if(mode==='double-click')await form.evaluate(e=>e.requestSubmit());
   await page.waitForFunction(()=>!document.querySelector('#application-status').textContent.match(/Ожидаем|Очікуємо/));
   const message=await status.textContent();
   const saved=successModes.includes(mode);
   const terminal=saved||['negative','wrong-id','timeout','bad-json','duplicate','upstream'].includes(mode);
   assert.equal(/^Заявк[ау] сохранена|^Заявку збережено/.test(message),saved,mode);
   assert.equal(posts,1,mode);
   assert.equal(body.consent,true,mode);
   assert.equal(body.turnstileToken,'offline-token',mode);
   assert.equal(await page.evaluate(()=>window.resets),terminal?0:1,mode);
   if(mode==='validation')assert.match(message,/Перевірте ім’я/);
   if(['negative','wrong-id','timeout','bad-json','upstream'].includes(mode))assert.ok(message.includes(body.requestId),mode);
   if(terminal){
    assert.equal(await submit.isDisabled(),true,mode);
    await form.evaluate(e=>e.requestSubmit());
    assert.equal(posts,1,mode);
   }
   if(saved){
    assert.equal(await form.isHidden(),true,mode);
   }else{
    assert.equal(await form.isVisible(),true,mode);
    assert.equal(await form.locator('[name="job"]').inputValue(),job,mode);
    assert.equal(await form.locator('[name="consent"]').isChecked(),true,mode);
   }
  }
  assert.equal(await page.getByRole('dialog').isVisible(),true,mode);
  assert.equal(await status.evaluate(element=>{
   const r=element.getBoundingClientRect();
   const modal=element.closest('dialog').getBoundingClientRect();
   return document.activeElement===element&&r.top>=modal.top&&r.bottom<=modal.bottom;
  }),true,mode);
  await page.locator('.application-close').click();
  await entry.click();
  assert.equal(await page.evaluate(()=>window.renders),1,mode);
  checked++;
  await page.close();
 }
 await browser.close();console.log('PASS: '+checked+' browser cases (modal and isolated receipt scenarios; no live Turnstile/API).');
})().catch(e=>{console.error(e);process.exit(1)});
