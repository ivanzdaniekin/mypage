import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {harness} from './apps-harness.mjs';
import {handle,verifySaveReceipt,validate} from '../backend/worker.mjs';
import {signedReceipt} from './receipt-fixture.mjs';
const id='f20b1b0c-887a-43d4-b671-5a303d09ffc0';
const lead={requestId:id,name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job',consent:true,privacyVersion:'test-v2'};
function service(failD1=false){
 const h=harness(),db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){
  const stmt=db.prepare(sql);
  return {bind(...args){return {
   first:()=>{if(failD1&&sql.startsWith('UPDATE receipts'))throw Error('offline D1 failure');return stmt.get(...args);},
   run:()=>{if(failD1&&sql.startsWith('UPDATE receipts'))throw Error('offline D1 failure');return stmt.run(...args);}
  };}};
 }};
 const env={DB,ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_VERSION:'test-v2',SIGNING_SECRET:h.props.MYPAGE_SIGNING_SECRET,HASH_SECRET:'offline-hash',TURNSTILE_SECRET:'offline',APPS_SCRIPT_URL:'https://script.google.com/macros/s/offline/exec'};
 const request=(change={},method='POST')=>new Request('https://offline.invalid/applications',{method,headers:{Origin:'https://ivanzdaniekin.github.io','CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({...lead,turnstileToken:'offline',...change})}:{})});
 let receipt,posts=0,gets=0;
 const fetcher=async(url,opts)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
  if(opts.method==='POST'){posts++;receipt=JSON.parse(h.ctx.doPost({postData:{contents:opts.body}}).getContent());return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/offline'}});}
  gets++;assert.equal(opts.body,undefined);return Response.json(receipt);
 };
 return {h,db,env,request,fetcher,counts:()=>({posts,gets})};
}
test('signed actual Code.gs → 302 → GET → Worker → D1 and same-ID retry',async()=>{
 const s=service();assert.equal((await handle(s.request(),s.env,s.fetcher)).status,200);
 assert.equal(s.db.prepare('SELECT saved FROM receipts').get().saved,1);assert.equal(s.h.data['Лист1'].length,2);
 assert.equal((await handle(s.request(),s.env,s.fetcher)).status,200);assert.deepEqual(s.counts(),{posts:1,gets:1});
 assert.equal((await handle(s.request({job:'Other role'}),s.env,s.fetcher)).status,409);assert.equal(s.h.data['Лист1'].length,2);
});
test('new-ID fingerprint duplicate is not falsely confirmed or appended',async()=>{
 const s=service();await handle(s.request(),s.env,s.fetcher);
 const newId='00000000-0000-4000-8000-000000000004';
 const res=await handle(s.request({requestId:newId}),s.env,s.fetcher);
 assert.equal(res.status,409);assert.equal((await res.json()).code,'DUPLICATE');
 assert.equal(s.h.data['Лист1'].length,2);assert.equal(s.h.data.MypageJournalV2.length,2);
 assert.equal(s.db.prepare('SELECT saved FROM receipts WHERE id=?').get(newId).saved,0);
});
test('forged, stale, future, wrong-ID and wrong-content confirmations rejected',async()=>{
 const key='offline',p=validate(lead,'test-v2'),now=Math.floor(Date.now()/1000);
 const good=await signedReceipt(key,p,id);await verifySaveReceipt(good,key,id,p);
 for(const bad of [{...good,confirmation:undefined},{...good,confirmation:{...good.confirmation,signature:'0'.repeat(64)}},await signedReceipt(key,p,id,now-301),await signedReceipt(key,p,id,now+60),await signedReceipt(key,{...p,job:'Other'},id),await signedReceipt(key,p,'wrong')])await assert.rejects(()=>verifySaveReceipt(bad,key,id,p,now));
});
test('D1 confirmation failure remains unconfirmed and logs only a finite diagnostic',async()=>{
 const s=service(true),logs=[],warn=console.warn;console.warn=x=>logs.push(JSON.parse(x));
 try{assert.equal((await handle(s.request(),s.env,s.fetcher)).status,502);}finally{console.warn=warn;}
 assert.equal(s.h.data.MypageJournalV2[1][8],'SAVED');assert.equal(s.db.prepare('SELECT saved FROM receipts').get().saved,0);assert.equal(logs[0].code,'D1_CONFIRM');
});
test('zero returned D1 rows cannot produce a success receipt',async()=>{
 const s=service(),prepare=s.env.DB.prepare.bind(s.env.DB);
 s.env.DB.prepare=sql=>sql.startsWith('UPDATE receipts')?{bind:()=>({first:()=>undefined})}:prepare(sql);
 const warn=console.warn;console.warn=()=>{};
 try{assert.equal((await handle(s.request(),s.env,s.fetcher)).status,502);}finally{console.warn=warn;}
 assert.equal(s.db.prepare('SELECT saved FROM receipts').get().saved,0);
});
test('browser CORS preflight and private test-header contract',async()=>{
 const s=service();let res=await handle(s.request({},'OPTIONS'),s.env,s.fetcher);
 assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://ivanzdaniekin.github.io');assert.equal(res.headers.get('Access-Control-Allow-Headers'),'Content-Type');
 s.env.TEST_ONLY='true';res=await handle(s.request({},'OPTIONS'),s.env,s.fetcher);assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('X-Mypage-Test-Key'));
 const forbidden=s.request({},'OPTIONS');forbidden.headers.set('Origin','https://evil.invalid');assert.equal((await handle(forbidden,s.env,s.fetcher)).status,403);
 assert.deepEqual(s.counts(),{posts:0,gets:0});
});
function notificationSetup(){const h=harness();h.post(lead);h.props.MYPAGE_ENABLED='false';h.props.MYPAGE_ALLOW_PROBE='false';h.props.MYPAGE_NOTIFICATIONS_ENABLED='true';h.props.MYPAGE_ALLOW_SYNTHETIC_NOTIFICATION='true';h.props.TELEGRAM_BOT_TOKEN='offline';h.props.MYPAGE_TELEGRAM_CHAT_ID='-5325144321';return h;}
test('targeted synthetic notification is gated, one-shot and leaves lead rows unchanged',()=>{
 const h=notificationSetup(),before=JSON.stringify(h.data['Лист1']);h.telegramOK();h.ctx.notifyExistingSyntheticOnce();
 assert.equal(h.notifications(),1);assert.equal(h.data.MypageJournalV2[1][9],'sent');assert.equal(h.data.MypageJournalV2[1][10],1);assert.throws(()=>h.ctx.notifyExistingSyntheticOnce());h.ctx.retryTelegram();assert.equal(h.notifications(),1);assert.equal(JSON.stringify(h.data['Лист1']),before);
});
test('ambiguous delivery and in-flight crash never automatically resend',()=>{
 const h=notificationSetup();h.ctx.notifyExistingSyntheticOnce();assert.equal(h.data.MypageJournalV2[1][9],'needs_review');assert.equal(h.data.MypageJournalV2[1][12],'UNKNOWN');h.ctx.retryTelegram();assert.equal(h.notifications(),1);
 const c=notificationSetup();c.data.MypageJournalV2[1][10]=1;c.data.MypageJournalV2[1][12]='IN_FLIGHT';assert.throws(()=>c.ctx.notifyExistingSyntheticOnce());c.ctx.retryTelegram();assert.equal(c.notifications(),0);assert.equal(c.data.MypageJournalV2[1][9],'needs_review');
 const d=notificationSetup();d.telegramOK();d.fail('notification-final');assert.throws(()=>d.ctx.notifyExistingSyntheticOnce());d.ctx.retryTelegram();assert.equal(d.notifications(),1);assert.equal(d.data.MypageJournalV2[1][9],'needs_review');
});
test('one-shot refuses other pending rows, absent approval, changed lead and prior attempts',()=>{
 for(const reason of ['pending','gate','row','attempt','group']){
  const h=notificationSetup();
  if(reason==='pending'){let r=[...h.data.MypageJournalV2[1]];r[0]='other';h.data.MypageJournalV2.push(r);}
  if(reason==='gate')h.props.MYPAGE_ALLOW_SYNTHETIC_NOTIFICATION='false';
  if(reason==='row')h.data['Лист1'][1][1]='changed';
  if(reason==='attempt')h.data.MypageJournalV2[1][10]=1;
  if(reason==='group')h.props.MYPAGE_TELEGRAM_CHAT_ID='wrong-group';
  const before=JSON.stringify(h.data);assert.throws(()=>h.ctx.notifyExistingSyntheticOnce());assert.equal(h.notifications(),0);assert.equal(JSON.stringify(h.data),before);
 }
});
test('queue limits work, explicit rejection stops and 429 observes retry_after',()=>{
 const h=notificationSetup();h.telegramMode('rate');h.ctx.retryTelegram();assert.equal(h.data.MypageJournalV2[1][9],'pending');assert.ok(h.data.MypageJournalV2[1][11]>=Date.now()+590000);h.ctx.retryTelegram();assert.equal(h.notifications(),1);
 h.data.MypageJournalV2[1][11]=0;h.telegramMode('rejected');h.ctx.retryTelegram();assert.equal(h.data.MypageJournalV2[1][9],'needs_review');
 h.data.MypageJournalV2[1][9]='pending';h.data.MypageJournalV2[1][10]=10;h.data.MypageJournalV2[1][11]=0;h.ctx.retryTelegram();assert.equal(h.notifications(),2);assert.equal(h.data.MypageJournalV2[1][9],'needs_review');
});
test('queue sends at most five messages per run and skips sent records',()=>{
 const h=harness();
 for(let i=0;i<6;i++)assert.equal(h.post({...lead,requestId:'00000000-0000-4000-8000-'+String(i+10).padStart(12,'0'),job:'Synthetic job '+i}).saved,true);
 h.props.MYPAGE_NOTIFICATIONS_ENABLED='true';h.props.TELEGRAM_BOT_TOKEN='offline';h.props.MYPAGE_TELEGRAM_CHAT_ID='offline';h.telegramOK();
 h.ctx.retryTelegram();assert.equal(h.notifications(),5);h.ctx.retryTelegram();assert.equal(h.notifications(),6);h.ctx.retryTelegram();assert.equal(h.notifications(),6);
});
