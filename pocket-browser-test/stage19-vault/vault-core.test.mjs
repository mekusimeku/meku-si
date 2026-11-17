import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createLocalVault,VaultFailure} from './vault-core.mjs';
const A='HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const B='11111111111111111111111111111111';
const SCOPE='account_alice_0001';
const OTHER_SCOPE='account_bob_0002';
const KA=`${SCOPE}|${A}`, KB=`${SCOPE}|${B}`;
const ENTROPY=Uint8Array.from(Array.from({length:16},(_,i)=>i+1));
const PASS='my-long-test-passphrase-not-real';
const NEW='a-different-long-test-passphrase';
const clone=x=>x===null?null:structuredClone(x);
function store() {
  const m=new Map();
  return {
    m,
    async get(k) {return clone(m.get(k)??null);},
    async putNew(k,v) {if(m.has(k)) throw new Error('ALREADY_EXISTS');m.set(k,clone(v));return true;},
    async replace(k,rev,v) {if(m.get(k)?.revision!==rev)return false;m.set(k,clone(v));return true;},
    async remove(k,rev) {if(m.get(k)?.revision!==rev)return false;m.delete(k);return true;}
  };
}
const make=(s,opts={})=>createLocalVault({storage:s,ownerScope:SCOPE,crypto:webcrypto,...opts});
async function created(){const s=store(),v=make(s);await v.create(A,ENTROPY,PASS);return{s,v};}
const code=async(fn,c)=>assert.rejects(fn,e=>e instanceof VaultFailure&&e.code===c);
test('encrypted record: only ciphertext and public binding; no plaintext entropy or password',async()=>{
  const {s}=await created();const r=s.m.get(KA);assert.equal(r.version,1);assert.equal(r.network,'mainnet-beta');assert.equal(r.iterations,600000);assert.equal(r.encrypted.length,64);assert.notEqual(r.encrypted,Buffer.from(ENTROPY).toString('hex'));assert.equal(JSON.stringify(r).includes(PASS),false);assert.equal(JSON.stringify(r).includes(Buffer.from(ENTROPY).toString('hex')),false);
});
test('correct password unlocks exact entropy via synchronous callback only; zeroizes shared result',async()=>{
  const {v}=await created();await v.unlock(A,PASS);let held;const read=await v.withEntropy(A,b=>{held=b;return Uint8Array.from(b)});assert.deepEqual(read,ENTROPY);assert.deepEqual(held,new Uint8Array(16));
});
test('wrong password is closed and does not unlock',async()=>{const {v}=await created();await code(()=>v.unlock(A,NEW),'LOCKED_OR_CORRUPT');assert.equal(v.isUnlocked(A),false);});
test('locking blocks old session; no implicit reauthentication',async()=>{const {v}=await created();await v.unlock(A,PASS);v.lock();await code(()=>v.withEntropy(A,()=>true),'LOCKED');});
test('session expires at boundary; no refresh on use',async()=>{const {s}=await created();let now=1000;const v=make(s,{clock:()=>now,sessionMs:1000});await v.unlock(A,PASS);now=2000;assert.equal(v.isUnlocked(A),false);await code(()=>v.withEntropy(A,()=>true),'LOCKED');});
test('cannot read other wallet address with session A',async()=>{const s=store(),v=make(s);await v.create(A,ENTROPY,PASS);await v.create(B,ENTROPY,NEW);await v.unlock(A,PASS);await code(()=>v.withEntropy(B,()=>true),'LOCKED');});
test('cannot swap encrypted record to another address',async()=>{const {s,v}=await created();s.m.set(KB,{...s.m.get(KA),address:B});await code(()=>v.unlock(B,PASS),'LOCKED_OR_CORRUPT');});
test('ciphertext tampering denies unlock',async()=>{const {s,v}=await created();const r=s.m.get(KA);r.encrypted=(r.encrypted[0]==='0'?'1':'0')+r.encrypted.slice(1);await code(()=>v.unlock(A,PASS),'LOCKED_OR_CORRUPT');});
test('metadata tampering denies even with otherwise valid encrypted bytes',async()=>{const {s,v}=await created();s.m.get(KA).revision=2;await code(()=>v.unlock(A,PASS),'LOCKED_OR_CORRUPT');});
test('extra fields and getter-backed records are refused before using secrets',async()=>{const {s,v}=await created();s.m.get(KA).agentApproved=true;await code(()=>v.unlock(A,PASS),'BAD_RECORD');delete s.m.get(KA).agentApproved;Object.defineProperty(s.m.get(KA),'encrypted',{get(){throw Error('do not run');}, configurable:true});const evil=make({...s,get:async()=>s.m.get(KA)});await code(()=>evil.unlock(A,PASS),'BAD_RECORD');});
test('bad entropy or short password refused before writing',async()=>{const s=store(),v=make(s);await code(()=>v.create(A,Uint8Array.from([1,2]),PASS),'INVALID_ENTROPY');await code(()=>v.create(A,ENTROPY,'too-short'),'INVALID_PASSWORD');assert.equal(s.m.size,0);});
test('create is one-shot and cannot overwrite existing wallet',async()=>{const {v}=await created();await assert.rejects(()=>v.create(A,ENTROPY,PASS),/ALREADY_EXISTS/);});
test('password rotation changes salt, nonce, ciphertext and rev, then locks',async()=>{const {s,v}=await created();const first=clone(s.m.get(KA));assert.deepEqual(await v.rotatePassword(A,PASS,NEW),{address:A,revision:2});assert.equal(v.isUnlocked(A),false);const second=s.m.get(KA);for(const k of ['salt','nonce','encrypted']) assert.notEqual(first[k],second[k]);await code(()=>v.unlock(A,PASS),'LOCKED_OR_CORRUPT');await v.unlock(A,NEW);assert.deepEqual(await v.withEntropy(A,b=>Uint8Array.from(b)),ENTROPY);});
test('bad old password does not mutate encrypted wallet',async()=>{const {s,v}=await created();const before=clone(s.m.get(KA));await code(()=>v.rotatePassword(A,NEW,PASS),'LOCKED_OR_CORRUPT');assert.deepEqual(s.m.get(KA),before);});
test('stale revision prevents concurrent password rotation replacement',async()=>{const {s,v}=await created();let changed=false;const race={...s,replace:async(k,rev,r)=>{if(!changed){s.m.get(k).revision++;changed=true;}return s.replace(k,rev,r)}};const v2=make(race);await code(()=>v2.rotatePassword(A,PASS,NEW),'STALE_WRITE');assert.equal(s.m.get(KA).revision,2);});
test('erase needs correct password and removes encrypted record',async()=>{const {s,v}=await created();await code(()=>v.erase(A,NEW),'LOCKED_OR_CORRUPT');assert.equal(s.m.has(KA),true);assert.equal(await v.erase(A,PASS),true);assert.equal(s.m.has(KA),false);await code(()=>v.unlock(A,PASS),'NO_VAULT');});
test('async callback is denied and its provided secret bytes are zeroized',async()=>{const {v}=await created();await v.unlock(A,PASS);let held;await code(()=>v.withEntropy(A,b=>{held=b;return Promise.resolve(true)}),'ASYNC_CALLBACK_DENIED');assert.deepEqual(held,new Uint8Array(16));assert.equal(v.isUnlocked(A),false);});
test('callback exceptions lock vault and zeroize its entropy view',async()=>{const {v}=await created();await v.unlock(A,PASS);let held;await code(()=>v.withEntropy(A,b=>{held=b;throw Error('boom')}),'LOCKED_OR_CORRUPT');assert.deepEqual(held,new Uint8Array(16));assert.equal(v.isUnlocked(A),false);});
test('reject unknown address and invalid storage/crypto setup',async()=>{const s=store(),v=make(s);await code(()=>v.create('bad',ENTROPY,PASS),'BAD_ADDRESS');assert.throws(()=>createLocalVault({storage:s,crypto:{}}),/CRYPTO_UNAVAILABLE/);});

test('STOP/lock during slow unlock cannot restore the closed session',async()=>{
  const {s}=await created();let release;let entered;const started=new Promise(r=>{entered=r});
  const blocked={...s,get:async k=>{entered();await new Promise(r=>{release=r});return s.get(k)}};
  const v=make(blocked);const promise=v.unlock(A,PASS);await started;v.lock();release();
  await code(()=>promise,'STALE_SESSION');assert.equal(v.isUnlocked(A),false);
});
test('two overlapping unlock requests cannot let earlier request supersede later lock state',async()=>{
  const {s}=await created();let release;let count=0;const hold={...s,get:async k=>{count++;if(count===1)await new Promise(r=>{release=r});return s.get(k)}};
  const v=make(hold);const first=v.unlock(A,PASS);while(!release)await new Promise(r=>setImmediate(r));
  const second=v.unlock(A,PASS);await second;release();await code(()=>first,'STALE_SESSION');
  assert.equal(v.isUnlocked(A),true);
});
test('tamper after unlock locks the vault and forbids reusing the old key',async()=>{
  const {s,v}=await created();await v.unlock(A,PASS);s.m.get(KA).revision=2;await code(()=>v.withEntropy(A,()=>true),'STALE_SESSION');assert.equal(v.isUnlocked(A),false);
});

test('separate local account scopes can store the same address without collision',async()=>{
  const s=store(); const alice=make(s),bob=make(s,{ownerScope:OTHER_SCOPE});
  await alice.create(A,ENTROPY,PASS);
  await code(()=>bob.unlock(A,PASS),'NO_VAULT');
  await bob.create(A,Uint8Array.from(ENTROPY,b=>255-b),NEW);
  assert.equal(s.m.size,2);
  await alice.unlock(A,PASS);
  await bob.unlock(A,NEW);
  assert.deepEqual(await alice.withEntropy(A,x=>Array.from(x)),Array.from(ENTROPY));
  assert.deepEqual(await bob.withEntropy(A,x=>Array.from(x)),Array.from(ENTROPY,b=>255-b));
});
test('copy of an encrypted record into another owner scope cannot be opened',async()=>{
  const {s}=await created(),bob=make(s,{ownerScope:OTHER_SCOPE});
  const bobKey=`${OTHER_SCOPE}|${A}`;
  s.m.set(bobKey,{...s.m.get(KA),ownerScope:OTHER_SCOPE});
  await code(()=>bob.unlock(A,PASS),'LOCKED_OR_CORRUPT');
});
test('missing or invalid account namespace fails closed',()=>{
  const s=store();
  assert.throws(()=>createLocalVault({storage:s,crypto:webcrypto}),e=>e.code==='BAD_OWNER_SCOPE');
  assert.throws(()=>createLocalVault({storage:s,crypto:webcrypto,ownerScope:'x'}),e=>e.code==='BAD_OWNER_SCOPE');
});
