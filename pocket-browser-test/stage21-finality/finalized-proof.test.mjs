import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { reconcileFinalizedEvidence } from './finalized-proof.mjs';
import {keyToBase58, MEKU_MINT, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM} from '../stage20-message-review/review-message.mjs';

const b58 = bytes => { let n=0n;for(const b of bytes)n=(n<<8n)|BigInt(b);const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let s='';while(n){s=a[Number(n%58n)]+s;n/=58n;}let z=0;while(z<bytes.length&&bytes[z]===0)z++;return '1'.repeat(z)+s;};
const pk = n => keyToBase58(Buffer.alloc(32,n));
const u64 = n => {const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const h = b => createHash('sha256').update(b).digest('hex');
function fixture(asset='SOL'){
  const kp=generateKeyPairSync('ed25519');
  const owner=keyToBase58(kp.publicKey.export({format:'der',type:'spki'}).subarray(-32));
  let transfer,keys,header,data,ix,program;
  if(asset==='SOL'){
    const recipient=pk(7);
    transfer={asset,network:'mainnet-beta',owner,recipient,baseUnits:'1500000'};
    keys=[owner,recipient,SYSTEM_PROGRAM];header=[1,0,1];program=2;
    data=Buffer.concat([Buffer.from([2,0,0,0]),u64(1500000)]); ix=[0,1];
  } else {
    const sourceTokenAccount=pk(8), destinationTokenAccount=pk(9),recipientWallet=pk(10);
    transfer={asset:'MEKU SI',network:'mainnet-beta',owner,recipientWallet,sourceTokenAccount,destinationTokenAccount,mint:MEKU_MINT,decimals:6,baseUnits:'1234567'};
    keys=[owner,sourceTokenAccount,destinationTokenAccount,MEKU_MINT,TOKEN_2022_PROGRAM];header=[1,0,2];program=4;
    data=Buffer.concat([Buffer.from([12]),u64(1234567),Buffer.from([6])]);ix=[1,3,2,0];
  }
  // Base58 to bytes for 32-byte fixed keys (test helper, not a production signer).
  function from58(s){const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of s)n=n*58n+BigInt(chars.indexOf(c));const tail=[];while(n){tail.push(Number(n&255n));n>>=8n;}let z=0;while(z<s.length&&s[z]==='1')z++;return Buffer.from([...Array(z).fill(0),...tail.reverse()]);}
  const msg=Buffer.concat([Buffer.from([...header,keys.length]),...keys.map(from58),Buffer.alloc(32,22),Buffer.from([1,program,ix.length,...ix,data.length]),data]);
  const signature=sign(null,msg,kp.privateKey);
  const wire=Buffer.concat([Buffer.from([1]),signature,msg]);
  const plan={signature:b58(signature),messageSha256:h(msg),transfer,maxFeeLamports:8000};
  const evidence=(providerId,slot=424242,fee=5000)=>({providerId,statusResponse:{jsonrpc:'2.0',result:{context:{slot:slot+1},value:[{slot,confirmationStatus:'finalized',confirmations:null,err:null,status:{Ok:null}}]}},transactionResponse:{jsonrpc:'2.0',result:{slot,version:'legacy',meta:{err:null,fee,innerInstructions:[]},transaction:[wire.toString('base64'),'base64']}}});
  return {plan,evidence,msg,wire,signature};
}
const clone = x => structuredClone(x);
const check = (p,a,b) => reconcileFinalizedEvidence(p,a,b);
const pass = (asset='SOL')=>{const f=fixture(asset);const result=check(f.plan,f.evidence('rpc-A'),f.evidence('rpc-B'));assert.equal(result.state,'EXACT_FINALIZED_RECEIPT_MATCH_TEST_ONLY',JSON.stringify(result)); assert.equal(result.transferAmount,asset==='SOL'?'0.0015':'1.234567');assert.equal(result.delivery,'NOT_VERIFIED');return f;};
function refuses(name,modify,expected='REVIEW_REQUIRED',asset='SOL') {test(name,()=>{const f=fixture(asset),a=f.evidence('rpc-A'),b=f.evidence('rpc-B'),p=clone(f.plan);modify(p,a,b,f);const r=check(p,a,b);assert.equal(r.state,expected,JSON.stringify(r));assert.equal(r.action,'NO_AUTOMATIC_RETRY_OR_BROADCAST');});}

test('independent matching finalized SOL receipt and verified signed bytes',()=>pass('SOL'));
test('independent matching Token-2022 TransferChecked receipt, no promise of delivery',()=>pass('MEKU SI'));
refuses('unknown RPC receipt => review required',(p,a,b)=>{b.transactionResponse.result=null;});
refuses('status not finalized => review required',(p,a)=>{a.statusResponse.result.value[0].confirmationStatus='confirmed';});
refuses('status err => review required',(p,a)=>{a.statusResponse.result.value[0].err={InstructionError:[0,'InvalidArgument']};});
refuses('receipt execution error => review required',(p,a)=>{a.transactionResponse.result.meta.err={InstructionError:[0,'InvalidArgument']};});
refuses('RPC explicit error => review required',(p,a)=>{a.transactionResponse.error={code:-32000,message:'unavailable'};});
refuses('duplicate provider label => review required',(p,a,b)=>{b.providerId='rpc-A';});
refuses('faked provider label characters => review required',(p,a)=>{a.providerId='https://user:pass@provider.example';});
refuses('one provider reports different slot => review required',(p,a,b)=>{b.transactionResponse.result.slot++;b.statusResponse.result.value[0].slot++;b.statusResponse.result.context.slot++;});
refuses('status and receipt disagree on slot => review required',(p,a)=>{a.statusResponse.result.value[0].slot++;});
refuses('one provider reports different fee => review required',(p,a,b)=>{b.transactionResponse.result.meta.fee=6000;});
refuses('fee above approved cap => review required',(p,a)=>{a.transactionResponse.result.meta.fee=9000;});
refuses('negative fee => review required',(p,a)=>{a.transactionResponse.result.meta.fee=-1;});
refuses('extra inner instructions => review required',(p,a)=>{a.transactionResponse.result.meta.innerInstructions=[{}];});
refuses('wrong transaction version => review required',(p,a)=>{a.transactionResponse.result.version=0;});
refuses('wrong encoding => review required',(p,a)=>{a.transactionResponse.result.transaction[1]='json';});
refuses('base64 not canonical => review required',(p,a)=>{a.transactionResponse.result.transaction[0]+='=';});
refuses('missing signature byte => review required',(p,a)=>{let w=Buffer.from(a.transactionResponse.result.transaction[0],'base64');w[10]^=1;a.transactionResponse.result.transaction[0]=w.toString('base64');});
refuses('modified message => review required',(p,a)=>{let w=Buffer.from(a.transactionResponse.result.transaction[0],'base64');w[w.length-1]^=1;a.transactionResponse.result.transaction[0]=w.toString('base64');});
refuses('modified expected message digest => review required',(p)=>{p.messageSha256='0'.repeat(64);});
refuses('modified expected amount => review required',(p)=>{p.transfer.baseUnits='1500001';});
refuses('modified expected recipient => review required',(p)=>{p.transfer.recipient=pk(42);});
test('Token-2022 receipt does not establish wallet beneficiary identity',()=>{const f=fixture('MEKU SI');f.plan.transfer.recipientWallet=pk(42);const r=check(f.plan,f.evidence('rpc-A'),f.evidence('rpc-B'));assert.equal(r.state,'EXACT_FINALIZED_RECEIPT_MATCH_TEST_ONLY');assert.equal(r.delivery,'NOT_VERIFIED');});
refuses('modified expected source token account => review required',(p)=>{p.transfer.sourceTokenAccount=pk(42);},'REVIEW_REQUIRED','MEKU SI');
refuses('noncanonical signature => review required',(p)=>{p.signature+='1';});
refuses('no prior recorded signature => review required',(p)=>{p.signature=null;});
refuses('fake amount-only object => review required',(p)=>{p.transfer.approvedByAgent=true;});
refuses('plan attacker wants unapproved fee => review required',(p)=>{p.maxFeeLamports=-1;});
refuses('wrong signature status object => review required',(p,a)=>{a.statusResponse.result.value[0].status={Err:'failure'};});
refuses('status context older than receipt => review required',(p,a)=>{a.statusResponse.result.context.slot=10;});
refuses('transaction count not one => review required',(p,a)=>{let w=Buffer.from(a.transactionResponse.result.transaction[0],'base64');w[0]=2;a.transactionResponse.result.transaction[0]=w.toString('base64');});
refuses('trailing transaction junk => review required',(p,a)=>{let w=Buffer.from(a.transactionResponse.result.transaction[0],'base64');a.transactionResponse.result.transaction[0]=Buffer.concat([w,Buffer.from([7])]).toString('base64');});
test('missing second evidence is refused',()=>{const f=fixture();assert.equal(check(f.plan,f.evidence('rpc-A'),undefined).state,'REVIEW_REQUIRED');});
test('receipt mismatch never silently retries',()=>{const f=fixture();const a=f.evidence('rpc-A');a.transactionResponse.result=null;const out=check(f.plan,a,f.evidence('rpc-B'));assert.deepEqual(Object.keys(out).sort(),['action','reason','state']);assert.equal(out.action,'NO_AUTOMATIC_RETRY_OR_BROADCAST');});
test('explicit refusal for getters in expected plan',()=>{const f=fixture();const plan={...f.plan};Object.defineProperty(plan,'messageSha256',{enumerable:true,get(){throw Error('side effect');}});assert.equal(check(plan,f.evidence('rpc-A'),f.evidence('rpc-B')).state,'REVIEW_REQUIRED');});
test('snapshot input is not modified by proof checker',()=>{const f=fixture();const a=f.evidence('rpc-A'),b=f.evidence('rpc-B');const saved=clone(a);check(f.plan,a,b);assert.deepEqual(a,saved);});

// Browser never calls the RPC directly for wallet authority; this mocked server-side
// transport checks endpoint/method allowlisting and failure behavior. No live RPC.
const { checkRecordedFinalizedReceipt } = await import('./read-only-rpc.mjs');
function mockRpc(f,{tamper,failHttp=false,mutate}={}) {
  const seen=[];let calls=0;
  const fetchFn=async (endpoint,opts)=>{
    seen.push({endpoint,opts});calls++;
    assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
    assert.ok(['https://api.mainnet-beta.solana.com','https://solana-rpc.publicnode.com'].includes(endpoint));
    const req=JSON.parse(opts.body);
    assert.equal(req.id,1);assert.equal(req.jsonrpc,'2.0');
    assert.deepEqual(req.params[0],req.method==='getSignatureStatuses'?[f.plan.signature]:f.plan.signature);
    assert.ok(['getSignatureStatuses','getTransaction'].includes(req.method));
    if(req.method==='getSignatureStatuses')assert.deepEqual(req.params[1],{searchTransactionHistory:true});
    if(req.method==='getTransaction')assert.deepEqual(req.params[1],{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0});
    if(mutate && calls===1)mutate();
    const snapshot=f.evidence(endpoint.includes('publicnode')?'provider-B':'provider-A');
    const ans=structuredClone(req.method==='getTransaction'?snapshot.transactionResponse:snapshot.statusResponse);
    ans.id=1;
    if(tamper)tamper(ans,req,endpoint);
    return {ok:!failHttp,headers:{get:(name)=>name==='content-type'?'application/json':'none'},text:async()=>JSON.stringify(ans)};
  };
  return {fetchFn,seen};
}
test('two public RPC read-only queries ask finalized transaction and history once each',async()=>{
  const f=fixture();const mock=mockRpc(f);const result=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:mock.fetchFn});
  assert.equal(result.state,'EXACT_FINALIZED_RECEIPT_MATCH_TEST_ONLY',JSON.stringify(result));
  assert.equal(mock.seen.length,4);
  assert.deepEqual(mock.seen.map(x=>JSON.parse(x.opts.body).method).sort(),['getSignatureStatuses','getSignatureStatuses','getTransaction','getTransaction']);
});
test('unavailable RPC never results in automatic resend',async()=>{
  const f=fixture();const mock=mockRpc(f,{failHttp:true});const r=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:mock.fetchFn});
  assert.equal(r.state,'REVIEW_REQUIRED'); assert.equal(r.action,'NO_AUTOMATIC_RETRY_OR_BROADCAST');
});
test('RPC exception and missing endpoint yield REVIEW_REQUIRED',async()=>{
  const f=fixture();const r=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:async()=>{throw Error('network issue');}});
  assert.equal(r.state,'REVIEW_REQUIRED');
});
test('mutation of caller plan during await cannot change approved amount',async()=>{
  const f=fixture();const mock=mockRpc(f,{mutate:()=>{f.plan.transfer.baseUnits='1500001';}});
  // The fixture plan is mutable but transport must snapshot before its first await.
  const r=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:mock.fetchFn});
  assert.equal(r.state,'EXACT_FINALIZED_RECEIPT_MATCH_TEST_ONLY',JSON.stringify(r));
});
test('RPC returns receipt for other signature => review required',async()=>{
  const f=fixture();const mock=mockRpc(f,{tamper:(answer,req)=>{
    if(req.method==='getTransaction'){const v=Buffer.from(answer.result.transaction[0],'base64');v[20]^=1;answer.result.transaction[0]=v.toString('base64');}
  }});
  const r=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:mock.fetchFn});assert.equal(r.state,'REVIEW_REQUIRED');
});
test('status response with wrong id is refused',async()=>{
  const f=fixture();const mock=mockRpc(f,{tamper:answer=>{answer.id=3;}});
  const r=await checkRecordedFinalizedReceipt(f.plan,{fetchFn:mock.fetchFn});assert.equal(r.state,'REVIEW_REQUIRED');
});
