/** Test-only fixed-endpoint Solana finalized-receipt fetcher.
 * Every RPC is READ-ONLY; never call sendTransaction or simulate signing.
 * Public RPC endpoints are NOT approved production quorum or authenticated providers.
 */
import { reconcileFinalizedEvidence } from './finalized-proof.mjs';
const ENDPOINTS=Object.freeze([
  Object.freeze({id:'solana-public',url:'https://api.mainnet-beta.solana.com'}),
  Object.freeze({id:'publicnode-public',url:'https://solana-rpc.publicnode.com'}),
]);
const REQ_TIMEOUT_MS=8000;
function plain(o){return !!o&&typeof o==='object'&&!Array.isArray(o)&&[null,Object.prototype].includes(Object.getPrototypeOf(o))&&Object.values(Object.getOwnPropertyDescriptors(o)).every(d=>Object.hasOwn(d,'value'));}
function checkedPlan(plan){
  if(!plain(plan)||Object.keys(plan).sort().join('|')!==['signature','messageSha256','transfer','maxFeeLamports'].sort().join('|')||!plain(plan.transfer))throw Error('BAD_PLAN');
  const copy={};for(const [k,v] of Object.entries(plan.transfer)){if(typeof v!=='string'&&typeof v!=='number')throw Error('BAD_PLAN');copy[k]=v;}
  return Object.freeze({signature:plan.signature,messageSha256:plan.messageSha256,maxFeeLamports:plan.maxFeeLamports,transfer:Object.freeze(copy)});
}
async function oneRpc(endpoint,method,params,fetchFn){
  const controller=new AbortController();
  const abort=setTimeout(()=>controller.abort(),REQ_TIMEOUT_MS);
  try{
    const result=await fetchFn(endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal,redirect:'error'});
    if(result?.ok!==true||!result.headers?.get('content-type')?.toLowerCase().includes('application/json'))throw Error('RPC_UNAVAILABLE');
    const raw=await result.text();
    if(typeof raw!=='string'||raw.length>250_000)throw Error('RPC_RESPONSE_LIMIT');
    const parsed=JSON.parse(raw);
    if(!plain(parsed)||parsed.id!==1||parsed.jsonrpc!=='2.0'||parsed.error!==undefined)throw Error('RPC_BAD_RESPONSE');
    return parsed;
  }finally{clearTimeout(abort);}
}
/** One read per method/endpoint. Never retries. No endpoints may be passed by caller.
 * Return REVIEW_REQUIRED on error, not 'FAILED' and never 'RETRY'.
 */
export async function checkRecordedFinalizedReceipt(recordedPlan,{fetchFn=fetch}={}){
  try{
    if(typeof fetchFn!=='function')throw Error('RPC_UNAVAILABLE');
    // Copy immutable approved values before FIRST await; never read mutable plan later.
    const plan=checkedPlan(recordedPlan);
    const reads=await Promise.all(ENDPOINTS.map(async endpoint=>{
      const [statusResponse,transactionResponse]=await Promise.all([
        oneRpc(endpoint.url,'getSignatureStatuses',[[plan.signature],{searchTransactionHistory:true}],fetchFn),
        oneRpc(endpoint.url,'getTransaction',[plan.signature,{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0}],fetchFn)
      ]);
      return {providerId:endpoint.id,statusResponse,transactionResponse};
    }));
    return reconcileFinalizedEvidence(plan,reads[0],reads[1]);
  } catch {
    return Object.freeze({state:'REVIEW_REQUIRED',reason:'UNVERIFIED_OR_UNAVAILABLE',action:'NO_AUTOMATIC_RETRY_OR_BROADCAST'});
  }
}
