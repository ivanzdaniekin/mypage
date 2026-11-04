/* PROPOSAL ONLY. Not installed. Review against existing script before approving.
 * Use a dedicated worksheet MypageApplicationsV1, not the existing lead columns.
 * Script Properties: MYPAGE_SIGNING_SECRET, MYPAGE_SHEET_ID, MYPAGE_PRIVACY_VERSION,
 * MYPAGE_ENABLED=true, TELEGRAM_BOT_TOKEN, MYPAGE_TELEGRAM_CHAT_ID.
 * TELEGRAM_BOT_TOKEN is a configurable property name to align with the existing project.
 * No secrets are committed; do not create a second doPost in an existing project.
 */
var MYPAGE_HEADERS = ['request_id','created','name','contact','city','job','consent','privacy_version','fingerprint','telegram_status','attempts'];
function mypageSheet_() {
  var id=PropertiesService.getScriptProperties().getProperty('MYPAGE_SHEET_ID');
  if(!id)throw Error('configuration');
  var sheet=SpreadsheetApp.openById(id).getSheetByName('MypageApplicationsV1');
  if(!sheet)throw Error('Create approved dedicated worksheet with documented header first');
  if(JSON.stringify(sheet.getRange(1,1,1,11).getValues()[0])!==JSON.stringify(MYPAGE_HEADERS))throw Error('schema');
  return sheet;
}
function mypageReply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function mypageMAC_(text,key) { return Utilities.computeHmacSha256Signature(text,key,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
function mypageEqual_(a,b) {
  if(typeof a!=='string'||a.length!==64||b.length!==64)return false;
  var d=0;for(var i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
function mypageValidate_(p,version) {
  if(!p||p.consent!==true||!version||p.privacyVersion!==version||!/^[0-9a-f-]{36}$/i.test(p.requestId||''))throw Error('validation');
  [['name',2,80],['contact',5,80],['city',2,100],['job',2,500]].forEach(function(f){
    if(typeof p[f[0]]!=='string')throw Error('validation');
    p[f[0]]=p[f[0]].trim().normalize('NFC');var s=p[f[0]];
    if(s.length<f[1]||s.length>f[2]||/[\u0000-\u001f\u007f]/.test(s))throw Error('validation');
  });
  if(!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(p.contact)&&!/^\+[\d ()-]{7,25}$/.test(p.contact))throw Error('contact');
}
// Force literal text even for leading =,+,-,@, whitespace and apostrophes.
function mypageCell_(value) { return "'"+String(value); }
function mypageAccept(e) {
  var props=PropertiesService.getScriptProperties();
  var key=props.getProperty('MYPAGE_SIGNING_SECRET');
  if(props.getProperty('MYPAGE_ENABLED')!=='true'||!key)return mypageReply_({saved:false});
  var p,lock,locked=false;
  try {
    if(!e||!e.postData||e.postData.contents.length>16000)throw Error('size');
    var env=JSON.parse(e.postData.contents);
    if(!Number.isInteger(env.timestamp)||Math.abs(Date.now()/1000-env.timestamp)>300||typeof env.payload!=='string')throw Error('envelope');
    if(!mypageEqual_(env.signature,mypageMAC_(env.timestamp+'.'+env.payload,key)))throw Error('signature');
    p=JSON.parse(env.payload);mypageValidate_(p,props.getProperty('MYPAGE_PRIVACY_VERSION'));
    lock=LockService.getScriptLock();lock.waitLock(10000);locked=true;
    var sheet=mypageSheet_();var rows=sheet.getDataRange().getValues();
    // Contact+city+job suppresses identical repeat applications for 24 hours, even with a new UUID.
    var fingerprint=mypageMAC_(JSON.stringify([p.contact.toLowerCase().replace(/[ ()-]/g,''),p.city.toLowerCase(),p.job.toLowerCase()]),key);
    for(var i=1;i<rows.length;i++) {
      if(rows[i][0]===p.requestId) {
        if(rows[i][8]!==fingerprint)throw Error('id-conflict');
        return mypageReply_({saved:true,requestId:p.requestId});
      }
      if(rows[i][8]===fingerprint && Date.now()-new Date(rows[i][1]).getTime()<86400000) return mypageReply_({saved:true,requestId:p.requestId});
    }
    sheet.appendRow([p.requestId,new Date().toISOString(),mypageCell_(p.name),mypageCell_(p.contact),mypageCell_(p.city),mypageCell_(p.job),true,p.privacyVersion,fingerprint,'pending',0]);
    SpreadsheetApp.flush(); // Receipt is sent only after durable sheet write.
  } catch(err) { return mypageReply_({saved:false}); }
  finally { if(locked)lock.releaseLock(); }
  // Notification does not decide whether the application was saved.
  try { mypageRetryTelegram(); } catch(err) { /* leave durable pending outbox; no PII logs */ }
  return mypageReply_({saved:true,requestId:p.requestId});
}
// APPROVAL REQUIRED: route doPost(e) to mypageAccept(e) after inspecting existing doPost.
// A separate time-driven trigger must call this function every 5 minutes after approval.
function mypageRetryTelegram() {
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('MYPAGE_ENABLED')!=='true')return;
  var token=props.getProperty('TELEGRAM_BOT_TOKEN');
  var chat=props.getProperty('MYPAGE_TELEGRAM_CHAT_ID');
  if(!token||!chat)return; // keep pending, never falsely mark sent
  var lock=LockService.getScriptLock(); if(!lock.tryLock(1000))return;
  try {
    var sheet=mypageSheet_(),rows=sheet.getDataRange().getValues(),processed=0;
    for(var i=1;i<rows.length && processed<10;i++) {
      if(rows[i][9]==='sent'||Number(rows[i][10])>=10)continue;
      processed++;
      sheet.getRange(i+1,11).setValue(Number(rows[i][10])+1);SpreadsheetApp.flush();
      var text='Заявка '+rows[i][0]+'\nИмя: '+rows[i][2]+'\nКонтакт: '+rows[i][3]+'\nГород: '+rows[i][4]+'\nРабота: '+rows[i][5];
      try {
        var res=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
          method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:chat,text:text}),muteHttpExceptions:true});
        var body=JSON.parse(res.getContentText());
        if(res.getResponseCode()===200&&body.ok===true)sheet.getRange(i+1,10).setValue('sent');
      } catch(err) { /* pending remains in sheet; owner sees attempts */ }
      SpreadsheetApp.flush();
    }
  } finally {lock.releaseLock();}
}
