/**
 * MEKU Pocket Stage 19 — browser WebCrypto local vault CANDIDATE; NOT REVIEWED FOR FUNDS.
 * No BIP39 implementation, signing, network calls, NEURA access, or transaction approval.
 * Caller must never send recovery entropy to a server or agent.
 */
const enc = new TextEncoder();
const HEX = /^[0-9a-f]+$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAGIC = 'MEKU-POCKET-LOCAL-VAULT';
const SCOPE = /^[A-Za-z0-9_-]{8,80}$/;
const ITERATIONS = 600_000;
export const VAULT_VERSION = 1;

export class VaultFailure extends Error {
  constructor(code) { super(code); this.name = 'VaultFailure'; this.code = code; }
}
function fail(code) { throw new VaultFailure(code); }
function isPlainData(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || ![Object.prototype,null].includes(Object.getPrototypeOf(obj))) return false;
  return Object.values(Object.getOwnPropertyDescriptors(obj)).every(d => Object.hasOwn(d, 'value'));
}
function exactKeys(o, keys) {
  return isPlainData(o) && Object.keys(o).sort().join('|') === [...keys].sort().join('|');
}
function validateOwnerScope(ownerScope) {
  if (typeof ownerScope !== 'string' || !SCOPE.test(ownerScope)) fail('BAD_OWNER_SCOPE');
}
function validateAddress(address) {
  if (typeof address !== 'string' || !BASE58.test(address)) fail('BAD_ADDRESS');
}
function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 14 || p.length > 256 || !p.trim()) fail('INVALID_PASSWORD');
  // This is a basic length gate, not a strength meter. Actual password strength and UX need review.
}
const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
function fromHex(hex, bytes) {
  if (typeof hex !== 'string' || hex.length !== bytes * 2 || !HEX.test(hex)) fail('BAD_RECORD');
  return Uint8Array.from(hex.match(/../g), pair => parseInt(pair,16));
}
const headerFields = ['magic','version','network','ownerScope','address','revision','iterations','salt','nonce','cipher','entropyBytes'];
const recordFields = [...headerFields,'encrypted'];
function validateRecord(record, expectedScope, expectedAddress) {
  if (!exactKeys(record, recordFields)) fail('BAD_RECORD');
  if (record.magic !== MAGIC || record.version !== VAULT_VERSION || record.network !== 'mainnet-beta' || record.ownerScope !== expectedScope || record.address !== expectedAddress || !Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision > Number.MAX_SAFE_INTEGER-1 || record.iterations !== ITERATIONS || record.cipher !== 'AES-256-GCM' || record.entropyBytes !== 16) fail('BAD_RECORD');
  fromHex(record.salt,32); fromHex(record.nonce,12);
  const encrypted = fromHex(record.encrypted,32); // 16-byte entropy + 16-byte GCM tag
  if (encrypted.length !== 32) fail('BAD_RECORD');
  return record;
}
function aad(record) {
  const { magic, version, network, ownerScope, address, revision, iterations, salt, nonce, cipher, entropyBytes } = record;
  return enc.encode(JSON.stringify({magic,version,network,ownerScope,address,revision,iterations,salt,nonce,cipher,entropyBytes}));
}
function mustCrypto(crypto) {
  if (!crypto || typeof crypto.getRandomValues !== 'function' || !crypto.subtle || typeof crypto.subtle.importKey !== 'function') fail('CRYPTO_UNAVAILABLE');
  return crypto;
}
function random(crypto, n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
async function keyFromPassword(crypto,password,salt) {
  validatePassword(password);
  const raw = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function decrypt(crypto, record, password) {
  let derived;
  try {
    derived = await keyFromPassword(crypto,password,fromHex(record.salt,32));
    const plain = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(record.nonce,12),additionalData:aad(record),tagLength:128},derived,fromHex(record.encrypted,32)));
    if (plain.length !== 16) fail('LOCKED_OR_CORRUPT');
    return {plain,derived};
  } catch { fail('LOCKED_OR_CORRUPT'); }
}
async function seal(crypto,ownerScope,address,revision,entropy,password) {
  validateOwnerScope(ownerScope);
  validateAddress(address); validatePassword(password);
  if (!(entropy instanceof Uint8Array) || entropy.length !== 16) fail('INVALID_ENTROPY');
  const salt = random(crypto,32), nonce = random(crypto,12);
  const header = {magic:MAGIC,version:VAULT_VERSION,network:'mainnet-beta',ownerScope,address,revision,iterations:ITERATIONS,salt:toHex(salt),nonce:toHex(nonce),cipher:'AES-256-GCM',entropyBytes:16};
  const key = await keyFromPassword(crypto,password,salt);
  // Native subtle.encrypt copies supplied input internally; caller retains ownership of original entropy.
  const copy = Uint8Array.from(entropy);
  try {
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(header),tagLength:128},key,copy);
    return {...header,encrypted:toHex(new Uint8Array(encrypted))};
  } finally { copy.fill(0); }
}
/** The adapter provides atomic create + compare-and-swap, never "get; put" outside a transaction. */
export function createLocalVault({storage, ownerScope, crypto=globalThis.crypto, clock=()=>globalThis.performance?.now?.() ?? Date.now(), sessionMs=120_000} = {}) {
  mustCrypto(crypto);
  validateOwnerScope(ownerScope);
  // A locally supplied scope is just a namespace. Caller must later bind it to verified account auth.
  const keyFor = address => `${ownerScope}|${address}`;
  if (!storage || !['get','putNew','replace','remove'].every(k => typeof storage[k] === 'function')) fail('BAD_STORAGE');
  if (!Number.isSafeInteger(sessionMs) || sessionMs < 1_000 || sessionMs > 300_000) fail('BAD_SESSION_TTL');
  let session = null;
  let epoch = 0;
  const lock = () => { session = null; epoch += 1; };
  async function create(address,entropy,password) {
    lock();
    const operationEpoch = epoch;
    const record = await seal(crypto,ownerScope,address,1,entropy,password);
    if (epoch !== operationEpoch) fail('STALE_SESSION');
    await storage.putNew(keyFor(address),record);
    return {address,revision:1};
  }
  async function unlock(address,password) {
    validateAddress(address); lock();
    const operationEpoch = epoch;
    const record = await storage.get(keyFor(address));
    if (!record) fail('NO_VAULT');
    validateRecord(record,ownerScope,address);
    const {plain,derived} = await decrypt(crypto,record,password);
    plain.fill(0);
    if (epoch !== operationEpoch) fail('STALE_SESSION');
    session = {address,revision:record.revision,key:derived,expiresAt:clock()+sessionMs};
    return {address,revision:record.revision};
  }
  function isUnlocked(address) {
    if (!session || clock() >= session.expiresAt || (address !== undefined && session.address !== address)) { lock(); return false; }
    return true;
  }
  async function withEntropy(address,callback) {
    if (!isUnlocked(address)) fail('LOCKED');
    if (typeof callback !== 'function') fail('BAD_CALLBACK');
    const current = session;
    let record;
    try {
      record = await storage.get(keyFor(address));
      if (!record) fail('NO_VAULT');
      validateRecord(record,ownerScope,address);
    } catch(e) { lock(); throw e; }
    if (record.revision !== current.revision || session !== current || clock() >= current.expiresAt) { lock(); fail('STALE_SESSION'); }
    let bytes;
    try {
      bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(record.nonce,12),additionalData:aad(record),tagLength:128},current.key,fromHex(record.encrypted,32)));
      if (session !== current || clock() >= current.expiresAt || bytes.length !== 16) { lock(); fail('STALE_SESSION'); }
      const result = callback(bytes);
      // Strictly synchronous callback. Never allow an async signer/agent to retain secret references.
      if (result && typeof result.then === 'function') { lock(); fail('ASYNC_CALLBACK_DENIED'); }
      return result;
    } catch(e) {
      lock();
      if (e instanceof VaultFailure) throw e;
      fail('LOCKED_OR_CORRUPT');
    } finally { bytes?.fill(0); }
  }
  async function rotatePassword(address,oldPassword,newPassword) {
    validateAddress(address); validatePassword(newPassword); lock();
    const operationEpoch = epoch;
    const record = await storage.get(keyFor(address));
    if (!record) fail('NO_VAULT');
    validateRecord(record,ownerScope,address);
    const {plain} = await decrypt(crypto,record,oldPassword);
    try {
      const updated = await seal(crypto,ownerScope,address,record.revision+1,plain,newPassword);
      if (epoch !== operationEpoch) fail('STALE_SESSION');
      const success = await storage.replace(keyFor(address),record.revision,updated);
      if (!success) fail('STALE_WRITE');
      return {address,revision:updated.revision};
    } finally { plain.fill(0); }
  }
  async function erase(address,password) {
    validateAddress(address); lock();
    const operationEpoch = epoch;
    const record = await storage.get(keyFor(address));
    if (!record) fail('NO_VAULT');
    validateRecord(record,ownerScope,address);
    const {plain} = await decrypt(crypto,record,password);
    plain.fill(0);
    if (epoch !== operationEpoch) fail('STALE_SESSION');
    if (!(await storage.remove(keyFor(address),record.revision))) fail('STALE_WRITE');
    return true;
  }
  return Object.freeze({create,unlock,isUnlocked,withEntropy,rotatePassword,erase,lock});
}
