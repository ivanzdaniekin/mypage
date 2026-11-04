// Run with NODE_PATH pointing to a locally installed Playwright. No external requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const url='http://127.0.0.1:8769/mypage/';
 let checked=0;
 for(const width of [320,375,390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  let attempted=0;
  await page.route('**/*',route=>{
   if(route.request().url().startsWith('http://127.0.0.1:8769/'))return route.continue();
   attempted++;return route.abort();
  });
  await page.goto(url);await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#candidate-form button').isDisabled(),true);
  assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth),false);
  assert.equal(attempted<=3,true); // fonts may be attempted; no Turnstile or API while disabled
  assert.equal(await page.locator('script[src*="turnstile"]').count(),0);
  if(width===390)await page.screenshot({path:'/private/tmp/mypage-form-mobile.png',fullPage:true});
  checked++;await page.close();
 }
 // Clearly isolated fake transport to verify UI receipt logic; not a working integration.
 for(const mode of ['saved','negative','wrong-id','rate','timeout']){
  const page=await browser.newPage();let body;
  await page.route('**/*',async route=>{
   const u=route.request().url();
   if(u.endsWith('/assets/leads-config.js'))return route.fulfill({contentType:'text/javascript',body:'export const config={enabled:true,privacyApproved:true,privacyVersion:"test-v1",endpoint:"https://offline.invalid/applications",turnstileSiteKey:"offline"};'});
   if(u.includes('challenges.cloudflare.com'))return route.fulfill({contentType:'text/javascript',body:'let c; window.turnstile={render:(el,opts)=>{c=opts.callback;queueMicrotask(c);return 1},getResponse:()=>"offline",reset:()=>queueMicrotask(c)};'});
   if(u==='https://offline.invalid/applications'){
    body=JSON.parse(route.request().postData());
    if(mode==='timeout')return route.abort();
    return route.fulfill({status:mode==='rate'?429:200,contentType:'application/json',body:JSON.stringify({saved:mode==='saved'||mode==='wrong-id',requestId:mode==='wrong-id'?'wrong':body.requestId})});
   }
   if(u.startsWith('http://127.0.0.1:8769/'))return route.continue();
   return route.abort();
  });
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#candidate-form button').disabled);
  for(const [name,value] of Object.entries({name:'Test Candidate',contact:'@test_candidate',city:'Test City',job:'Test job'}))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="consent"]').check();await page.locator('#candidate-form button').click();
  await page.waitForFunction(()=>!document.querySelector('#application-status').textContent.includes('Ожидаем'));
  const message=await page.locator('#application-status').innerText();
  assert.equal(message.startsWith('Заявка сохранена.'),mode==='saved');
  assert.equal(body.consent,true);checked++;await page.close();
 }
 await browser.close();console.log('PASS: '+checked+' browser cases (5 widths disabled, 5 isolated receipt scenarios).');
})().catch(e=>{console.error(e);process.exit(1)});
