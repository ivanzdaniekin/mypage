import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {appsFetch,handle,hmac,validate} from '../backend/worker.mjs';
import {reconciliationPlan} from '../backend/reconciliation.mjs';
import {harness} from './apps-harness.mjs';
const id='00000000-0000-4000-8000-000000000003',nonce='a'.repeat(64);
const lead={requestId:id,name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job',consent:true,privacyVersion:'test-v2'};
test('ContentService 301/302/303 redirects use GET, never replay signed POST',async()=>{
 for(const status of [301,302,303]){
  const calls=[];
  const result=await appsFetch('https://script.google.com/macros/s/offline/exec',{payload:'signed-offline'},async(url,options)=>{
   calls.push(options);
   return calls.length===1?new Response(null,{status,headers:{Location:'https://script.googleusercontent.com/offline'}}):Response.json({saved:true,protocol:'mypage-v2',requestId:id});
  });
  assert.equal(result.saved,true);assert.equal(calls.length,2);assert.equal(calls[1].method,'GET');assert.equal(calls[1].body,undefined);assert.equal(calls[1].headers,undefined);
 }
});
test('response failures remain distinguishable and never follow an untrusted second redirect',async()=>{
 for(const [kind,code] of [['target','APPS_REDIRECT_TARGET'],['network','APPS_CONTENT_TRANSPORT'],['http','APPS_HTTP'],['html','APPS_JSON'],['oversize','APPS_JSON'],['second-redirect','APPS_HTTP']]){
  let calls=0;
  await assert.rejects(()=>appsFetch('https://script.google.com/macros/s/offline/exec',{},async()=>{
   calls++;
   if(calls===1)return new Response(null,{status:302,headers:{Location:kind==='target'?'https://evil.invalid/':'https://script.googleusercontent.com/offline'}});
   if(kind==='network')throw Error('secret must not escape');
   if(kind==='http')return new Response('',{status:503});
   if(kind==='second-redirect')return new Response(null,{status:302,headers:{Location:'https://evil.invalid/'}});
   return new Response(kind==='html'?'<html>sign in</html>':'x'.repeat(16385));
  }),{message:code});
  assert.equal(calls,kind==='target'?1:2);
 }
});
test('real save followed by lost confirmation keeps D1 unconfirmed; signed reconciliation never writes Sheets',async()=>{
 const h=harness(),db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let stmt=db.prepare(sql);return {bind(...args){return {first:()=>stmt.get(...args),run:()=>stmt.run(...args)}}}}};
 const env={DB,ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_VERSION:'test-v2',SIGNING_SECRET:h.props.MYPAGE_SIGNING_SECRET,HASH_SECRET:'offline-hash',TURNSTILE_SECRET:'offline',APPS_SCRIPT_URL:'https://script.google.com/macros/s/offline/exec'};
 const req=new Request('https://offline.invalid/applications',{method:'POST',headers:{Origin:'https://ivanzdaniekin.github.io','CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({...lead,turnstileToken:'offline'})});
 const logs=[],warn=console.warn;console.warn=x=>logs.push(x);
 let result;
 try {result=await handle(req,env,async(url,opts)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
  assert.equal(JSON.parse(h.ctx.doPost({postData:{contents:opts.body}}).getContent()).saved,true);
  throw Error('https://private.invalid/?secret=never-log');
 });}finally{console.warn=warn;}
 assert.equal(result.status,502);assert.equal(db.prepare('SELECT saved FROM receipts').get().saved,0);
 assert.deepEqual(JSON.parse(logs[0]),{event:'SAVE_CONFIRMATION_FAILED',stage:'APPS_RESPONSE',code:'APPS_POST_TRANSPORT',requestId:id});
 h.props.MYPAGE_ENABLED='false';h.props.MYPAGE_ALLOW_PROBE='true';
 const before=JSON.stringify(h.data);
 const evidence=h.post({operation:'receipt',requestId:id,nonce});
 assert.ok(evidence.signature);assert.equal(JSON.stringify(h.data),before);assert.equal(h.notifications(),0);
 const plan=await reconciliationPlan({evidence,lead,nonce,signingSecret:env.SIGNING_SECRET,hashSecret:env.HASH_SECRET});
 assert.equal(db.prepare('SELECT saved FROM receipts').get().saved,0); // plan has no side effects
 assert.equal(db.prepare(plan.sql).get(...plan.params).saved,1); // in-memory SQLite only
 assert.equal(JSON.stringify(h.data),before);assert.equal(db.prepare(plan.sql).get(...plan.params),undefined);
 for(const changed of [{nonce:'b'.repeat(64)},{lead:{...lead,job:'Different role'}},{now:Math.floor(Date.now()/1000)+301},{evidence:{...evidence,signature:'0'.repeat(64)}}]){
  await assert.rejects(()=>reconciliationPlan({evidence,lead,nonce,signingSecret:env.SIGNING_SECRET,hashSecret:env.HASH_SECRET,...changed}));
 }
 assert.equal(await hmac(env.HASH_SECRET,JSON.stringify(validate(lead,'test-v2'))),plan.params[2]);
});
test('read-only receipt rejects PREPARED, row conflict, duplicate journal and enabled writers without mutation',()=>{
 for(const problem of ['prepared','conflict','duplicate','enabled','notifications','gate']){
  const h=harness();assert.equal(h.post(lead).saved,true);h.props.MYPAGE_ENABLED='false';h.props.MYPAGE_ALLOW_PROBE='true';
  if(problem==='prepared')h.data.MypageJournalV2[1][8]='PREPARED';
  if(problem==='conflict')h.data['Лист1'][1][5]='conflict';
  if(problem==='duplicate')h.data.MypageJournalV2.push([...h.data.MypageJournalV2[1]]);
  if(problem==='enabled')h.props.MYPAGE_ENABLED='true';
  if(problem==='notifications')h.props.MYPAGE_NOTIFICATIONS_ENABLED='true';
  if(problem==='gate')h.props.MYPAGE_ALLOW_PROBE='false';
  const before=JSON.stringify(h.data),r=h.post({operation:'receipt',requestId:id,nonce});
  assert.equal(r.saved,false);assert.equal(r.signature,undefined);assert.equal(JSON.stringify(h.data),before);assert.equal(h.notifications(),0);
 }
});
