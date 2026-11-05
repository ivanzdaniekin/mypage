// No submitted fields/secrets in own logs; diagnostics use a pseudonymous UUID. D1 stores HMACs and metadata.
export function validate(p, version) {
  if (!p || p.consent !== true || !version || p.privacyVersion !== version || p.website ||
      !/^[0-9a-f-]{36}$/i.test(p.requestId || '')) throw Error('validation');
  const out = {};
  for (const [k,min,max] of [['name',2,80],['contact',5,80],['city',2,100],['job',2,500]]) {
    if (typeof p[k] !== 'string') throw Error('validation');
    const v = p[k].trim().normalize('NFC');
    if (v.length < min || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw Error('validation');
    out[k] = v;
  }
  if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(out.contact) &&
      (!/^\+[\d ()-]{7,25}$/.test(out.contact)||out.contact.replace(/\D/g,'').length<7||out.contact.replace(/\D/g,'').length>15)) throw Error('validation');
  return {...out,consent:true,privacyVersion:version};
}
export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function limitedJSON(req, max) {
  const reader = req.body?.getReader(); if (!reader) throw Error('validation');
  let chunks=[], size=0;
  for (;;) { const {value,done}=await reader.read(); if(done)break; size+=value.length;
    if(size>max){await reader.cancel();throw Error('size');} chunks.push(value); }
  const buf=new Uint8Array(size);let offset=0;for(const c of chunks){buf.set(c,offset);offset+=c.length;}
  return JSON.parse(new TextDecoder().decode(buf));
}
export async function appsFetch(url, envelope, fetcher) {
  let response;
  try {response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),redirect:'manual',signal:AbortSignal.timeout(20000)});}
  catch {throw Error('APPS_POST_TRANSPORT');}
  if ([301,302,303].includes(response.status)) {
    let target;
    try {target=new URL(response.headers.get('Location'));}catch {throw Error('APPS_REDIRECT_TARGET');}
    if(target.protocol!=='https:' || target.hostname!=='script.googleusercontent.com' || target.username || target.password || target.port)throw Error('APPS_REDIRECT_TARGET');
    try {response=await fetcher(target.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(20000)});}
    catch {throw Error('APPS_CONTENT_TRANSPORT');}
  }
  if(!response.ok)throw Error('APPS_HTTP');
  try {return await limitedJSON(response,16384);}catch {throw Error('APPS_JSON');}
}
export async function verifySaveReceipt(receipt,key,requestId,lead,now=Math.floor(Date.now()/1000)) {
  if(receipt?.protocol!=='mypage-v2'||receipt.saved!==true||receipt.requestId!==requestId)throw Error('APPS_RECEIPT');
  const proof=receipt.confirmation;
  if(typeof proof?.payload!=='string'||proof.payload.length>4096||proof.signature!==await hmac(key,'save.'+proof.payload))throw Error('APPS_SIGNATURE');
  let r;try{r=JSON.parse(proof.payload);}catch{throw Error('APPS_SIGNATURE');}
  const digest=await hmac(key,JSON.stringify([lead.name,lead.contact,lead.city,lead.job,lead.consent,lead.privacyVersion]));
  if(r.protocol!=='mypage-save-v1'||r.saved!==true||r.requestId!==requestId||r.digest!==digest||!Number.isInteger(r.verifiedAt)||now-r.verifiedAt<0||now-r.verifiedAt>300)throw Error('APPS_SIGNATURE');
}
export async function handle(req, env, fetcher=fetch) {
  const origin='https://ivanzdaniekin.github.io';
  const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,body)=>Response.json(body,{status,headers});
  if (new URL(req.url).pathname!=='/applications') return reply(404,{saved:false});
  if (req.headers.get('Origin')!==origin) return reply(403,{saved:false});
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':env.TEST_ONLY==='true'?'Content-Type, X-Mypage-Test-Key':'Content-Type'}});
  if(req.method!=='POST')return reply(405,{saved:false});
  // Private owner-only integration test: gate before any validation, database or external call.
  if(env.TEST_ONLY==='true' && (!env.TEST_KEY || env.TEST_KEY.length<32 || req.headers.get('X-Mypage-Test-Key')!==env.TEST_KEY))return reply(403,{saved:false});
  // Explicit owner-approved launch gate; no implicit fallback or test-mode success.
  if(env.ENABLED!=='true' || env.PRIVACY_APPROVED!=='true' || !env.PRIVACY_VERSION ||
      !env.SIGNING_SECRET || !env.HASH_SECRET || !env.TURNSTILE_SECRET || !env.DB ||
      !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.APPS_SCRIPT_URL||''))return reply(503,{saved:false});
  let p, stage='VALIDATE';
  try {
    if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,{saved:false});
    p=await limitedJSON(req,8192);
    const lead=validate(p,env.PRIVACY_VERSION);
    if(typeof p.turnstileToken!=='string'||p.turnstileToken.length>2048||!p.turnstileToken)return reply(400,{saved:false});
    const now=Math.floor(Date.now()/1000);
    if(await env.DB.prepare('SELECT id FROM erasures WHERE id=? AND expires>?').bind(p.requestId,now).first())return reply(410,{saved:false,code:'ERASED'});
    const ip=req.headers.get('CF-Connecting-IP');if(!ip)return reply(503,{saved:false});
    // Atomic counter per key/window. Fixed-window caps: 5/IP/10 min and 100 globally/10 min.
    for(const [key,cap] of [[await hmac(env.HASH_SECRET,ip),5],['global',100]]) {
      const bucket=key+':'+Math.floor(now/600);
      const result=await env.DB.prepare('INSERT INTO limits (bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+1200).first();
      if(result.count>cap)return reply(429,{saved:false});
    }
    const captcha=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(6000),
      body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:p.turnstileToken,remoteip:ip})});
    const proof=await captcha.json();
    if(!captcha.ok || proof.success!==true || proof.hostname!=='ivanzdaniekin.github.io'||proof.action!=='candidate')return reply(403,{saved:false});
    const digest=await hmac(env.HASH_SECRET,JSON.stringify(lead));
    // Stable contact dedupe in Apps Script is authoritative; D1 protects retries of the same ID.
    await env.DB.prepare('INSERT INTO receipts (id,digest,saved,updated) SELECT ?,?,0,? WHERE NOT EXISTS (SELECT 1 FROM erasures WHERE id=? AND expires>?) ON CONFLICT(id) DO NOTHING').bind(p.requestId,digest,now,p.requestId,now).run();
    const row=await env.DB.prepare('SELECT digest,saved FROM receipts WHERE id=?').bind(p.requestId).first();
    if(!row)return reply(410,{saved:false,code:'ERASED'});
    if(row.digest!==digest)return reply(409,{saved:false});
    if(row.saved===1)return reply(200,{saved:true,requestId:p.requestId});
    const payload=JSON.stringify({...lead,requestId:p.requestId});
    const signature=await hmac(env.SIGNING_SECRET,now+'.'+payload);
    stage='APPS_RESPONSE';
    const receipt=await appsFetch(env.APPS_SCRIPT_URL,{timestamp:now,payload,signature},fetcher);
    if(receipt?.protocol==='mypage-v2'&&receipt.saved===false&&receipt.code==='DUPLICATE'&&receipt.requestId===p.requestId)return reply(409,{saved:false,code:'DUPLICATE'});
    if(receipt?.protocol==='mypage-v2'&&receipt.saved===false&&receipt.code==='ERASED'&&receipt.requestId===p.requestId)return reply(410,{saved:false,code:'ERASED'});
    await verifySaveReceipt(receipt,env.SIGNING_SECRET,p.requestId,lead);
    stage='D1_CONFIRM';
    const confirmed=await env.DB.prepare('UPDATE receipts SET saved=1,updated=? WHERE id=? AND digest=? RETURNING id,saved').bind(now,p.requestId,digest).first();
    if(confirmed?.id!==p.requestId||confirmed.saved!==1)throw Error('D1_CONFIRM');
    return reply(200,{saved:true,requestId:p.requestId});
  } catch(error) {
    if(error.message==='validation')return reply(400,{saved:false});
    if(error.message==='size')return reply(413,{saved:false});
    // Finite codes only: never log the error object, upstream text, URLs, headers or input.
    if(stage==='APPS_RESPONSE'||stage==='D1_CONFIRM') {
      const codes=['APPS_POST_TRANSPORT','APPS_REDIRECT_TARGET','APPS_CONTENT_TRANSPORT','APPS_HTTP','APPS_JSON','APPS_RECEIPT','APPS_SIGNATURE'];
      console.warn(JSON.stringify({event:'SAVE_CONFIRMATION_FAILED',stage,code:stage==='D1_CONFIRM'?'D1_CONFIRM':codes.includes(error.message)?error.message:'APPS_UNKNOWN',requestId:p.requestId}));
    }
    return reply(502,{saved:false}); // Unknown write outcome: caller must reuse request ID.
  }
}
export default {
  fetch(req,env) { return handle(req,env); },
  async scheduled(event,env) {
    try {
      const result=await maintenance(event.cron==='0 3 * * *'?{...env,RETENTION_BRIDGE_ENABLED:'false'}:{...env,D1_CLEANUP_ENABLED:'false'});
      console.info(JSON.stringify({event:'MAINTENANCE',cron:event.cron,disabled:result.disabled===true,processed:result.processed||0}));
      return result;
    }catch{console.error('MAINTENANCE_FAILED');throw Error('MAINTENANCE_FAILED');}
  }
};
export async function verifyPrivacyReceipt(value,key,nonce,kind,now=Math.floor(Date.now()/1000)) {
  if(typeof value?.payload!=='string'||value.payload.length>4096||value.signature!==await hmac(key,'privacy.'+value.payload))throw Error('PRIVACY_PROOF');
  const p=JSON.parse(value.payload);
  if(p.protocol!=='mypage-privacy-v1'||p.kind!==kind||p.nonce!==nonce||!Number.isInteger(p.at)||Math.abs(now-p.at)>300||!Array.isArray(p.ids)||p.ids.length>20||new Set(p.ids).size!==p.ids.length||p.ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))throw Error('PRIVACY_PROOF');
  return p.ids;
}
export async function maintenance(env,fetcher=fetch) {
  const now=Math.floor(Date.now()/1000);
  // Installing the real cron while these switches are false is non-destructive.
  if(env.D1_CLEANUP_ENABLED!=='true'&&env.RETENTION_BRIDGE_ENABLED!=='true')return {disabled:true};
  if(env.D1_CLEANUP_ENABLED==='true')await env.DB.batch([
    env.DB.prepare('DELETE FROM limits WHERE expires < ?').bind(now),
    env.DB.prepare('DELETE FROM receipts WHERE updated < ?').bind(now-86400*7),
    env.DB.prepare('DELETE FROM erasures WHERE expires < ?').bind(now)
  ]);
  if(env.RETENTION_BRIDGE_ENABLED==='true') {
    if(!env.SIGNING_SECRET||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.APPS_SCRIPT_URL||''))throw Error('PRIVACY_CONFIG');
    const call=async(kind,ids)=>{
      const nonce=crypto.randomUUID(),timestamp=Math.floor(Date.now()/1000),payload=JSON.stringify({operation:kind==='tick'?'retentionTick':'retentionAck',nonce,...(ids?{ids}:{})});
      const value=await appsFetch(env.APPS_SCRIPT_URL,{timestamp,payload,signature:await hmac(env.SIGNING_SECRET,timestamp+'.'+payload)},fetcher);
      return verifyPrivacyReceipt(value,env.SIGNING_SECRET,nonce,kind);
    };
    const ids=await call('tick');
    if(ids.length) {
      await env.DB.batch(ids.flatMap(id=>[
        env.DB.prepare('INSERT INTO erasures (id,expires) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires').bind(id,now+7*86400),
        env.DB.prepare('DELETE FROM receipts WHERE id=?').bind(id)
      ]));
      for(const id of ids)if(await env.DB.prepare('SELECT id FROM receipts WHERE id=?').bind(id).first())throw Error('D1_ERASURE_UNCONFIRMED');
      const acknowledged=await call('ack',ids);
      if(JSON.stringify(acknowledged)!==JSON.stringify(ids))throw Error('PRIVACY_ACK');
    }
    return {processed:ids.length};
  }
  return {cleaned:true};
}
