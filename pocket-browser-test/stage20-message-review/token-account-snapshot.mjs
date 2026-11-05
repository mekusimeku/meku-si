/**
 * Stage 20 additional read-only Token-2022 RPC snapshot shape/owner gate.
 * This is a point-in-time, single-endpoint response CHECK, NOT chain consensus,
 * verified authenticity, transaction approval, or permission to sign/send.
 */
import { MEKU_MINT, TOKEN_2022_PROGRAM } from './review-message.mjs';
export class SnapshotDenied extends Error {
  constructor(code) {super(code);this.name='SnapshotDenied';this.code=code;}
}
const deny=code=>{throw new SnapshotDenied(code);};
const U64MAX=(1n<<64n)-1n;
const isRecord=x=>!!x && typeof x==='object' && !Array.isArray(x) && [Object.prototype,null].includes(Object.getPrototypeOf(x)) && Object.values(Object.getOwnPropertyDescriptors(x)).every(d=>Object.hasOwn(d,'value'));
function u64(s) {
  if(typeof s!=='string' || !/^(0|[1-9][0-9]{0,19})$/.test(s))deny('BAD_TOKEN_AMOUNT');
  const n=BigInt(s);if(n>U64MAX)deny('BAD_TOKEN_AMOUNT');return n;
}
function checkReview(review) {
  if(!isRecord(review) || review.asset!=='MEKU SI' || review.requestedNetwork!=='mainnet-beta' || review.networkProof!=='NOT_VERIFIED_IN_MESSAGE' || review.tokenAccountProof!=='NOT_VERIFIED' || review.status!=='REVIEW_ONLY_NO_SIGNING' || review.programId!==TOKEN_2022_PROGRAM || review.decimals!==6)deny('INVALID_REVIEW');
  for(const k of ['sourceTokenAccount','destinationTokenAccount','owner','claimedRecipientWallet'])if(typeof review[k]!=='string'||!review[k] )deny('INVALID_REVIEW');
  if(review.sourceTokenAccount===review.destinationTokenAccount || review.owner===review.claimedRecipientWallet)deny('INVALID_REVIEW');
  if(!Array.isArray(review.requires) || !review.requires.includes('finalized-source-token-account-owner-proof') || !review.requires.includes('finalized-destination-token-account-wallet-proof'))deny('INVALID_REVIEW');
  if(u64(review.baseUnits)===0n)deny('INVALID_REVIEW');
}
function parseAccount(a, walletOwner) {
  if(!isRecord(a) || a.owner!==TOKEN_2022_PROGRAM || a.executable!==false)deny('NOT_TOKEN_2022_ACCOUNT');
  const data=a.data;
  if(!isRecord(data) || data.program!=='spl-token-2022' || !isRecord(data.parsed) || data.parsed.type!=='account')deny('NOT_TOKEN_2022_ACCOUNT');
  const info=data.parsed.info;
  if(!isRecord(info) || info.mint!==MEKU_MINT || info.owner!==walletOwner || info.state!=='initialized' || info.isNative!==false)deny('ACCOUNT_STATE_MISMATCH');
  if((info.delegate??null)!==null || (info.closeAuthority??null)!==null || (info.delegatedAmount??null)!==null)deny('UNSUPPORTED_TOKEN_AUTHORITY');
  if(!Array.isArray(info.extensions) || info.extensions.length!==0)deny('UNREVIEWED_ACCOUNT_EXTENSION');
  if(!isRecord(info.tokenAmount)||info.tokenAmount.decimals!==6)deny('ACCOUNT_DECIMALS_MISMATCH');
  return u64(info.tokenAmount.amount);
}
export function validateTokenAccountSnapshot(review,rpcResponse) {
  checkReview(review);
  if(!isRecord(rpcResponse) || rpcResponse.jsonrpc!=='2.0' || rpcResponse.id!==20 || rpcResponse.error!==undefined)deny('BAD_RPC_RESPONSE');
  const result=rpcResponse.result;
  if(!isRecord(result) || !isRecord(result.context) || !Number.isSafeInteger(result.context.slot) || result.context.slot<=0 || !Array.isArray(result.value) || result.value.length!==2)deny('BAD_RPC_RESPONSE');
  // JSON-RPC returns the account values in exactly the same order as the supplied two addresses.
  const sourceBalance=parseAccount(result.value[0],review.owner);
  parseAccount(result.value[1],review.claimedRecipientWallet);
  if(sourceBalance<u64(review.baseUnits))deny('INSUFFICIENT_SNAPSHOT_BALANCE');
  return Object.freeze({
    sourceTokenAccount:review.sourceTokenAccount,
    destinationTokenAccount:review.destinationTokenAccount,
    claimedRecipientWallet:review.claimedRecipientWallet,
    sourceWallet:review.owner,
    mint:MEKU_MINT,
    slot:result.context.slot,
    sourceBaseUnits:sourceBalance.toString(),
    status:'SNAPSHOT_MATCH_ONLY_NO_APPROVAL',
    networkProof:'SINGLE_RPC_SNAPSHOT_NOT_CONSENSUS',
    transfersAuthorized:false,
  });
}
/** A single GET-MULTIPLE-ACCOUNTS RPC request; never calls a write method or retries.
 * The result remains a non-authoritative point-in-time snapshot. A production
 * signer must re-verify account/mint state independently just before approval.
 */
export async function readTokenAccountSnapshot(review,{fetchFn=globalThis.fetch,endpoint='https://api.mainnet-beta.solana.com'}={}) {
  checkReview(review);
  if(endpoint!=='https://api.mainnet-beta.solana.com' || typeof fetchFn!=='function')deny('UNAPPROVED_RPC');
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),12000);
  try {
    const body=JSON.stringify({jsonrpc:'2.0',id:20,method:'getMultipleAccounts',params:[[review.sourceTokenAccount,review.destinationTokenAccount],{commitment:'finalized',encoding:'jsonParsed'}]});
    const resp=await fetchFn(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,signal:ac.signal});
    if(!resp || resp.ok!==true || typeof resp.text!=='function')deny('RPC_UNAVAILABLE');
    const raw=await resp.text();
    if(typeof raw!=='string'||raw.length>60000)deny('RPC_RESPONSE_TOO_LARGE');
    let value;try{value=JSON.parse(raw);}catch{deny('BAD_RPC_RESPONSE');}
    return validateTokenAccountSnapshot(review,value);
  } finally {clearTimeout(timer);}
}
