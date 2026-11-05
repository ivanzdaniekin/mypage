import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './apps-harness.mjs';
import {handle} from '../backend/worker.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const lead={requestId:'00000000-0000-4000-8000-000000000001',name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic Job',consent:true,privacyVersion:'test-v2'};
test('seven columns unchanged; consent/version/time stored in separate journal; no inline Telegram',()=>{
 const h=harness();assert.equal(h.post(lead).saved,true);assert.equal(h.data['Лист1'][1].length,7);assert.equal(h.data.MypageJournalV2[1][8],'SAVED');assert.equal(h.data.MypageJournalV2[1][7],'test-v2');assert.ok(Date.parse(h.data.MypageJournalV2[1][6]));assert.equal(h.notifications(),0);
 assert.equal(JSON.parse(Buffer.from(h.data.MypageJournalV2[1][5],'base64')).consent,true);
});
test('duplicate and concurrent lock contention cannot append twice',async()=>{
 const h=harness();const receipts=await Promise.all(Array.from({length:4},()=>Promise.resolve().then(()=>h.post(lead))));assert.ok(receipts.every(r=>r.saved));assert.equal(h.data['Лист1'].length,2);
 h.setLocked(true);assert.equal(h.post({...lead,requestId:'00000000-0000-4000-8000-000000000002'}).saved,false);h.setLocked(false);assert.equal(h.data['Лист1'].length,2);
 assert.equal(h.post({...lead,name:'Different name'}).saved,false);
});
test('ambiguous journal append / sheet write / saved mark recover to exactly one row',()=>{
 for(const point of ['journal-append','lead-write','mark-saved']){
  const h=harness();h.fail(point);assert.equal(h.post(lead).saved,false);assert.equal(h.post(lead).saved,true);assert.equal(h.data['Лист1'].length,2);assert.equal(h.data.MypageJournalV2.length,2);
 }
});
test('wrong secret, invalid consent, disabled and oversize never write',()=>{
 const h=harness();assert.equal(h.post(lead,'incorrect-key').saved,false);assert.equal(h.post({...lead,consent:false}).saved,false);assert.equal(h.post({...lead,job:'x'.repeat(17000)}).saved,false);h.props.MYPAGE_ENABLED='false';assert.equal(h.post(lead).saved,false);assert.equal(h.data['Лист1'].length,1);
});
test('formula prefixes remain text; failure Telegram queues/backoffs/retries without new row',()=>{
 const h=harness();assert.equal(h.post({...lead,name:'=1+1',job:'@SUM(1)'}).saved,true);
 assert.equal(h.data['Лист1'][1][1],'=1+1'); // literal API values; harness strips Sheets escape apostrophe
 h.props.MYPAGE_NOTIFICATIONS_ENABLED='true';h.props.MYPAGE_TELEGRAM_ACTIVATED_AT=new Date(Date.now()-60000).toISOString();h.props.TELEGRAM_BOT_TOKEN='offline-only';h.props.MYPAGE_TELEGRAM_CHAT_ID='offline';h.telegramMode('rate');
 h.ctx.retryTelegram();assert.equal(h.data.MypageJournalV2[1][9],'pending');assert.equal(h.data.MypageJournalV2[1][10],1);
 h.ctx.retryTelegram();assert.equal(h.notifications(),1);h.telegramOK();h.data.MypageJournalV2[1][11]=0;h.ctx.retryTelegram();assert.equal(h.data.MypageJournalV2[1][9],'sent');assert.equal(h.data['Лист1'].length,2);
});
test('signed read-only contract probe while writes disabled',()=>{const h=harness();h.props.MYPAGE_ENABLED='false';h.props.MYPAGE_ALLOW_PROBE='true';assert.equal(h.post({operation:'probe',nonce:'offline'}).protocol,'mypage-v2');assert.equal(h.post(lead).saved,false);assert.equal(h.data['Лист1'].length,1);});
test('actual Worker signer and Code.gs doPost agree (offline service harness, not deployed Google)',async()=>{
 const h=harness(),db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {first:()=>stmt.get(...args),run:()=>stmt.run(...args)}}}}};
 const env={DB,ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_VERSION:'test-v2',SIGNING_SECRET:h.props.MYPAGE_SIGNING_SECRET,HASH_SECRET:'offline',TURNSTILE_SECRET:'offline',APPS_SCRIPT_URL:'https://script.google.com/macros/s/offline/exec'};
 const request=()=>new Request('https://offline.invalid/applications',{method:'POST',headers:{Origin:'https://ivanzdaniekin.github.io','CF-Connecting-IP':'192.0.2.2','Content-Type':'application/json'},body:JSON.stringify({...lead,turnstileToken:'offline'})});
 let loseReceipt=true;
 const transport=async(url,opts)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true,hostname:'ivanzdaniekin.github.io',action:'candidate'});
  const result=JSON.parse(h.ctx.doPost({postData:{contents:opts.body}}).getContent());
  if(loseReceipt){loseReceipt=false;throw Error('timeout after actual script execution')}
  return Response.json(result);
 };
 assert.equal((await handle(request(),env,transport)).status,502);assert.equal(h.data['Лист1'].length,2);
 assert.equal((await handle(request(),env,transport)).status,200);assert.equal(h.data['Лист1'].length,2);
});
