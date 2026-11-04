// No PII logging. The D1 binding stores only HMAC digests, timestamps and receipts.
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
async function appsFetch(url, envelope, fetcher) {
  let response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),redirect:'manual',signal:AbortSignal.timeout(20000)});
  if ([301,302,303].includes(response.status)) {
    const target=new URL(response.headers.get('Location'));
    if(target.protocol!=='https:' || target.hostname!=='script.googleusercontent.com')throw Error('upstream');
    response=await fetcher(target.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
  }
  if(!response.ok)throw Error('upstream');
  return response.json();
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
  let p;
  try {
    if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,{saved:false});
    p=await limitedJSON(req,8192);
    const lead=validate(p,env.PRIVACY_VERSION);
    if(typeof p.turnstileToken!=='string'||p.turnstileToken.length>2048||!p.turnstileToken)return reply(400,{saved:false});
    const now=Math.floor(Date.now()/1000);
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
    await env.DB.prepare('INSERT INTO receipts (id,digest,saved,updated) VALUES (?,?,0,?) ON CONFLICT(id) DO NOTHING').bind(p.requestId,digest,now).run();
    const row=await env.DB.prepare('SELECT digest,saved FROM receipts WHERE id=?').bind(p.requestId).first();
    if(row.digest!==digest)return reply(409,{saved:false});
    if(row.saved===1)return reply(200,{saved:true,requestId:p.requestId});
    const payload=JSON.stringify({...lead,requestId:p.requestId});
    const signature=await hmac(env.SIGNING_SECRET,now+'.'+payload);
    const receipt=await appsFetch(env.APPS_SCRIPT_URL,{timestamp:now,payload,signature},fetcher);
    if(receipt.protocol!=='mypage-v2' || receipt.saved!==true || receipt.requestId!==p.requestId) return reply(502,{saved:false});
    await env.DB.prepare('UPDATE receipts SET saved=1,updated=? WHERE id=?').bind(now,p.requestId).run();
    return reply(200,{saved:true,requestId:p.requestId});
  } catch(error) {
    if(error.message==='validation')return reply(400,{saved:false});
    if(error.message==='size')return reply(413,{saved:false});
    return reply(502,{saved:false}); // Unknown write outcome: caller must reuse request ID.
  }
}
export default {
  fetch(req,env) { return handle(req,env); },
  async scheduled(event,env) {
    const now=Math.floor(Date.now()/1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM limits WHERE expires < ?').bind(now),
      env.DB.prepare('DELETE FROM receipts WHERE updated < ?').bind(now-86400*7)
    ]);
  }
};
