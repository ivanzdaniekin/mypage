// Offline synthetic receipts only; never imported by the site or deployed backend.
import {hmac} from '../backend/worker.mjs';
export async function signedReceipt(key,lead,requestId,now=Math.floor(Date.now()/1000)) {
 const digest=await hmac(key,JSON.stringify([lead.name,lead.contact,lead.city,lead.job,lead.consent,lead.privacyVersion]));
 const payload=JSON.stringify({protocol:'mypage-save-v1',saved:true,requestId,digest,verifiedAt:now});
 return {saved:true,protocol:'mypage-v2',requestId,confirmation:{payload,signature:await hmac(key,'save.'+payload)}};
}
