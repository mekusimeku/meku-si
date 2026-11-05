/** Disposable real-browser tests: NEVER run against any live wallet DB. */
import {createLocalVault} from './vault-core.mjs';
import {openIndexedDbVaultStore} from './idb-store.mjs';
const A='HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const SCOPE='browser_local_test_01';
const KA=`${SCOPE}|${A}`;
const P='stage19-public-test-password-only';
const NEW='stage19-different-test-password';
const output=document.getElementById('output');
const name='pocket-stage19-disposable-'+Array.from(crypto.getRandomValues(new Uint8Array(8)), b=>b.toString(16).padStart(2,'0')).join('');
const entropy=crypto.getRandomValues(new Uint8Array(16));
let count=0;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(ok,msg)=>{if(!ok)throw Error('FAIL: '+msg);count++;};
const closeAll=[];
function store(dbName=name){const v=openIndexedDbVaultStore({dbName});closeAll.push(v);return v;}
function eraseDB(dbName){return new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=()=>resolve();r.onerror=()=>reject(Error('delete failed'));r.onblocked=()=>reject(Error('delete blocked'))});}
try {
  const s1=store(), v1=createLocalVault({storage:s1,ownerScope:SCOPE});
  await v1.create(A,entropy,P);
  const rec=await s1.get(KA);
  check(rec.version===1 && rec.encrypted.length===64 && !JSON.stringify(rec).includes(P),'record contains encrypted bits, no public test password');
  s1.close(); // reboot the adapter: no in-memory cache of secret
  const s2=store(),v2=createLocalVault({storage:s2,ownerScope:SCOPE});
  await v2.unlock(A,P);
  check(v2.isUnlocked(A),'unlock from new IndexedDB connection');
  check(eq(await v2.withEntropy(A,bytes=>Array.from(bytes)),Array.from(entropy)),'exact entropy restored in second connection');
  const s3=store(),v3=createLocalVault({storage:s3,ownerScope:SCOPE});
  await v3.rotatePassword(A,P,NEW);
  check((await s3.get(KA)).revision===2 && (await s3.get(KA)).encrypted!==rec.encrypted,'atomic password rotation changed revision and bytes');
  try { await v2.withEntropy(A,()=>true);throw Error('stale session remained open');} catch(e){check(e.code==='STALE_SESSION','old session refused after cross-connection rotation')}
  try {await v3.unlock(A,P);throw Error('old password worked')}catch(e){check(e.code==='LOCKED_OR_CORRUPT','old password refused after rotation')}
  await v3.unlock(A,NEW);
  check(eq(await v3.withEntropy(A,bytes=>Array.from(bytes)),Array.from(entropy)),'new password restores exact entropy');
  await v3.erase(A,NEW);
  check(await s3.get(KA)===null,'password-gated erase deleted the record');
  const raceName=name+'-race';const sc=store(raceName);await sc.putNew(A,{revision:1,anything:'public-test-only'});
  const raceStores=Array.from({length:12},()=>store(raceName));
  const claims=await Promise.all(raceStores.map((s)=>s.replace(A,1,{revision:2,anything:'public-test-only'})));
  check(claims.filter(Boolean).length===1 && claims.filter(x=>!x).length===11,'12 independent IndexedDB connections: 1 revision claim, 11 refused');
  output.dataset.status='pass';output.textContent=`PASS: ${count}/${count} real Chromium IndexedDB/WebCrypto checks. Disposable data removed.`;
} catch(err) {output.dataset.status='fail';output.textContent=String(err?.stack??err);}
finally {entropy.fill(0);closeAll.forEach(x=>x.close());for(const target of [name,name+'-race']){try{await eraseDB(target)}catch(e){output.dataset.status='fail';output.textContent+='\nCleanup failed: '+String(e)}}}
window.__pocketStage19={status:output.dataset.status,tests:count,message:output.textContent};
