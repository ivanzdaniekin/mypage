// PREPARATION ONLY: production transport requires owner --allow-one-post.
// Chrome never receives TEST_KEY. No browser automation, retry or Telegram call.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {validate} from '../backend/worker.mjs';
export const ENDPOINT='https://ivan-praca-leads.ivan-zdaniekin.workers.dev/applications';
const SYNTHETIC={name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job'};
async function privateText(file,maxBytes=8192) {
 const dir=await fs.lstat(path.dirname(file));
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o777)!==0o700||dir.uid!==process.getuid())throw Error('private-directory');
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const st=await handle.stat();
  if(!st.isFile()||(st.mode&0o777)!==0o600||st.uid!==process.getuid()||st.size>maxBytes)throw Error('private-file');
  const b=Buffer.alloc(maxBytes+1),{bytesRead}=await handle.read(b,0,b.length,0);
  if(bytesRead>maxBytes)throw Error('size');
  return b.subarray(0,bytesRead).toString('utf8');
 }finally{await handle.close();}
}
export async function readConfig(file) {
 const text=await privateText(file);const result={};
 for(const line of text.split(/\r?\n/)){
  const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)continue;
  if(['WORKER_ENDPOINT','PRIVACY_VERSION','MYPAGE_TEST_KEY'].includes(m[1])){
   let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
   result[m[1]]=v;
  }
 }
 if(result.WORKER_ENDPOINT!==ENDPOINT||!result.PRIVACY_VERSION||typeof result.MYPAGE_TEST_KEY!=='string'||result.MYPAGE_TEST_KEY.length<32||/[\u0000-\u0020\u007f]/.test(result.MYPAGE_TEST_KEY))throw Error('configuration');
 return result;
}
export async function readPayload(file,config) {
 const p=JSON.parse(await privateText(file));
 const lead=validate(p,config.PRIVACY_VERSION);
 for(const [k,v] of Object.entries(SYNTHETIC))if(lead[k]!==v)throw Error('synthetic-only');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.requestId))throw Error('request-id');
 if(typeof p.turnstileToken!=='string'||!p.turnstileToken||p.turnstileToken.length>2048||/[\u0000-\u0020\u007f]/.test(p.turnstileToken))throw Error('token');
 const age=Date.now()-Date.parse(p.tokenReceivedAt);
 if(!Number.isFinite(age)||age<0||age>240000)throw Error('stale-export');
 return {...lead,requestId:p.requestId,turnstileToken:p.turnstileToken,website:''};
}
export async function sendOne({payload,config,statePath,transport=fetch}) {
 // One fixed session marker across all UUIDs. Never auto-delete, even on timeout/403/502.
 const marker=await fs.open(statePath,'wx',0o600);
 try {await marker.writeFile(JSON.stringify({requestId:payload.requestId,phase:'ATTEMPT_RESERVED',at:new Date().toISOString()}));await marker.sync();}
 finally {await marker.close();}
 let result={requestId:payload.requestId,postAttempts:1,httpStatus:null,savedConfirmed:false,outcome:'UNKNOWN'};
 try {
  const response=await transport(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Origin:'https://ivanzdaniekin.github.io','X-Mypage-Test-Key':config.MYPAGE_TEST_KEY},body:JSON.stringify(payload)});
  result.httpStatus=response.status;
  let receipt;try{receipt=await response.json();}catch{}
  result.savedConfirmed=response.ok&&receipt?.saved===true&&receipt?.requestId===payload.requestId;
  result.outcome=result.savedConfirmed?'CONFIRMED':'NOT_CONFIRMED';
 }catch { /* No exception text, URLs, tokens or raw upstream bodies in logs. */ }
 await fs.writeFile(statePath,JSON.stringify({...result,at:new Date().toISOString()}),{mode:0o600});
 return result;
}
async function cli() {
 const args=process.argv.slice(2),allowed=new Set(['--check','--allow-one-post']);
 const mode=args[0],file=args[1];
 if(args.length!==2||!allowed.has(mode)||!file)throw Error('usage');
 const dir=path.join(os.homedir(),'.mypage-private');
 const input=path.resolve(file);
 if(path.dirname(input)!==dir)throw Error('private-payload-location');
 const config=await readConfig(path.join(dir,'test.env'));
 const payload=await readPayload(input,config);
 const statePath=path.join(dir,'manual-post-attempt.json');
 try{await fs.access(statePath);throw Error('attempt-already-exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(mode==='--check'){console.log(JSON.stringify({ready:true,requestId:payload.requestId,networkRequests:0}));return;}
 const result=await sendOne({payload,config,statePath});console.log(JSON.stringify(result));
 process.exitCode=result.savedConfirmed?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 cli().catch(()=>{console.error('BLOCKED: local validation/one-shot guard failed. No automatic retry. Check files privately; do not print keys or token.');process.exitCode=1});
}
