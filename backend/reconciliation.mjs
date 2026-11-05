// Offline verification and conditional SQL preparation ONLY. No network or DB execution.
import {hmac,validate} from './worker.mjs';
export async function reconciliationPlan({evidence,lead,nonce,signingSecret,hashSecret,now=Math.floor(Date.now()/1000)}) {
  if(!signingSecret||!hashSecret||!/^[0-9a-f]{64}$/.test(nonce||'')||typeof evidence?.payload!=='string'||evidence.payload.length>4096)throw Error('invalid-evidence');
  if(evidence.signature!==await hmac(signingSecret,'receipt.'+evidence.payload))throw Error('invalid-signature');
  const r=JSON.parse(evidence.payload),normalized=validate(lead,lead.privacyVersion);
  if(r.protocol!=='mypage-receipt-v1'||r.state!=='SAVED'||r.requestId!==lead.requestId||r.nonce!==nonce||r.consent!==true||r.privacyVersion!==lead.privacyVersion||!Number.isFinite(Date.parse(r.consentAt))||!Number.isInteger(r.targetRow)||r.targetRow<2||!Number.isInteger(r.verifiedAt)||now-r.verifiedAt<0||now-r.verifiedAt>300)throw Error('unconfirmed');
  const digest=await hmac(signingSecret,JSON.stringify([normalized.name,normalized.contact,normalized.city,normalized.job,normalized.consent,normalized.privacyVersion]));
  if(r.digest!==digest)throw Error('payload-conflict');
  const workerDigest=await hmac(hashSecret,JSON.stringify(normalized));
  return {sql:'UPDATE receipts SET saved=1,updated=? WHERE id=? AND digest=? AND saved=0 RETURNING id,saved',params:[now,r.requestId,workerDigest]};
}
