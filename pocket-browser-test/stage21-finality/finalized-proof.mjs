/** MEKU Pocket Stage 21: TEST ONLY, read-only settlement evidence checker.
 * Never signs, broadcasts, retries, moves funds, or changes a payment journal.
 * Import strict Stage 20 unsigned-message parser (same exact committed branch).
 * A matched chain receipt is NOT approval to send, a claim of economic delivery,
 * or proof that two labels describe independent blockchain providers.
 */
import { createHash, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import { inspectLegacyMessage } from '../stage20-message-review/review-message.mjs';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SPKI = Buffer.from('302a300506032b6570032100','hex');
export class ReceiptDenied extends Error {
  constructor(code) { super(code); this.name='ReceiptDenied'; this.code=code; }
}
function deny(code) { throw new ReceiptDenied(code); }
function plain(o) {return !!o && typeof o==='object' && !Array.isArray(o) && [Object.prototype,null].includes(Object.getPrototypeOf(o)) && Object.values(Object.getOwnPropertyDescriptors(o)).every(d=>Object.hasOwn(d,'value')); }
function shape(o, keys, code='BAD_SHAPE') {
  if (!plain(o) || Object.keys(o).sort().join('|') !== [...keys].sort().join('|')) deny(code);
}
function bytesFrom58(s, expected) {
  if(typeof s!=='string'||s.length<1||s.length>100)deny('BAD_BASE58');
  let n=0n;
  for(const c of s){const i=ALPHABET.indexOf(c);if(i<0)deny('BAD_BASE58');n=n*58n+BigInt(i);}
  const arr=[];while(n){arr.push(Number(n&255n));n>>=8n;}
  let z=0;while(z<s.length&&s[z]==='1')z++;
  const bytes=Buffer.from([...Array(z).fill(0),...arr.reverse()]);
  if(bytes.length!==expected || to58(bytes)!==s)deny('BAD_BASE58');
  return bytes;
}
function to58(b) {
  let n=0n;for(const v of b)n=(n<<8n)|BigInt(v);
  let s='';while(n){s=ALPHABET[Number(n%58n)]+s;n/=58n;}
  let z=0;while(z<b.length&&b[z]===0)z++;
  return '1'.repeat(z)+s;
}
function strictBase64(input) {
  if(typeof input!=='string'||input.length>1800||input.length<1||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input))deny('BAD_TRANSACTION_BYTES');
  const b=Buffer.from(input,'base64');
  if(b.toString('base64')!==input || b.length<170 || b.length>1232)deny('BAD_TRANSACTION_BYTES');
  return b;
}
function freezePlan(plan) {
  shape(plan,['signature','messageSha256','transfer','maxFeeLamports'],'BAD_PLAN');
  if(typeof plan.messageSha256!=='string'|| !/^[a-f0-9]{64}$/.test(plan.messageSha256))deny('BAD_DIGEST');
  const signature=bytesFrom58(plan.signature,64);
  if(!Number.isSafeInteger(plan.maxFeeLamports)||plan.maxFeeLamports<0||plan.maxFeeLamports>10_000_000)deny('BAD_FEE_LIMIT');
  const transfer=plan.transfer;
  const fields=transfer?.asset==='SOL' ? ['asset','network','owner','recipient','baseUnits'] : ['asset','network','owner','recipientWallet','sourceTokenAccount','destinationTokenAccount','mint','decimals','baseUnits'];
  shape(transfer,fields,'BAD_TRANSFER_PLAN');
  const safe={};for(const k of fields){if(typeof transfer[k]!=='string' && !(k==='decimals'&&Number.isInteger(transfer[k])))deny('BAD_TRANSFER_PLAN');safe[k]=transfer[k];}
  return Object.freeze({signature:plan.signature,signatureBytes:signature,digest:plan.messageSha256,transfer:Object.freeze(safe),maxFeeLamports:plan.maxFeeLamports});
}
function transactionProof(encoded, plan) {
  const wire=strictBase64(encoded);
  if(wire[0]!==1)deny('UNEXPECTED_WIRE_SIGNATURE_COUNT'); // canonical one-signature shortvec
  const sig=wire.subarray(1,65);
  if(!timingSafeEqual(sig,plan.signatureBytes))deny('SIGNATURE_MISMATCH');
  const msg=wire.subarray(65);
  const hash=createHash('sha256').update(msg).digest('hex');
  if(!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(plan.digest,'hex')))deny('MESSAGE_HASH_MISMATCH');
  const detail=inspectLegacyMessage(msg,plan.transfer); // byte-level transfer and owner checks
  const owner=bytesFrom58(detail.owner,32);
  const key=createPublicKey({key:Buffer.concat([SPKI,owner]),format:'der',type:'spki'});
  if(!verify(null,msg,key,sig))deny('INVALID_ED25519_SIGNATURE');
  return Object.freeze({messageSha256:hash,signature:to58(sig),asset:detail.asset,owner:detail.owner,recipient:detail.recipient,claimedRecipientWallet:detail.claimedRecipientWallet,amount:detail.amount});
}
function statusProof(body) {
  if(!plain(body)||body.jsonrpc!=='2.0'||body.error!==undefined||!plain(body.result)||!Number.isSafeInteger(body.result.context?.slot))deny('BAD_STATUS_RPC');
  if(!Array.isArray(body.result.value)||body.result.value.length!==1)deny('BAD_STATUS_RPC');
  const s=body.result.value[0];
  if(!plain(s)||s.confirmationStatus!=='finalized'||s.err!==null||!Number.isSafeInteger(s.slot)||s.slot<=0||s.confirmations!==null||!plain(s.status)||!Object.hasOwn(s.status,'Ok')||s.status.Ok!==null||Object.keys(s.status).length!==1)deny('NOT_FINALIZED');
  if(body.result.context.slot<s.slot)deny('BAD_STATUS_RPC');
  return s.slot;
}
function transactionRPC(body,plan) {
  if(!plain(body)||body.jsonrpc!=='2.0'||body.error!==undefined||!plain(body.result))deny('BAD_TRANSACTION_RPC');
  const x=body.result;
  if(!Number.isSafeInteger(x.slot)||x.slot<=0||x.version!=='legacy'||!plain(x.meta)||x.meta.err!==null||!Array.isArray(x.transaction)||x.transaction.length!==2||x.transaction[1]!=='base64')deny('BAD_TRANSACTION_RPC');
  if(!Number.isSafeInteger(x.meta.fee)||x.meta.fee<0||x.meta.fee>plan.maxFeeLamports)deny('FEE_NOT_APPROVED');
  if(x.meta.innerInstructions!==null && !(Array.isArray(x.meta.innerInstructions)&&x.meta.innerInstructions.length===0))deny('UNEXPECTED_INNER_INSTRUCTIONS');
  const tx=transactionProof(x.transaction[0],plan);
  return Object.freeze({...tx,slot:x.slot,feeLamports:x.meta.fee});
}
/** Both evidence sources MUST be independent verified trusted clients in production;
 * this function does not authenticate RPC labels or endpoints. Synthetic-only today.
 * Never take a submitted transfer/status from an AI or webpage as proof of payment.
 */
export function reconcileFinalizedEvidence(rawPlan, evidenceA, evidenceB) {
  try {
    const plan=freezePlan(rawPlan);
    if(!plain(evidenceA)||!plain(evidenceB)||typeof evidenceA.providerId!=='string'||typeof evidenceB.providerId!=='string'||evidenceA.providerId===evidenceB.providerId|| !/^[a-zA-Z0-9_-]{2,40}$/.test(evidenceA.providerId)|| !/^[a-zA-Z0-9_-]{2,40}$/.test(evidenceB.providerId))deny('SOURCE_PROOF_REQUIRED');
    const inspect=e=>{
      shape(e,['providerId','statusResponse','transactionResponse'],'BAD_EVIDENCE');
      const slot=statusProof(e.statusResponse);
      const tx=transactionRPC(e.transactionResponse,plan);
      if(slot!==tx.slot)deny('SLOT_DISAGREEMENT');
      return tx;
    };
    const left=inspect(evidenceA),right=inspect(evidenceB);
    if(left.slot!==right.slot || left.feeLamports!==right.feeLamports || left.messageSha256!==right.messageSha256 || left.signature!==right.signature)deny('INDEPENDENT_READ_DISAGREEMENT');
    return Object.freeze({state:'EXACT_FINALIZED_RECEIPT_MATCH_TEST_ONLY',signature:left.signature,slot:left.slot,messageSha256:left.messageSha256,asset:left.asset,owner:left.owner,feeLamports:left.feeLamports,transferAmount:left.amount,delivery:'NOT_VERIFIED',providerIndependence:'NOT_ATTESTED',action:'NO_AUTOMATIC_RETRY_OR_BROADCAST'});
  }catch(err) {
    return Object.freeze({state:'REVIEW_REQUIRED',reason:err instanceof ReceiptDenied ? err.code : 'UNVERIFIED_OR_UNAVAILABLE',action:'NO_AUTOMATIC_RETRY_OR_BROADCAST'});
  }
}
