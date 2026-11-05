// Owner-run, authenticated, read-only Google Web App probe. No Sheet/Telegram writes.
// Supply APPS_SCRIPT_URL and MYPAGE_SIGNING_SECRET locally; never as CLI arguments.
import {hmac} from '../backend/worker.mjs';
import assert from 'node:assert/strict';
if(!process.argv.includes('--allow-remote'))throw Error('Explicit --allow-remote required; no request sent');
const url=process.env.APPS_SCRIPT_URL,key=process.env.MYPAGE_SIGNING_SECRET;
if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url||'')||!key)throw Error('Missing local server configuration');
const nonce=crypto.randomUUID(),timestamp=Math.floor(Date.now()/1000),payload=JSON.stringify({operation:'probe',nonce});
let response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(25000),body:JSON.stringify({timestamp,payload,signature:await hmac(key,timestamp+'.'+payload)})});
if([301,302,303].includes(response.status)){
 const target=new URL(response.headers.get('Location'));
 assert.equal(target.protocol,'https:');assert.equal(target.hostname,'script.googleusercontent.com');
 response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(25000)});
}
assert.equal(response.ok,true);const result=await response.json();
assert.equal(result.protocol,'mypage-v2');assert.equal(result.saved,false);assert.equal(result.nonce,nonce);
console.log('PASS: deployed Google ContentService, signed-body contract and redirect, no writes.');
