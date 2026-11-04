import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
export function harness() {
 const data={'Лист1':[['Дата и время','Имя','Телефон / Telegram','Город','Интересующая работа','Источник','Статус']]};
 let locked=false,fail='',notifications=0,telegramResult='unknown';
 const props={MYPAGE_ENABLED:'true',MYPAGE_SHEET_ID:'offline',MYPAGE_SIGNING_SECRET:'offline-key',MYPAGE_PRIVACY_VERSION:'test-v2',MYPAGE_NOTIFICATIONS_ENABLED:'false'};
 const literal=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
 function lastRow(name){let n=data[name].length;while(n>0&&data[name][n-1].every(v=>v===''||v===null))n--;return n;}
 function sheet(name){return {
  getLastRow:()=>lastRow(name),getMaxRows:()=>1000,
  getDataRange:()=>({getValues:()=>data[name].map(r=>[...r])}),
  appendRow(row){data[name][lastRow(name)]=[...row];if(fail==='journal-append'&&name==='MypageJournalV2'){fail='';throw Error('ambiguous append')}},
  getRange(row,col,n=1,m=1){return {
   getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[name][row-1+i]?.[col-1+j]??'')),
   setNumberFormat(){return this},
   setValues(values){if(fail==='notification-final'&&name==='MypageJournalV2'&&col===10&&values[0][0]==='sent'){fail='';throw Error('lost notification confirmation');}
    for(let i=0;i<n;i++){data[name][row-1+i]??=[];for(let j=0;j<m;j++)data[name][row-1+i][col-1+j]=literal(values[i][j]);}
    if(fail==='lead-write'&&name==='Лист1'){fail='';throw Error('ambiguous write')}
    if(fail==='mark-saved'&&name==='MypageJournalV2'&&col===9){fail='';throw Error('ambiguous saved')}
    return this},
   setValue(value){return this.setValues([[value]])}
   ,clearContent(){if(fail==='erase-lead'&&name==='Лист1'){fail='';this.setValues(Array.from({length:n},()=>Array(m).fill('')));throw Error('ambiguous erasure');}return this.setValues(Array.from({length:n},()=>Array(m).fill('')));}
  }}
 }}
 const book={getSheetByName:n=>data[n]?sheet(n):null,insertSheet:n=>{data[n]=[];return sheet(n)}};
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;},setProperties:(values,replace)=>{if(replace)throw Error('must preserve secrets');Object.assign(props,values);}})},
  Utilities:{Charset:{UTF_8:'utf8'},getUuid:randomUUID,computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()],base64Encode:s=>Buffer.from(s).toString('base64'),base64Decode:s=>Buffer.from(s,'base64'),newBlob:s=>({getBytes:()=>[...Buffer.from(s)],getDataAsString:()=>Buffer.from(s).toString()})},
  LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('busy');locked=true},tryLock(){if(locked)return false;locked=true;return true},releaseLock(){locked=false}})},
  SpreadsheetApp:{openById:()=>book,getActiveSpreadsheet:()=>book,flush(){}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return this},getContent:()=>s})},
  UrlFetchApp:{fetch(){notifications++;if(telegramResult==='unknown')throw Error('offline');if(telegramResult==='rate')return {getResponseCode:()=>429,getContentText:()=>'{"ok":false,"parameters":{"retry_after":600}}'};if(telegramResult==='rejected')return {getResponseCode:()=>403,getContentText:()=>'{"ok":false}'};return {getResponseCode:()=>200,getContentText:()=>'{"ok":true,"result":{"message_id":1}}'}}},Date,JSON};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../backend/Code.gs',import.meta.url),'utf8'),ctx);
 props.MYPAGE_ENABLED='false';ctx.setupMypage();ctx.setupPrivacyMaintenance();props.MYPAGE_ENABLED='true';
 function post(p,key=props.MYPAGE_SIGNING_SECRET){const timestamp=Math.floor(Date.now()/1000),payload=JSON.stringify(p);return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({timestamp,payload,signature:createHmac('sha256',key).update(timestamp+'.'+payload).digest('hex')})}}).getContent());}
 return {ctx,props,data,post,fail:value=>{fail=value},setLocked:v=>{locked=v},notifications:()=>notifications,telegramOK:()=>{telegramResult='ok'},telegramMode:v=>{telegramResult=v}};
}
