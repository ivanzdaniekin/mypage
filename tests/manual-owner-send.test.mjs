import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readConfig,readPayload,sendOne,ENDPOINT} from './manual-owner-send.mjs';
const id='00000000-0000-4000-8000-000000000001';
const config={WORKER_ENDPOINT:ENDPOINT,PRIVACY_VERSION:'test-2026-11-04',MYPAGE_TEST_KEY:'offline-test-key-not-used-in-network-123456'};
const payload={requestId:id,name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job',consent:true,privacyVersion:config.PRIVACY_VERSION,website:'',turnstileToken:'offline-fixture-never-sent',tokenReceivedAt:new Date().toISOString()};
async function withFiles(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mypage-manual-offline-'));await fs.chmod(dir,0o700);try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('read private configuration and real data contract without network',()=>withFiles(async dir=>{
 const c=path.join(dir,'test.env'),p=path.join(dir,'payload.json');
 await fs.writeFile(c,Object.entries(config).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});
 await fs.writeFile(p,JSON.stringify(payload),{mode:0o600});
 assert.deepEqual(await readConfig(c),config);assert.equal((await readPayload(p,config)).requestId,id);
 await fs.chmod(p,0o644);await assert.rejects(readPayload(p,config));
}));
test('invalid consent, non-synthetic values, stale token and wrong UUID rejected',()=>withFiles(async dir=>{
 const p=path.join(dir,'payload.json');
 for(const delta of [{consent:false},{name:'Someone Else'},{tokenReceivedAt:new Date(Date.now()-300000).toISOString()},{requestId:'not-uuid'},{turnstileToken:''}]){
 await fs.writeFile(p,JSON.stringify({...payload,...delta}),{mode:0o600});await assert.rejects(readPayload(p,config));}
}));
test('one POST: correct secret header, no secret in payload, no redirect',()=>withFiles(async dir=>{
 const statePath=path.join(dir,'marker.json');let calls=0;
 const result=await sendOne({payload,config,statePath,transport:async(url,options)=>{
  calls++;assert.equal(url,ENDPOINT);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers['X-Mypage-Test-Key'],config.MYPAGE_TEST_KEY);assert.equal(options.body.includes(config.MYPAGE_TEST_KEY),false);return Response.json({saved:true,requestId:id});
 }});
 assert.equal(calls,1);assert.equal(result.savedConfirmed,true);
 await assert.rejects(sendOne({payload:{...payload,requestId:'00000000-0000-4000-8000-000000000002'},config,statePath,transport:async()=>{calls++;throw Error('should not run')}}));assert.equal(calls,1);
}));
test('concurrent send attempts acquire one atomic marker',()=>withFiles(async dir=>{
 let calls=0;const statePath=path.join(dir,'marker.json'),transport=async()=>{calls++;return Response.json({saved:true,requestId:id})};
 const results=await Promise.allSettled([sendOne({payload,config,statePath,transport}),sendOne({payload,config,statePath,transport})]);
 assert.equal(calls,1);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
}));
test('timeout keeps marker and prohibits all retries',()=>withFiles(async dir=>{
 let calls=0;const statePath=path.join(dir,'marker.json');
 const r=await sendOne({payload,config,statePath,transport:async()=>{calls++;throw Error('offline timeout')}});
 assert.equal(r.outcome,'UNKNOWN');assert.equal(r.savedConfirmed,false);
 await assert.rejects(sendOne({payload,config,statePath,transport:async()=>{calls++;throw Error('should not run')}}));assert.equal(calls,1);
 assert.equal((await fs.readFile(statePath,'utf8')).includes(payload.turnstileToken),false);
 assert.equal((await fs.readFile(statePath,'utf8')).includes(config.MYPAGE_TEST_KEY),false);
}));
test('wrong receipt and non-2xx never confirm save',()=>withFiles(async dir=>{
 for(const [i,status,receipt] of [[0,200,{saved:true,requestId:'wrong'}],[1,403,{saved:false}],[2,502,{saved:false}]]){
 const result=await sendOne({payload,config,statePath:path.join(dir,'marker'+i+'.json'),transport:async()=>Response.json(receipt,{status})});assert.equal(result.savedConfirmed,false);}
}));
