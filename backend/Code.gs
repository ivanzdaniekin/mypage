/** Full replacement Code.gs. Do NOT install/deploy automatically.
 * Existing Лист1 A:G retained; MypageJournalV2 is a private recovery/outbox sheet.
 * Every writer of Лист1 must use this script lock. Do not insert/delete/sort rows
 * physically while a PREPARED journal record exists (filter views are safe).
 */
var MYPAGE_POLICY_VERSION='mypage-privacy-2026-11-04-v1';
var JOURNAL_HEADERS = ['request_id','digest','fingerprint','created','target_row','payload_b64','consent_at','privacy_version','state','telegram_status','attempts','next_attempt','last_code'];
function props_() { return PropertiesService.getScriptProperties(); }
function json_(p) { return ContentService.createTextOutput(JSON.stringify(p)).setMimeType(ContentService.MimeType.JSON); }
function mac_(s,key) { return Utilities.computeHmacSha256Signature(s,key,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
function equal_(a,b) { if(typeof a!=='string'||a.length!==64||b.length!==64)return false;var d=0;for(var i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0; }
function validate_(p) {
  var version=props_().getProperty('MYPAGE_PRIVACY_VERSION');
  if(!p||p.consent!==true||!version||p.privacyVersion!==version||!/^[0-9a-f-]{36}$/i.test(p.requestId||''))throw Error('INVALID');
  var out={};
  [['name',2,80],['contact',5,80],['city',2,100],['job',2,500]].forEach(function(f){
    if(typeof p[f[0]]!=='string')throw Error('INVALID');
    var s=p[f[0]].trim().normalize('NFC');
    if(s.length<f[1]||s.length>f[2]||/[\u0000-\u001f\u007f]/.test(s))throw Error('INVALID');out[f[0]]=s;
  });
  if(!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(out.contact)&&(!/^\+[\d ()-]{7,25}$/.test(out.contact)||out.contact.replace(/\D/g,'').length<7||out.contact.replace(/\D/g,'').length>15))throw Error('INVALID');
  out.consent=true;out.privacyVersion=version;out.requestId=p.requestId;
  return out;
}
function book_() {
  var id=props_().getProperty('MYPAGE_SHEET_ID');
  var book=id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
  if(!book)throw Error('CONFIG');return book;
}
function sheets_() {
  var book=book_(), leads=book.getSheetByName('Лист1'), journal=book.getSheetByName('MypageJournalV2');
  if(!leads||!journal||JSON.stringify(journal.getRange(1,1,1,13).getValues()[0])!==JSON.stringify(JOURNAL_HEADERS))throw Error('SCHEMA');
  // Bounded scans; archive/deletion must retain the request tombstones for the agreed retry period.
  if(journal.getLastRow()>10000)throw Error('MAINTENANCE');
  return {leads:leads,journal:journal};
}
// Run manually ONCE after backup; no changes to existing Лист1 columns or data.
function setupMypage() {
  if(props_().getProperty('MYPAGE_ENABLED')==='true')throw Error('DISABLE_FIRST');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {var book=book_();if(!book.getSheetByName('Лист1'))throw Error('SCHEMA');
    if(!book.getSheetByName('MypageJournalV2'))book.insertSheet('MypageJournalV2').getRange(1,1,1,13).setValues([JOURNAL_HEADERS]);
    SpreadsheetApp.flush();sheets_();
  } finally {lock.releaseLock();}
}
function payload_(r) { return JSON.parse(Utilities.newBlob(Utilities.base64Decode(r[5])).getDataAsString('UTF-8')); }
function values_(r) {
  var p=payload_(r);
  // Source retains its meaning and includes UUID for unambiguous crash recovery.
  return [r[3],p.name,p.contact,p.city,p.job,'mypage / '+r[0],'Новая'];
}
function recover_(s,r,index) {
  if(r[8]!=='PREPARED')return;
  var target=Number(r[4]),expected=values_(r), current=s.leads.getRange(target,1,1,7).getValues()[0];
  var empty=current.every(function(v){return v===''||v===null;});
  if(!empty && String(current[5])!=='mypage / '+r[0])throw Error('ROW_CONFLICT');
  if(empty) {
    // Apostrophe + text number format defends all user text, including CSV formula prefixes.
    var literal=expected.map(function(v,i){return i>=1&&i<=4?"'"+String(v):String(v);});
    s.leads.getRange(target,1,1,7).setNumberFormat('@').setValues([literal]);
    SpreadsheetApp.flush();
  }
  // Retry never appends: a timeout after setValues/flush reuses this exact target row.
  s.journal.getRange(index,9).setValue('SAVED');SpreadsheetApp.flush();r[8]='SAVED';
}
function saveLead(input) {
  var p=validate_(input), key=props_().getProperty('MYPAGE_SIGNING_SECRET');if(!key)throw Error('CONFIG');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=sheets_(), rows=s.journal.getDataRange().getValues();privacySheet_();
    // Recover older ambiguous writes before reserving another target row.
    for(var i=1;i<rows.length;i++)recover_(s,rows[i],i+1);
    var digest=mac_(JSON.stringify([p.name,p.contact,p.city,p.job,p.consent,p.privacyVersion]),key);
    var fp=mac_(JSON.stringify([p.contact.toLowerCase().replace(/[ ()-]/g,''),p.city.toLowerCase(),p.job.toLowerCase()]),key);
    for(var j=1;j<rows.length;j++) {
      if(rows[j][0]===p.requestId) {
        if(rows[j][8]==='ERASING'||rows[j][8]==='ERASED')return {saved:false,protocol:'mypage-v2',requestId:p.requestId,code:'ERASED'};
        if(rows[j][1]!==digest)throw Error('ID_CONFLICT');
        return {saved:rows[j][8]==='SAVED',protocol:'mypage-v2',requestId:p.requestId};
      }
      if(rows[j][2]===fp&&Date.now()-new Date(rows[j][3]).getTime()<86400000&&rows[j][8]==='SAVED')return {saved:false,protocol:'mypage-v2',requestId:p.requestId,code:'DUPLICATE'};
    }
    var time=new Date().toISOString(), target=s.leads.getLastRow()+1;
    var r=[p.requestId,digest,fp,time,target,Utilities.base64Encode(JSON.stringify(p),Utilities.Charset.UTF_8),time,p.privacyVersion,'PREPARED','pending',0,0,''];
    s.journal.appendRow(r);SpreadsheetApp.flush();
    recover_(s,r,s.journal.getLastRow());
    return {saved:true,protocol:'mypage-v2',requestId:p.requestId};
  } finally {lock.releaseLock();}
}
function doPost(e) {
  if(props_().getProperty('MYPAGE_ENABLED')!=='true'&&props_().getProperty('MYPAGE_ALLOW_PROBE')!=='true'&&props_().getProperty('MYPAGE_RETENTION_ENABLED')!=='true')return json_({saved:false,code:'DISABLED'});
  try {
    var key=props_().getProperty('MYPAGE_SIGNING_SECRET');if(!key)throw Error('CONFIG');
    if(!e||!e.postData||typeof e.postData.contents!=='string'||Utilities.newBlob(e.postData.contents).getBytes().length>16384)throw Error('INVALID');
    var env=JSON.parse(e.postData.contents);
    // Auth in signed BODY: Apps Script event does not expose arbitrary request headers.
    if(!Number.isInteger(env.timestamp)||Math.abs(Date.now()/1000-env.timestamp)>300||typeof env.payload!=='string')throw Error('INVALID');
    if(!equal_(env.signature,mac_(env.timestamp+'.'+env.payload,key)))throw Error('AUTH');
    var input=JSON.parse(env.payload);
    if((input.operation==='retentionTick'||input.operation==='retentionAck')&&!/^[0-9a-f-]{36}$/i.test(input.nonce||''))throw Error('INVALID');
    if(input.operation==='retentionTick'&&props_().getProperty('MYPAGE_RETENTION_ENABLED')==='true')return json_(signedPrivacy_('tick',input.nonce,privacyMaintenance_()));
    if(input.operation==='retentionAck'&&props_().getProperty('MYPAGE_RETENTION_ENABLED')==='true')return json_(signedPrivacy_('ack',input.nonce,privacyAck_(input.ids)));
    if(input.operation==='probe'&&props_().getProperty('MYPAGE_ALLOW_PROBE')==='true')return json_({saved:false,protocol:'mypage-v2',nonce:input.nonce});
    if(input.operation==='receipt'&&props_().getProperty('MYPAGE_ALLOW_PROBE')==='true')return json_(savedReceipt_(input));
    if(props_().getProperty('MYPAGE_ENABLED')!=='true')return json_({saved:false,code:'DISABLED'});
    var result=saveLead(input);
    if(result.saved===true) {
      var normalized=validate_(input);
      var confirmed=JSON.stringify({protocol:'mypage-save-v1',saved:true,requestId:result.requestId,verifiedAt:Math.floor(Date.now()/1000),digest:mac_(JSON.stringify([normalized.name,normalized.contact,normalized.city,normalized.job,normalized.consent,normalized.privacyVersion]),key)});
      result.confirmation={payload:confirmed,signature:mac_('save.'+confirmed,key)};
    }
    return json_(result);
  } catch(err) {
    // No input/exception text in response or logs; HTTP status is not authoritative in ContentService.
    return json_({saved:false,code:'NOT_CONFIRMED'});
  }
}
// Explicit read-only recovery operation. Install/deploy only with owner approval.
// Never call saveLead/recover_, write a cell, or dispatch a notification here.
function savedReceipt_(input) {
  if(props_().getProperty('MYPAGE_ENABLED')!=='false'||props_().getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='false')throw Error('DISABLE_FIRST');
  if(!/^[0-9a-f-]{36}$/i.test(input.requestId||'')||!/^[0-9a-f]{64}$/.test(input.nonce||''))throw Error('INVALID');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=sheets_(),rows=s.journal.getDataRange().getValues();
    var matches=rows.slice(1).filter(function(r){return r[0]===input.requestId;});
    if(matches.length!==1||matches[0][8]!=='SAVED')throw Error('UNCONFIRMED');
    var r=matches[0],target=Number(r[4]);
    if(!Number.isInteger(target)||target<2||target>s.leads.getLastRow())throw Error('ROW_CONFLICT');
    var p=payload_(r),key=props_().getProperty('MYPAGE_SIGNING_SECRET');
    if(p.requestId!==input.requestId||p.consent!==true||p.privacyVersion!==r[7]||!Number.isFinite(Date.parse(r[6])))throw Error('UNCONFIRMED');
    var digest=mac_(JSON.stringify([p.name,p.contact,p.city,p.job,p.consent,p.privacyVersion]),key);
    if(!equal_(r[1],digest))throw Error('UNCONFIRMED');
    var current=s.leads.getRange(target,1,1,7).getValues()[0],expected=values_(r);
    if(current.some(function(v,i){return String(v)!==String(expected[i]);}))throw Error('ROW_CONFLICT');
    var payload=JSON.stringify({protocol:'mypage-receipt-v1',requestId:r[0],nonce:input.nonce,state:'SAVED',digest:digest,consent:true,consentAt:r[6],privacyVersion:r[7],targetRow:target,verifiedAt:Math.floor(Date.now()/1000)});
    return {payload:payload,signature:mac_('receipt.'+payload,key)};
  } finally {lock.releaseLock();}
}
function doGet() { return json_({saved:false,code:'POST_REQUIRED'}); }
function sendTelegram(text) {
  var p=props_();
  if(p.getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='true')return {ok:false,code:'DISABLED'};
  var token=p.getProperty('TELEGRAM_BOT_TOKEN'),chat=p.getProperty('MYPAGE_TELEGRAM_CHAT_ID');
  if(!token||!chat)return {ok:false,code:'CONFIG'};
  try {
    var response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({chat_id:chat,text:String(text).slice(0,3500)})});
    var data=JSON.parse(response.getContentText()),status=response.getResponseCode();
    if(status===200&&data.ok===true&&Number.isInteger(data.result&&data.result.message_id)&&data.result.message_id>0)return {ok:true,code:'SENT',messageId:data.result.message_id};
    // Only an explicit rejection is safe to retry. A timeout/5xx may hide a delivered message.
    if(status===429&&data.ok===false)return {ok:false,code:'RETRY',retryAfter:Math.min(86400,Math.max(300,Number(data.parameters&&data.parameters.retry_after)||300))};
    if(status>=400&&status<500&&data.ok===false)return {ok:false,code:'REJECTED'};
    return {ok:false,code:'UNKNOWN'};
  } catch(err) {return {ok:false,code:'UNKNOWN'};}
}
function notificationText_(r) {
  return 'Новая заявка '+r[0]+'. Подробности доступны владельцу в закрытой таблице.';
}
function notifyRow_(s,r,index,oneShot) {
  var privacy=reserveTelegramPrivacy_(r);
  var attempt=Number(r[10])+1,next=Date.now()+Math.min(86400000,300000*Math.pow(2,attempt-1));
  // A crash at any point after this durable reservation requires human reconciliation.
  s.journal.getRange(index,10,1,4).setValues([['needs_review',attempt,next,'IN_FLIGHT']]);SpreadsheetApp.flush();
  var res=sendTelegram(notificationText_(r));
  if(res.ok){privacy.row[5]=res.messageId;privacy.row[6]=Date.now();privacy.row[7]='sent';}
  else if(res.code==='RETRY'||res.code==='REJECTED'||res.code==='CONFIG'||res.code==='DISABLED')privacy.row[7]='rejected';
  privacyWrite_(privacy);
  var status=res.ok?'sent':!oneShot&&res.code==='RETRY'&&attempt<10?'pending':'needs_review';
  s.journal.getRange(index,10,1,4).setValues([[status,attempt,res.retryAfter?Date.now()+res.retryAfter*1000:next,res.code]]);SpreadsheetApp.flush();
}
// Add a 5-minute time trigger ONLY after confirming the destination group and authorizing a test.
function retryTelegram() {
  if(props_().getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='true')return;
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    var s=sheets_(),rows=s.journal.getDataRange().getValues(),count=0;
    for(var i=1;i<rows.length&&count<5;i++) {
      var r=rows[i];recover_(s,r,i+1);
      if(r[8]!=='SAVED'||r[9]==='sent'||r[9]==='needs_review'||Number(r[11])>Date.now())continue;
      if(r[12]==='IN_FLIGHT'){s.journal.getRange(i+1,10).setValue('needs_review');SpreadsheetApp.flush();continue;}
      if(Number(r[10])>=10){s.journal.getRange(i+1,10).setValue('needs_review');SpreadsheetApp.flush();continue;}
      count++;notifyRow_(s,r,i+1,false);
    }
  } finally {lock.releaseLock();}
}
// Manual, explicitly gated, one-existing-synthetic-message operation. NEVER run automatically.
function notifyExistingSyntheticOnce() {
  var p=props_(),id='f20b1b0c-887a-43d4-b671-5a303d09ffc0';
  if(p.getProperty('MYPAGE_ALLOW_SYNTHETIC_NOTIFICATION')!=='true'||p.getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='true'||p.getProperty('MYPAGE_ENABLED')!=='false'||p.getProperty('MYPAGE_ALLOW_PROBE')!=='false')throw Error('DISABLED');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=sheets_(),rows=s.journal.getDataRange().getValues(),matches=[];
    for(var i=1;i<rows.length;i++) {
      if(rows[i][8]==='PREPARED'||rows[i][12]==='IN_FLIGHT')throw Error('UNFINISHED');
      if(rows[i][0]===id)matches.push(i);
      else if(rows[i][9]==='pending'||rows[i][9]==='needs_review')throw Error('OTHER_PENDING');
    }
    if(matches.length!==1)throw Error('UNCONFIRMED');
    var index=matches[0],r=rows[index],lead=payload_(r);
    if(r[8]!=='SAVED'||r[9]!=='pending'||Number(r[10])!==0||r[12]!==''||lead.requestId!==id||lead.consent!==true||lead.privacyVersion!==r[7]||lead.name!=='Synthetic Candidate'||lead.contact!=='@synthetic_candidate'||lead.city!=='Synthetic City'||lead.job!=='Synthetic job')throw Error('UNCONFIRMED');
    if(!equal_(r[1],mac_(JSON.stringify([lead.name,lead.contact,lead.city,lead.job,lead.consent,lead.privacyVersion]),p.getProperty('MYPAGE_SIGNING_SECRET'))))throw Error('UNCONFIRMED');
    if(!p.getProperty('TELEGRAM_BOT_TOKEN')||p.getProperty('MYPAGE_TELEGRAM_CHAT_ID')!=='-5325144321')throw Error('CONFIG');
    if(JSON.stringify(s.leads.getRange(Number(r[4]),1,1,7).getValues()[0])!==JSON.stringify(values_(r)))throw Error('ROW_CONFLICT');
    notifyRow_(s,r,index+1,true);
    return {requestId:id};
  } finally {lock.releaseLock();}
}
// Existing manual function names retained, with explicit safety gates. No test runs automatically.
function testLead() {return testDoPost();}
function testDoPost() {
  var p=props_();
  if(p.getProperty('LEADS_TEST_MODE')!=='enabled'||p.getProperty('MYPAGE_ALLOW_SYNTHETIC_TEST')!=='true')return {saved:false,code:'TEST_DISABLED'};
  var data={requestId:Utilities.getUuid(),name:'Synthetic Candidate',contact:'@synthetic_candidate',city:'Synthetic City',job:'Synthetic job',consent:true,privacyVersion:p.getProperty('MYPAGE_PRIVACY_VERSION')};
  var payload=JSON.stringify(data),timestamp=Math.floor(Date.now()/1000);
  return JSON.parse(doPost({postData:{contents:JSON.stringify({timestamp:timestamp,payload:payload,signature:mac_(timestamp+'.'+payload,p.getProperty('MYPAGE_SIGNING_SECRET'))})}}).getContent());
}

// Privacy maintenance is opt-in and independent of public intake/notifications.
var PRIVACY_HEADERS=['request_id','reason','due_at','phase','changed_at','telegram_id','telegram_at','telegram_state','d1_state','last_code'];
function sixMonths_(value) {
  var d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('INVALID_DATE');
  var end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+7,0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+6,Math.min(d.getUTCDate(),end),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds());
}
function setupPrivacyMaintenance() {
  if(props_().getProperty('MYPAGE_ENABLED')!=='false'||props_().getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='false')throw Error('DISABLE_FIRST');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {var b=book_();if(!b.getSheetByName('MypagePrivacyV1'))b.insertSheet('MypagePrivacyV1').getRange(1,1,1,10).setValues([PRIVACY_HEADERS]);SpreadsheetApp.flush();privacySheet_();}
  finally {lock.releaseLock();}
}
function privacySheet_() {
  var s=book_().getSheetByName('MypagePrivacyV1');
  if(!s||s.getLastRow()>10000||JSON.stringify(s.getRange(1,1,1,10).getValues()[0])!==JSON.stringify(PRIVACY_HEADERS))throw Error('PRIVACY_SCHEMA');return s;
}
function privacyRecord_(r,reason) {
  var sheet=privacySheet_(),rows=sheet.getDataRange().getValues(),matches=[];
  for(var i=1;i<rows.length;i++)if(rows[i][0]===r[0])matches.push(i);
  if(matches.length>1)throw Error('PRIVACY_CONFLICT');
  if(matches.length)return {sheet:sheet,index:matches[0]+1,row:rows[matches[0]]};
  // Start one day early so a healthy daily job deletes no later than six calendar months.
  var v=[r[0],reason||'expiry',sixMonths_(r[3])-86400000,'ACTIVE',Date.now(),'','','none','pending',''];
  sheet.appendRow(v);SpreadsheetApp.flush();return {sheet:sheet,index:sheet.getLastRow(),row:v};
}
function privacyWrite_(record) {record.row[4]=Date.now();record.sheet.getRange(record.index,1,1,10).setValues([record.row]);SpreadsheetApp.flush();}
function reserveTelegramPrivacy_(r) {
  var e=privacyRecord_(r);
  if(!['none','rejected'].includes(e.row[7])||e.row[3]!=='ACTIVE'||Date.now()>=Number(e.row[2]))throw Error('NOTIFICATION_RESERVED');
  e.row[7]='unknown';privacyWrite_(e);return e;
}
function deleteTelegramCopy_(e) {
  if(e.row[7]==='none'||e.row[7]==='deleted'||e.row[7]==='manual_done'||e.row[7]==='rejected')return;
  if(e.row[7]==='unknown'||!e.row[5]||!e.row[6]){e.row[9]='TELEGRAM_MANUAL';return;}
  if(props_().getProperty('MYPAGE_TELEGRAM_DELETE_ENABLED')!=='true'){e.row[9]='TELEGRAM_DELETE_DISABLED';return;}
  if(Date.now()-Number(e.row[6])>=48*3600000){e.row[9]='TELEGRAM_MANUAL_48H';return;}
  var token=props_().getProperty('TELEGRAM_BOT_TOKEN'),chat=props_().getProperty('MYPAGE_TELEGRAM_CHAT_ID');
  if(!token||!chat){e.row[9]='TELEGRAM_CONFIG';return;}
  try {
    var response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/deleteMessage',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({chat_id:chat,message_id:Number(e.row[5])})});
    var result=JSON.parse(response.getContentText());
    if(response.getResponseCode()===200&&result.ok===true){e.row[7]='deleted';e.row[5]='';e.row[6]='';e.row[9]='';}
    else e.row[9]='TELEGRAM_DELETE_REVIEW';
  }catch(error){e.row[9]='TELEGRAM_DELETE_UNKNOWN';}
}
// Owner-editor operation only: verify identity and any legal hold BEFORE calling.
function queuePrivacyRequest(requestId,reason) {
  if(!/^[0-9a-f-]{36}$/i.test(requestId||'')||!['withdrawal','erasure'].includes(reason))throw Error('INVALID');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var rows=sheets_().journal.getDataRange().getValues().slice(1).filter(function(r){return r[0]===requestId;});
    if(rows.length!==1||rows[0][8]!=='SAVED')throw Error('UNCONFIRMED');
    var e=privacyRecord_(rows[0],reason);e.row[1]=reason;e.row[2]=Date.now();privacyWrite_(e);
    return {queued:true};
  }finally{lock.releaseLock();}
}
function privacyMaintenance_() {
  if(props_().getProperty('MYPAGE_RETENTION_ENABLED')!=='true')throw Error('RETENTION_DISABLED');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=sheets_(),rows=s.journal.getDataRange().getValues(),ledger=privacySheet_(),ids=[],now=Date.now(),touched=0,known={};
    ledger.getDataRange().getValues().slice(1).forEach(function(r){if(r[0]){if(known[r[0]])throw Error('PRIVACY_CONFLICT');known[r[0]]=r;}});
    if(rows.slice(1).some(function(r){return r[8]==='PREPARED';}))throw Error('PREPARED_REVIEW');
    var holds=JSON.parse(props_().getProperty('MYPAGE_LEGAL_HOLD_IDS')||'[]');
    if(!Array.isArray(holds)||holds.some(function(id){return !/^[0-9a-f-]{36}$/i.test(id);}))throw Error('HOLD_CONFIG');
    for(var i=1;i<rows.length&&touched<20;i++) {
      var r=rows[i];if(!r[0]||!['SAVED','ERASING','ERASED'].includes(r[8]))continue;
      if(r[8]==='ERASED'&&!known[r[0]])throw Error('PRIVACY_CONFLICT');
      if(known[r[0]]&&known[r[0]][3]==='COMPLETE'&&now-Number(known[r[0]][4])<7*86400000)continue;
      if(holds.indexOf(r[0])!==-1)continue;
      if(r[8]==='ERASED'&&known[r[0]][8]==='deleted'&&String(known[r[0]][9]).indexOf('TELEGRAM_MANUAL')===0)continue;
      var due=known[r[0]]?Number(known[r[0]][2]):sixMonths_(r[3])-86400000;
      if(now<due&&!(known[r[0]]&&known[r[0]][7]==='sent'&&now-Number(known[r[0]][6])>=24*3600000))continue;
      touched++;
      var e=privacyRecord_(r);
      if(e.row[7]==='sent'&&now-Number(e.row[6])>=24*3600000){deleteTelegramCopy_(e);privacyWrite_(e);}
      if(now<Number(e.row[2]))continue;
      if(r[8]!=='ERASED') {
        if(rows.slice(1).filter(function(x){return x[0]===r[0];}).length!==1)throw Error('ID_CONFLICT');
        var target=Number(r[4]);if(!Number.isInteger(target)||target<2||target>s.leads.getMaxRows())throw Error('ROW_CONFLICT');
        var current=s.leads.getRange(target,1,1,7).getValues()[0];
        if(current.some(function(v){return v!==''&&v!==null;})&&current[5]!=='mypage / '+r[0])throw Error('ROW_CONFLICT');
        // Durable tombstone BEFORE erasure: crash recovery must never recreate this candidate.
        s.journal.getRange(i+1,9).setValue('ERASING');SpreadsheetApp.flush();
        if(r[9]==='sent'&&e.row[7]==='none'){e.row[7]='unknown';e.row[9]='LEGACY_TELEGRAM_MANUAL';}
        s.leads.getRange(target,1,1,7).clearContent();SpreadsheetApp.flush();
        s.journal.getRange(i+1,1,1,13).setValues([[r[0],'','','','','','','','ERASED','',0,0,'']]);SpreadsheetApp.flush();
        e.row[3]='AWAIT_D1';privacyWrite_(e);
      }
      deleteTelegramCopy_(e);
      if(e.row[8]!=='deleted')ids.push(r[0]);
      else if(['none','deleted','manual_done','rejected'].includes(e.row[7])) {
        if(e.row[3]!=='COMPLETE'){e.row[3]='COMPLETE';privacyWrite_(e);}
        else if(now-Number(e.row[4])>=7*86400000){s.journal.getRange(i+1,1,1,13).clearContent();ledger.getRange(e.index,1,1,10).clearContent();SpreadsheetApp.flush();continue;}
      }
      // Do not refresh COMPLETE timestamps: they bound tombstone retention.
      if(e.row[3]!=='COMPLETE')privacyWrite_(e);
    }
    return ids;
  }finally{lock.releaseLock();}
}
function privacyAck_(ids) {
  if(props_().getProperty('MYPAGE_RETENTION_ENABLED')!=='true'||!Array.isArray(ids)||ids.length>20||ids.some(function(id){return !/^[0-9a-f-]{36}$/i.test(id);}))throw Error('INVALID');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=sheets_(),journal=s.journal.getDataRange().getValues(),ledger=privacySheet_(),rows=ledger.getDataRange().getValues();
    ids.forEach(function(id){
      var entries=rows.map(function(r,i){return {row:r,index:i+1};}).filter(function(e){return e.row[0]===id;});
      if(entries.length!==1||journal.filter(function(r){return r[0]===id&&r[8]==='ERASED';}).length!==1)throw Error('UNCONFIRMED');
      var e={sheet:ledger,index:entries[0].index,row:entries[0].row};e.row[8]='deleted';privacyWrite_(e);
    });return ids;
  }finally{lock.releaseLock();}
}
function signedPrivacy_(kind,nonce,ids) {
  if(typeof nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(nonce))throw Error('INVALID');
  var payload=JSON.stringify({protocol:'mypage-privacy-v1',kind:kind,nonce:nonce,ids:ids,at:Math.floor(Date.now()/1000)});
  return {payload:payload,signature:mac_('privacy.'+payload,props_().getProperty('MYPAGE_SIGNING_SECRET'))};
}
function queueOwnerPrivacyRequest() {
  var p=props_();return queuePrivacyRequest(p.getProperty('MYPAGE_ERASE_REQUEST_ID'),p.getProperty('MYPAGE_ERASE_REASON'));
}
// Owner confirms deletion in the Telegram UI; this is not an API-delivery inference.
function confirmOwnerTelegramDeletion() {
  var p=props_(),id=p.getProperty('MYPAGE_ERASE_REQUEST_ID');
  if(p.getProperty('MYPAGE_CONFIRM_TELEGRAM_DELETION')!=='true'||!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('OWNER_CONFIRMATION_REQUIRED');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var s=privacySheet_(),rows=s.getDataRange().getValues(),matches=[];
    for(var i=1;i<rows.length;i++)if(rows[i][0]===id)matches.push(i);
    if(matches.length!==1)throw Error('UNCONFIRMED');
    var e={sheet:s,index:matches[0]+1,row:rows[matches[0]]};e.row[5]='';e.row[6]='';e.row[7]='manual_done';e.row[9]='OWNER_CONFIRMED';privacyWrite_(e);
    p.setProperty('MYPAGE_CONFIRM_TELEGRAM_DELETION','false');
  }finally{lock.releaseLock();}
}
// Owner-run after code installation; preserves every existing secret/property not listed.
function installClosedLaunchSettings() {
  var p=props_();
  if(p.getProperty('MYPAGE_ENABLED')!=='false'||p.getProperty('MYPAGE_NOTIFICATIONS_ENABLED')!=='false')throw Error('DISABLE_FIRST');
  p.setProperties({MYPAGE_PRIVACY_VERSION:MYPAGE_POLICY_VERSION,MYPAGE_ENABLED:'false',MYPAGE_NOTIFICATIONS_ENABLED:'false',MYPAGE_ALLOW_PROBE:'false',MYPAGE_RETENTION_ENABLED:'false',MYPAGE_TELEGRAM_DELETE_ENABLED:'false'},false);
}
