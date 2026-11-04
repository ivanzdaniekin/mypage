import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validate,handle,hmac} from '../backend/worker.mjs';
const lead={name:'Test Candidate',contact:'@test_candidate',city:'Test City',job:'Test role',consent:true,privacyVersion:'test-v1'};
const requestId='00000000-0000-4000-8000-000000000001';
function setup(saved=true) {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {first:()=>stmt.get(...args),run:()=>stmt.run(...args)}}}},batch:async q=>Promise.all(q)};
 const env={ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_VERSION:'test-v1',SIGNING_SECRET:'test-only-not-live',HASH_SECRET:'test-only-hash',TURNSTILE_SECRET:'fake-offline',APPS_SCRIPT_URL:'https://script.google.com/macros/s/offline/exec',DB};
 let writes=0;
 const fetcher=async(url,opts)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
  writes++;const body=JSON.parse(opts.body);assert.equal(body.signature,await hmac(env.SIGNING_SECRET,body.timestamp+'.'+body.payload));
  return Response.json({saved,requestId:JSON.parse(body.payload).requestId});
 };
 const request=(data={})=>new Request('https://test.invalid/applications',{method:'POST',headers:{Origin:'https://ivanzdaniekin.github.io','CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({...lead,requestId,turnstileToken:'offline-only',...data})});
 return {env,fetcher,request,writes:()=>writes};
}
test('server rejects missing consent, bad contact, controls and oversized data',()=>{
 for(const p of [{consent:false},{contact:'not a contact'},{name:'a\nb'},{job:'a'.repeat(501)}])assert.throws(()=>validate({...lead,requestId,...p},'test-v1'));
 assert.equal(validate({...lead,requestId},'test-v1').city,'Test City');
});
test('disabled backend fails closed',async()=>{let s=setup();s.env.ENABLED='false';assert.equal((await handle(s.request(),s.env,s.fetcher)).status,503);assert.equal(s.writes(),0)});
test('upstream save receipt required; negative and timeout never succeed',async()=>{
 let s=setup(false);assert.equal((await handle(s.request(),s.env,s.fetcher)).status,502);
 s=setup();assert.equal((await handle(s.request(),s.env,async()=>{throw Error('timeout')})).status,502);
});
test('saved receipt, idempotency, conflict',async()=>{
 const s=setup();let res=await handle(s.request(),s.env,s.fetcher);assert.equal((await res.json()).saved,true);
 res=await handle(s.request(),s.env,s.fetcher);assert.equal(res.status,200);assert.equal(s.writes(),1);
 assert.equal((await handle(s.request({job:'Different job'}),s.env,s.fetcher)).status,409);
});
test('rate limits use atomic SQLite counters',async()=>{const s=setup();for(let i=0;i<5;i++)await handle(s.request(),s.env,s.fetcher);assert.equal((await handle(s.request(),s.env,s.fetcher)).status,429)});
test('forged captcha, wrong hostname/action and origin never write',async()=>{
 for(const proof of [{success:false},{success:true,hostname:'evil.invalid',action:'candidate'},{success:true,hostname:'ivanzdaniekin.github.io',action:'wrong'}]){
 const s=setup();assert.equal((await handle(s.request(),s.env,async()=>Response.json(proof))).status,403);assert.equal(s.writes(),0);}
 const s=setup();const r=s.request();r.headers.set('Origin','https://evil.invalid');assert.equal((await handle(r,s.env,s.fetcher)).status,403);
});
test('honeypot and 8KB streaming limit',async()=>{const s=setup();assert.equal((await handle(s.request({website:'spam'}),s.env,s.fetcher)).status,400);assert.equal((await handle(s.request({job:'x'.repeat(9000)}),s.env,s.fetcher)).status,413)});
test('Apps Script proposal stores literal cells and keeps outbox on Telegram failure',async()=>{
 const rows=[['request_id','created','name','contact','city','job','consent','privacy_version','fingerprint','telegram_status','attempts']];
 const props={MYPAGE_ENABLED:'true',MYPAGE_SIGNING_SECRET:'offline-key',MYPAGE_PRIVACY_VERSION:'test-v1',MYPAGE_SHEET_ID:'offline',TELEGRAM_BOT_TOKEN:'offline-not-a-token',MYPAGE_TELEGRAM_CHAT_ID:'offline'};
 let flush=0;
 const sheet={getRange(r,c,n,m){return {getValues:()=>[rows[r-1]],setValue:v=>{rows[r-1][c-1]=v}}},getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),appendRow:r=>rows.push(r)};
 const {createHmac}=await import('node:crypto');
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(t,k)=>[...createHmac('sha256',k).update(t).digest()]},LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{flush++}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},UrlFetchApp:{fetch:()=>{throw Error('offline Telegram unavailable')}},Date,JSON};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../docs/proposed/AppsScriptAdapter.gs',import.meta.url),'utf8'),ctx);
 const data={...lead,name:'=IMPORTXML("fake")',job:'@formula',requestId};
 async function send(p){const timestamp=Math.floor(Date.now()/1000),payload=JSON.stringify(p);return ctx.mypageAccept({postData:{contents:JSON.stringify({timestamp,payload,signature:await hmac(props.MYPAGE_SIGNING_SECRET,timestamp+'.'+payload)})}})}
 let receipt=await send(data);assert.equal(receipt.saved,true);assert.ok(flush>0);assert.equal(rows[1][2],"'=IMPORTXML(\"fake\")");assert.equal(rows[1][5],"'@formula");assert.equal(rows[1][9],'pending');
 await send(data);assert.equal(rows.length,2);
 await send({...data,requestId:'00000000-0000-4000-8000-000000000002'});assert.equal(rows.length,2);
 const bad=ctx.mypageAccept({postData:{contents:JSON.stringify({timestamp:0,payload:'{}',signature:'bad'})}});assert.equal(bad.saved,false);
});
test('untrusted redirect and mismatched receipt cannot claim success',async()=>{
 for(const kind of ['redirect','id','html']){
  const s=setup();const f=async(url,opts)=>{
   if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
   if(kind==='redirect')return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});
   if(kind==='html')return new Response('<html>Sign in</html>');
   return Response.json({saved:true,requestId:'wrong'});
  };
  assert.equal((await handle(s.request(),s.env,f)).status,502);
 }
});
test('Apps Script content redirect uses GET without forwarding signed payload',async()=>{
 const s=setup();const f=async(url,opts)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
  if(String(url).includes('script.google.com/'))return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/offline'}});
  assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
  return Response.json({saved:true,requestId});
 };
 assert.equal((await handle(s.request(),s.env,f)).status,200);
});
