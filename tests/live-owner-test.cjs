// OWNER RUN ONLY after separate authorization of one synthetic Sheet/Telegram delivery.
// Opens a local override of the existing site's origin; does not deploy any site files.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 if(!process.argv.includes('--allow-one-live'))throw Error('No remote test authorized; use --allow-one-live only after approval');
 const {WORKER_ENDPOINT,TURNSTILE_SITE_KEY,PRIVACY_VERSION,MYPAGE_TEST_KEY}=process.env;
 if(!/^https:\/\/[^/]+\.workers\.dev\/applications$/.test(WORKER_ENDPOINT||'')||!TURNSTILE_SITE_KEY||!PRIVACY_VERSION||!MYPAGE_TEST_KEY)throw Error('Missing private local test configuration');
 const browser=await chromium.launch({headless:false,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage();let sent=0;
 await page.route('https://ivanzdaniekin.github.io/mypage/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname.endsWith('/assets/leads-config.js'))return route.fulfill({contentType:'text/javascript',body:'export const config='+JSON.stringify({enabled:true,privacyApproved:true,privacyVersion:PRIVACY_VERSION,endpoint:WORKER_ENDPOINT,turnstileSiteKey:TURNSTILE_SITE_KEY})});
  const allowed={'/mypage/':'index.html','/mypage/assets/leads.js':'assets/leads.js','/mypage/assets/style.css':'assets/style.css','/mypage/assets/portrait.jpg':'assets/portrait.jpg','/mypage/assets/background.jpg':'assets/background.jpg','/mypage/assets/favicon.svg':'assets/favicon.svg'};
  if(!allowed[pathname])return route.abort();
  const mime={html:'text/html',js:'text/javascript',css:'text/css',jpg:'image/jpeg',svg:'image/svg+xml'};
  return route.fulfill({body:fs.readFileSync(path.join(root,allowed[pathname])),contentType:mime[allowed[pathname].split('.').pop()]});
 });
 await page.route(WORKER_ENDPOINT,async route=>{
  const req=route.request();if(req.method()==='OPTIONS')return route.continue();
  const p=JSON.parse(req.postData());
  if(sent || p.name!=='Synthetic Candidate'||p.contact!=='@synthetic_candidate'||p.city!=='Synthetic City'||p.job!=='Synthetic job')return route.abort();
  sent++;
  // Private test key stays in the local test process, never in frontend JS or source files.
  return route.continue({headers:{...req.headers(),'X-Mypage-Test-Key':MYPAGE_TEST_KEY}});
 });
 await page.goto('https://ivanzdaniekin.github.io/mypage/');
 for(const [name,value] of Object.entries({name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job'}))await page.locator(`[name="${name}"]`).fill(value);
 console.log('Local preview opened. Owner must manually review consent, complete Turnstile and click submit ONCE. No automatic submission.');
 await page.waitForFunction(()=>document.querySelector('#application-status').textContent.startsWith('Заявка сохранена.'),{},{timeout:600000});
 console.log('Worker confirmed saved=true. Owner must verify exactly one Лист1 row, SAVED journal and Telegram delivery after authorized retry trigger.');
 await browser.close();
})().catch(()=>{console.error('Live test not confirmed. Check configuration/outcome privately; do not blindly resubmit.');process.exitCode=1});
