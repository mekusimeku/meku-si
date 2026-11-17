import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { inspectLegacyMessage, reviewUnsignedMessage, keyToBase58, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, MEKU_MINT } from './review-message.mjs';

const owner=keyToBase58(Uint8Array.from({length:32},(_,i)=>i+1));
const recipient=keyToBase58(Uint8Array.from({length:32},(_,i)=>i+34));
const source=keyToBase58(Uint8Array.from({length:32},(_,i)=>i+67));
const dest=keyToBase58(Uint8Array.from({length:32},(_,i)=>i+100));
const other=keyToBase58(Uint8Array.from({length:32},(_,i)=>i+133));
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bytes(addr) {
  let x=0n;for(const c of addr)x=x*58n+BigInt(alphabet.indexOf(c));
  const b=[];while(x){b.unshift(Number(x&255n));x>>=8n;}
  let z=0;while(addr[z]==='1')z++;
  return Uint8Array.from([...Array(z).fill(0),...b]);
}
function u64(n) { const b=[];for(let i=0;i<8;i++){b.push(Number(n&255n));n>>=8n;}return b; }
const block=Uint8Array.from({length:32},(_,i)=>i+10);
function pack({keys,ix,program,header=[1,0,1],data,hash=block,instructionCount=1}){
  return Uint8Array.from([...header,keys.length,...keys.flatMap(k=>[...bytes(k)]),...hash,instructionCount,program,ix.length,...ix,data.length,...data]);
}
const solExpected=()=>({asset:'SOL',network:'mainnet-beta',owner,recipient,baseUnits:'123456789'});
const tokExpected=()=>({asset:'MEKU SI',network:'mainnet-beta',owner,recipientWallet:recipient,sourceTokenAccount:source,destinationTokenAccount:dest,mint:MEKU_MINT,decimals:6,baseUnits:'987654321'});
const sol=()=>pack({keys:[owner,recipient,SYSTEM_PROGRAM],program:2,ix:[0,1],data:[2,0,0,0,...u64(123456789n)]});
const token=()=>pack({keys:[owner,source,dest,MEKU_MINT,TOKEN_2022_PROGRAM],program:4,ix:[1,3,2,0],header:[1,0,2],data:[12,...u64(987654321n),6]});
const denied=(f,code)=>assert.throws(f,e=>e?.name==='ReviewDenied' && (!code || e.code===code));

test('correct SOL raw legacy message decoded into read-only review',()=>{
  const p=inspectLegacyMessage(sol(),solExpected());
  assert.equal(p.amount,'0.123456789');assert.equal(p.recipient,recipient);assert.equal(p.networkProof,'NOT_VERIFIED_IN_MESSAGE');assert.equal(p.status,'REVIEW_ONLY_NO_SIGNING');
  assert.equal(p.programId,SYSTEM_PROGRAM);assert.equal(p.instructionCount,1);assert.ok(Object.isFrozen(p));
  assert.ok(p.requires.includes('independent-security-review'));assert.ok(!('approve' in p));
});
test('correct Token-2022 TransferChecked returns proof-required, not approval',()=>{
  const p=inspectLegacyMessage(token(),tokExpected());
  assert.equal(p.amount,'987.654321');assert.equal(p.programId,TOKEN_2022_PROGRAM);
  assert.ok(p.requires.includes('finalized-destination-token-account-wallet-proof'));
  assert.equal(p.recipient,null);assert.equal(p.claimedRecipientWallet,recipient);assert.equal(p.destinationTokenAccount,dest);assert.equal(p.tokenAccountProof,'NOT_VERIFIED');assert.equal(p.status,'REVIEW_ONLY_NO_SIGNING');
});
test('SHA256 is digest of original message bytes; not transaction signature',async()=>{
  const m=sol();const x=await reviewUnsignedMessage(m,solExpected(),webcrypto.subtle);
  assert.equal(x.messageSha256,createHash('sha256').update(m).digest('hex'));
  assert.equal(x.messageSha256.length,64);assert.ok(!('sign' in x));
});
test('unsigned message is copied before deferred digest, caller mutation cannot alter inspected digest',async()=>{
  const m=sol(),old=Uint8Array.from(m);
  const delayed={digest:async(_algo,copy)=>{m.fill(0);return webcrypto.subtle.digest('SHA-256',copy)}};
  const result=await reviewUnsignedMessage(m,solExpected(),delayed);
  assert.equal(result.messageSha256,createHash('sha256').update(old).digest('hex'));
});
test('refuse crypto-unavailable',async()=>{await assert.rejects(reviewUnsignedMessage(sol(),solExpected(),null),{code:'CRYPTO_UNAVAILABLE'});});
test('refuse public key with wrong byte length',()=>denied(()=>keyToBase58(Uint8Array.of(1,2)), 'BAD_PUBLIC_KEY'));
test('refuse unexpected expected fields including fake authorization flag',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),approved:true}),'UNSUPPORTED_EXPECTATION'));
test('refuse expectation getter before access',()=>{let called=false;const x=solExpected();Object.defineProperty(x,'owner',{get(){called=true;return owner},enumerable:true});denied(()=>inspectLegacyMessage(sol(),x),'UNSUPPORTED_EXPECTATION');assert.equal(called,false)});
test('refuse unknown assets',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),asset:'USDC'}),'UNSUPPORTED_ASSET'));
test('refuse wrong chain expectation',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),network:'devnet'}),'WRONG_NETWORK'));
test('refuse malformed address',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),owner:'o0O'}),'BAD_PUBLIC_KEY'));
test('refuse self transfer',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),recipient:owner}),'BAD_RECIPIENT'));
test('refuse SOL expectation that names system program as recipient',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),recipient:SYSTEM_PROGRAM}),'BAD_RECIPIENT'));
test('refuse fractional or too-big baseUnits',()=>{for(const units of ['1.2','-1','0','18446744073709551616','1e3']) denied(()=>inspectLegacyMessage(sol(),{...solExpected(),baseUnits:units}),'BAD_EXPECTED_AMOUNT');});
test('refuse amount change of one lamport',()=>{const m=sol();m[m.length-1]^=1;denied(()=>inspectLegacyMessage(m,solExpected()),'AMOUNT_MISMATCH')});
test('refuse system program assign and other instruction variants',()=>{const m=sol();m[m.length-12]=1;denied(()=>inspectLegacyMessage(m,solExpected()),'UNSAFE_INSTRUCTION')});
test('refuse wrong program index',()=>{const m=sol(),i=m.length-17;m[i]=1;denied(()=>inspectLegacyMessage(m,solExpected()),'UNSAFE_INSTRUCTION')});
test('refuse extra instruction (even with no new payload)',()=>{const m=sol();m[m.length-18]=2;denied(()=>inspectLegacyMessage(m,solExpected()),'UNEXPECTED_INSTRUCTIONS')});
test('refuse trailing bytes or truncation',()=>{denied(()=>inspectLegacyMessage(Uint8Array.from([...sol(),0]),solExpected()),'TRAILING_BYTES');denied(()=>inspectLegacyMessage(sol().slice(0,-1),solExpected()),'TRUNCATED_MESSAGE')});
test('refuse legacy header changed to v0/v1',()=>{for(const v of [0x80,0x81]){const m=sol();m[0]=v;denied(()=>inspectLegacyMessage(m,solExpected()),'UNSUPPORTED_MESSAGE_VERSION')}});
test('refuse second signer and read-only signer manipulation',()=>{for(const header of [[2,0,1],[1,1,1]])denied(()=>inspectLegacyMessage(pack({keys:[owner,recipient,SYSTEM_PROGRAM],header,program:2,ix:[0,1],data:[2,0,0,0,...u64(123456789n)]}),solExpected()),'UNEXPECTED_SIGNERS')});
test('refuse hidden writable or readonly changes',()=>{const m=sol();m[2]=0;denied(()=>inspectLegacyMessage(m,solExpected()),'UNEXPECTED_ACCOUNT_HEADER')});
test('refuse extra account',()=>denied(()=>inspectLegacyMessage(pack({keys:[owner,recipient,other,SYSTEM_PROGRAM],header:[1,0,1],program:3,ix:[0,1],data:[2,0,0,0,...u64(123456789n)]}),solExpected()),'UNEXPECTED_ACCOUNT_HEADER'));
test('refuse duplicate account keys',()=>denied(()=>inspectLegacyMessage(pack({keys:[owner,owner,SYSTEM_PROGRAM],program:2,ix:[0,1],data:[2,0,0,0,...u64(123456789n)]}),solExpected()),'UNEXPECTED_ACCOUNT_KEYS'));
test('refuse different recipient',()=>denied(()=>inspectLegacyMessage(sol(),{...solExpected(),recipient:other}),'UNEXPECTED_ACCOUNT_KEYS'));
test('refuse all-zero blockhash',()=>denied(()=>inspectLegacyMessage(pack({keys:[owner,recipient,SYSTEM_PROGRAM],program:2,ix:[0,1],hash:new Uint8Array(32),data:[2,0,0,0,...u64(123456789n)]}),solExpected()),'INVALID_BLOCKHASH'));
test('refuse token wrong mint and decimals expectation',()=>{denied(()=>inspectLegacyMessage(token(),{...tokExpected(),mint:other}),'WRONG_MINT');denied(()=>inspectLegacyMessage(token(),{...tokExpected(),decimals:9}),'WRONG_MINT')});
test('refuse Token-2022 unchecked transfer opcode',()=>{const m=token();m[m.length-10]=3;denied(()=>inspectLegacyMessage(m,tokExpected()),'UNSAFE_INSTRUCTION')});
test('refuse Token-2022 wrong decimals in data',()=>{const m=token();m[m.length-1]=9;denied(()=>inspectLegacyMessage(m,tokExpected()),'UNSAFE_INSTRUCTION')});
test('refuse Token-2022 wrong destination token account in compiled keys',()=>denied(()=>inspectLegacyMessage(token(),{...tokExpected(),destinationTokenAccount:other}),'UNEXPECTED_ACCOUNT_KEYS'));
test('refuse Token-2022 delegate as instruction authority',()=>{const m=token();m[m.length-12]=1;denied(()=>inspectLegacyMessage(m,tokExpected()),'UNSAFE_INSTRUCTION')});
test('refuse Token-2022 program swap to legacy SPL',()=>denied(()=>inspectLegacyMessage(pack({keys:[owner,source,dest,MEKU_MINT,SYSTEM_PROGRAM],program:4,ix:[1,3,2,0],header:[1,0,2],data:[12,...u64(987654321n),6]}),tokExpected()),'UNEXPECTED_ACCOUNT_KEYS'));
test('refuse Token-2022 wrong amount',()=>{const m=token();m[m.length-2]^=1;denied(()=>inspectLegacyMessage(m,tokExpected()),'AMOUNT_MISMATCH')});
test('refuse token wallet recipient equal owner or ambiguous token account',()=>{denied(()=>inspectLegacyMessage(token(),{...tokExpected(),recipientWallet:owner}),'BAD_RECIPIENT');denied(()=>inspectLegacyMessage(token(),{...tokExpected(),destinationTokenAccount:source}),'BAD_RECIPIENT')});
test('refuse extra data and unknown token account metas',()=>{const m=token();m[m.length-14]=5;denied(()=>inspectLegacyMessage(m,tokExpected()),'UNSAFE_INSTRUCTION')});
test('refuse non-canonical shortvec for account count',()=>{const m=sol();const n=Uint8Array.from([...m.slice(0,3),0x83,0x00,...m.slice(4)]);denied(()=>inspectLegacyMessage(n,solExpected()),'BAD_LENGTH')});
test('refuse empty, too large, or invalid raw message',()=>{denied(()=>inspectLegacyMessage('not bytes',solExpected()),'INVALID_MESSAGE_BYTES');denied(()=>inspectLegacyMessage(new Uint8Array(1233),solExpected()),'INVALID_MESSAGE_BYTES')});
test('claimed wallet recipient on Token-2022 is never treated as verified address',()=>{
  const x=inspectLegacyMessage(token(),{...tokExpected(),recipientWallet:other});
  assert.equal(x.recipient,null);
  assert.equal(x.claimedRecipientWallet,other);
  assert.equal(x.destinationTokenAccount,dest);
  assert.equal(x.tokenAccountProof,'NOT_VERIFIED');
});
test('format handles exact small dust amounts without floating point loss',()=>{
  const m=pack({keys:[owner,recipient,SYSTEM_PROGRAM],program:2,ix:[0,1],data:[2,0,0,0,...u64(1n)]});
  assert.equal(inspectLegacyMessage(m,{...solExpected(),baseUnits:'1'}).amount,'0.000000001');
});
test('official base58 addresses round-trip through byte parser',()=>{
  for (const a of [SYSTEM_PROGRAM,TOKEN_2022_PROGRAM,MEKU_MINT]) {
    assert.equal(keyToBase58(bytes(a)),a);
  }
});
