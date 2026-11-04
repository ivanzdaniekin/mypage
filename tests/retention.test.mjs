import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {harness} from './apps-harness.mjs';
import {maintenance,handle,verifyPrivacyReceipt} from '../backend/worker.mjs';
const id='00000000-0000-4000-8000-000000000020';
const lead={requestId:id,name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job',consent:true,privacyVersion:'test-v2'};
function setup(expired=true){const h=harness();h.post(lead);if(expired){const date=new Date(Date.now()-200*86400000).toISOString();h.data.MypageJournalV2[1][3]=date;h.data['Лист1'][1][0]=date;}h.props.MYPAGE_ENABLED='false';h.props.MYPAGE_RETENTION_ENABLED='true';return h;}
function bridge(h){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO receipts VALUES (?,?,?,?)').run(id,'offline',1,Math.floor(Date.now()/1000));
 const DB={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {first:()=>stmt.get(...args),run:()=>stmt.run(...args)}}}},async batch(q){db.exec('BEGIN');try{const r=q.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,RETENTION_BRIDGE_ENABLED:'true',SIGNING_SECRET:h.props.MYPAGE_SIGNING_SECRET,APPS_SCRIPT_URL:'https://script.google.com/macros/s/offline/exec'};
 const fetcher=async(url,opts)=>Response.json(JSON.parse(h.ctx.doPost({postData:{contents:opts.body}}).getContent()));
 return {db,env,fetcher};
}
test('calendar months clamp month-end and leap years',()=>{
 const h=harness();assert.equal(new Date(h.ctx.sixMonths_('2026-08-31T12:34:56Z')).toISOString(),'2027-02-28T12:34:56.000Z');assert.equal(new Date(h.ctx.sixMonths_('2023-08-31T00:00:00Z')).toISOString(),'2024-02-29T00:00:00.000Z');
});
test('disabled scheduled maintenance makes zero DB/network changes',async()=>{assert.deepEqual(await maintenance({}),{disabled:true});const h=setup();h.props.MYPAGE_RETENTION_ENABLED='false';const before=JSON.stringify(h.data);assert.throws(()=>h.ctx.privacyMaintenance_());assert.equal(JSON.stringify(h.data),before);});
test('expiry erases active lead and payload, preserves fixed row indexes and blocks resurrection',()=>{
 const h=setup();assert.deepEqual(Array.from(h.ctx.privacyMaintenance_()),[id]);assert.ok(h.data['Лист1'][1].every(x=>x===''));assert.equal(h.data.MypageJournalV2[1][8],'ERASED');assert.equal(h.data.MypageJournalV2[1][5],'');h.props.MYPAGE_ENABLED='true';assert.equal(h.post(lead).code,'ERASED');assert.ok(h.data['Лист1'][1].every(x=>x===''));assert.equal(h.notifications(),0);
});
test('verified-owner withdrawal is scoped and legal hold prevents deletion',()=>{
 const h=setup(false);assert.equal(h.ctx.privacyMaintenance_().length,0);h.ctx.queuePrivacyRequest(id,'withdrawal');h.props.MYPAGE_LEGAL_HOLD_IDS=JSON.stringify([id]);const before=JSON.stringify(h.data['Лист1']);assert.equal(h.ctx.privacyMaintenance_().length,0);assert.equal(JSON.stringify(h.data['Лист1']),before);h.props.MYPAGE_LEGAL_HOLD_IDS='[]';assert.equal(h.ctx.privacyMaintenance_().length,1);
});
test('PREPARED and conflicting row fail closed without deleting candidate cells',()=>{
 for(const kind of ['prepared','row']){const h=setup();if(kind==='prepared')h.data.MypageJournalV2[1][8]='PREPARED';else h.data['Лист1'][1][5]='other';const before=JSON.stringify(h.data['Лист1']);assert.throws(()=>h.ctx.privacyMaintenance_());assert.equal(JSON.stringify(h.data['Лист1']),before);}
});
test('crash after clearing last lead row resumes erasure without recreate/append',()=>{
 const h=setup();h.fail('erase-lead');assert.throws(()=>h.ctx.privacyMaintenance_());assert.equal(h.data.MypageJournalV2[1][8],'ERASING');assert.equal(h.ctx.privacyMaintenance_().length,1);assert.equal(h.data.MypageJournalV2[1][8],'ERASED');assert.ok(h.data['Лист1'][1].every(x=>x===''));
});
test('signed bridge erases D1, acknowledges and removes short-lived tombstones',async()=>{
 const h=setup(),s=bridge(h);assert.deepEqual(await maintenance(s.env,s.fetcher),{processed:1});assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n,0);assert.equal(s.db.prepare('SELECT count(*) n FROM erasures').get().n,1);assert.equal(h.data.MypagePrivacyV1[1][8],'deleted');
 const req=new Request('https://offline.invalid/applications',{method:'POST',headers:{Origin:'https://ivanzdaniekin.github.io','CF-Connecting-IP':'192.0.2.2','Content-Type':'application/json'},body:JSON.stringify({...lead,turnstileToken:'offline'})});
 const response=await handle(req,{...s.env,ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_VERSION:'test-v2',HASH_SECRET:'offline',TURNSTILE_SECRET:'offline'},()=>{throw Error('must not contact upstream');});assert.equal(response.status,410);
 h.ctx.privacyMaintenance_();assert.equal(h.data.MypagePrivacyV1[1][3],'COMPLETE');h.data.MypagePrivacyV1[1][4]=Date.now()-8*86400000;h.ctx.privacyMaintenance_();assert.ok(h.data.MypageJournalV2[1].every(x=>x===''));assert.ok(h.data.MypagePrivacyV1[1].every(x=>x===''));
});
test('invalid signature cannot erase D1; D1 failure can resume without new Sheet write',async()=>{
 const h=setup(),s=bridge(h);await assert.rejects(()=>maintenance(s.env,async()=>Response.json({payload:'{}',signature:'forged'})));assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 const batch=s.env.DB.batch;s.env.DB.batch=async()=>{throw Error('offline D1 unavailable');};await assert.rejects(()=>maintenance(s.env,s.fetcher));assert.equal(h.data.MypageJournalV2[1][8],'ERASED');const before=JSON.stringify(h.data['Лист1']);s.env.DB.batch=batch;await maintenance(s.env,s.fetcher);assert.equal(JSON.stringify(h.data['Лист1']),before);assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n,0);
});
test('periodic D1 cleanup is gated and deletes only expired rows',async()=>{
 const h=setup(false),s=bridge(h),now=Math.floor(Date.now()/1000);s.db.prepare('INSERT INTO limits VALUES (?,?,?)').run('expired',1,now-1);s.db.prepare('INSERT INTO limits VALUES (?,?,?)').run('live',1,now+1000);s.env.RETENTION_BRIDGE_ENABLED='false';s.env.D1_CLEANUP_ENABLED='true';await maintenance(s.env);assert.equal(s.db.prepare('SELECT count(*) n FROM limits').get().n,1);assert.equal(s.db.prepare('SELECT count(*) n FROM receipts').get().n,1);
});
test('Telegram contains UUID only, early removal uses tracked message ID; old/unknown requires owner',()=>{
 const h=setup(false),r=h.data.MypageJournalV2[1];assert.ok(!h.ctx.notificationText_(r).includes(lead.contact));assert.ok(!h.ctx.notificationText_(r).includes(lead.name));
 const e=h.ctx.privacyRecord_(r);e.row[5]=1;e.row[6]=Date.now()-25*3600000;e.row[7]='sent';h.ctx.privacyWrite_(e);h.props.MYPAGE_TELEGRAM_DELETE_ENABLED='true';h.props.TELEGRAM_BOT_TOKEN='offline';h.props.MYPAGE_TELEGRAM_CHAT_ID='offline';h.telegramOK();h.ctx.privacyMaintenance_();assert.equal(h.data.MypagePrivacyV1[1][7],'deleted');
 const old=h.ctx.privacyRecord_(r);old.row[5]=2;old.row[6]=Date.now()-49*3600000;old.row[7]='sent';const calls=h.notifications();h.ctx.deleteTelegramCopy_(old);assert.equal(old.row[9],'TELEGRAM_MANUAL_48H');assert.equal(h.notifications(),calls);
});
test('invalid maintenance nonce cannot trigger deletion and closed installation preserves secrets',()=>{
 const h=setup();const before=JSON.stringify(h.data);assert.equal(h.post({operation:'retentionTick',nonce:'bad'}).saved,false);assert.equal(JSON.stringify(h.data),before);
 h.props.TELEGRAM_BOT_TOKEN='offline-preserved';h.ctx.installClosedLaunchSettings();assert.equal(h.props.TELEGRAM_BOT_TOKEN,'offline-preserved');assert.equal(h.props.MYPAGE_RETENTION_ENABLED,'false');assert.equal(h.props.MYPAGE_PRIVACY_VERSION,'mypage-privacy-2026-11-04-v1');
});
test('owner confirmation closes unknown Telegram copy without sending or deleting through API',()=>{
 const h=setup(),r=h.data.MypageJournalV2[1],e=h.ctx.privacyRecord_(r);e.row[7]='unknown';h.ctx.privacyWrite_(e);h.ctx.privacyMaintenance_();h.props.MYPAGE_ERASE_REQUEST_ID=id;h.props.MYPAGE_CONFIRM_TELEGRAM_DELETION='true';h.ctx.confirmOwnerTelegramDeletion();assert.equal(h.data.MypagePrivacyV1[1][7],'manual_done');assert.equal(h.props.MYPAGE_CONFIRM_TELEGRAM_DELETION,'false');assert.equal(h.notifications(),0);
});
