/**
 * MEKU Pocket Stage 20 — strict read-only Solana LEGACY message gate, TEST ONLY.
 * Rejects any unrecognized transaction shape. NEVER signs, approves, or sends.
 * This checks a byte-for-byte unsigned message, NOT wallet login, actual on-chain
 * token-account ownership, recent blockhash, current fees, or finality.
 */
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const MEKU_MINT = 'J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const U64MAX = (1n << 64n) - 1n;
export class ReviewDenied extends Error {
  constructor(code) { super(code); this.name = 'ReviewDenied'; this.code = code; }
}
const deny = code => { throw new ReviewDenied(code); };
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o) && [null, Object.prototype].includes(Object.getPrototypeOf(o)) && Object.values(Object.getOwnPropertyDescriptors(o)).every(d => Object.hasOwn(d, 'value'));
function requireKeys(o, keys) {
  if (!plain(o) || Object.keys(o).sort().join('|') !== [...keys].sort().join('|')) deny('UNSUPPORTED_EXPECTATION');
}
function keyBytes(address) {
  if (typeof address !== 'string' || !address.length || address.length > 44) deny('BAD_PUBLIC_KEY');
  let n = 0n;
  for (const c of address) {
    const i = ALPHABET.indexOf(c);
    if (i === -1) deny('BAD_PUBLIC_KEY');
    n = n * 58n + BigInt(i);
  }
  const rev = [];
  while (n > 0n) { rev.push(Number(n & 255n)); n >>= 8n; }
  let z = 0;
  while (z < address.length && address[z] === '1') z++;
  if (z + rev.length !== 32) deny('BAD_PUBLIC_KEY');
  return Uint8Array.from([...Array(z).fill(0), ...rev.reverse()]);
}
export function keyToBase58(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) deny('BAD_PUBLIC_KEY');
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  let z = 0;
  while (z < bytes.length && bytes[z] === 0) z++;
  return '1'.repeat(z) + s;
}
function validateAddress(addr) {
  if (keyToBase58(keyBytes(addr)) !== addr) deny('NONCANONICAL_ADDRESS');
}
function units(s) {
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(s)) deny('BAD_EXPECTED_AMOUNT');
  const n = BigInt(s);
  if (n <= 0n || n > U64MAX) deny('BAD_EXPECTED_AMOUNT');
  return n;
}
class Reader {
  constructor(b) { this.b=b;this.i=0; }
  take(n) { if (!Number.isSafeInteger(n) || n < 0 || this.i+n>this.b.length) deny('TRUNCATED_MESSAGE'); const v=this.b.subarray(this.i,this.i+n);this.i+=n;return v; }
  u8() { return this.take(1)[0]; }
  short() {
    let n=0,shift=0,used=0,byte;
    do { if (++used > 3) deny('BAD_LENGTH');byte=this.u8();n += (byte & 127)*2**shift;shift+=7; } while(byte & 128);
    if (n > 255 || used !== (n < 128 ? 1 : n < 16384 ? 2 : 3)) deny('BAD_LENGTH');
    return n;
  }
  u64() { const b=this.take(8);let n=0n;for(let i=7;i>=0;i--)n=(n<<8n)|BigInt(b[i]);return n; }
  end() { if(this.i !== this.b.length)deny('TRAILING_BYTES'); }
}
function equalBytes(a,b) { return a.length===b.length && a.every((v,i)=>v===b[i]); }
function format(units, decimals) {
  const base=10n**BigInt(decimals), whole=(units/base).toString(), frac=(units%base).toString().padStart(decimals,'0').replace(/0+$/,'');
  return frac ? `${whole}.${frac}` : whole;
}
function expectedConfig(e) {
  if (!plain(e)) deny('UNSUPPORTED_EXPECTATION');
  if (e.asset === 'SOL') {
    requireKeys(e,['asset','network','owner','recipient','baseUnits']);
    if(e.network!=='mainnet-beta')deny('WRONG_NETWORK');
    for(const k of ['owner','recipient'])validateAddress(e[k]);
    if(e.owner===e.recipient || e.recipient===SYSTEM_PROGRAM)deny('BAD_RECIPIENT');
    return { asset:e.asset, expectedKeys:[e.owner,e.recipient,SYSTEM_PROGRAM], amount:units(e.baseUnits), decimals:9, recipient:e.recipient };
  }
  if(e.asset==='MEKU SI') {
    requireKeys(e,['asset','network','owner','recipientWallet','sourceTokenAccount','destinationTokenAccount','mint','decimals','baseUnits']);
    if(e.network!=='mainnet-beta')deny('WRONG_NETWORK');
    if(e.mint!==MEKU_MINT || e.decimals!==6)deny('WRONG_MINT');
    for(const k of ['owner','recipientWallet','sourceTokenAccount','destinationTokenAccount','mint'])validateAddress(e[k]);
    if(e.owner===e.recipientWallet || e.sourceTokenAccount===e.destinationTokenAccount || [e.owner,e.recipientWallet].includes(e.destinationTokenAccount))deny('BAD_RECIPIENT');
    const keys=[e.owner,e.sourceTokenAccount,e.destinationTokenAccount,e.mint,TOKEN_2022_PROGRAM];
    if(new Set(keys).size!==5)deny('BAD_ACCOUNTS');
    return {asset:e.asset,expectedKeys:keys,amount:units(e.baseUnits),decimals:6,recipient:e.recipientWallet};
  }
  deny('UNSUPPORTED_ASSET');
}
/** Strict message parser: 1 signer = fee payer = owner; 1 exact transfer, no ALT, CPI,
 * memos, compute-budget instructions, multisig, delegates, extra accounts or trailing bytes.
 * The message MAY contain unsafe extra data; all extras fail rather than being ignored.
 */
export function inspectLegacyMessage(rawMessage, expectation) {
  if (!(rawMessage instanceof Uint8Array) || rawMessage.length < 100 || rawMessage.length > 1232) deny('INVALID_MESSAGE_BYTES');
  const b=Uint8Array.from(rawMessage); // freeze out caller mutation
  const cfg=expectedConfig(expectation), r=new Reader(b);
  const signers=r.u8();
  if ((signers & 128)!==0) deny('UNSUPPORTED_MESSAGE_VERSION');
  const readonlySigned=r.u8(), readonlyUnsigned=r.u8();
  if(signers!==1 || readonlySigned!==0)deny('UNEXPECTED_SIGNERS');
  const n=r.short();
  if(n!==cfg.expectedKeys.length || readonlyUnsigned!==(cfg.asset==='SOL'?1:2))deny('UNEXPECTED_ACCOUNT_HEADER');
  const keys=Array.from({length:n},()=>keyToBase58(r.take(32)));
  if (new Set(keys).size!==n || !keys.every((k,i)=>k===cfg.expectedKeys[i])) deny('UNEXPECTED_ACCOUNT_KEYS');
  const blockhash=r.take(32);
  if (blockhash.every(v=>v===0))deny('INVALID_BLOCKHASH');
  const instructionCount=r.short();
  if(instructionCount!==1)deny('UNEXPECTED_INSTRUCTIONS');
  const program=r.u8(), accountCount=r.short();
  const ixAccounts=Array.from(r.take(accountCount));
  const dataLen=r.short(), data=r.take(dataLen);
  r.end();
  const amountReader=new Reader(data);
  let actual;
  if(cfg.asset==='SOL') {
    if(program!==2 || accountCount!==2 || ixAccounts[0]!==0 || ixAccounts[1]!==1 || dataLen!==12)deny('UNSAFE_INSTRUCTION');
    if(!equalBytes(amountReader.take(4),Uint8Array.of(2,0,0,0)))deny('UNSAFE_INSTRUCTION');
    actual=amountReader.u64();
  }else {
    if(program!==4 || accountCount!==4 || !equalBytes(Uint8Array.from(ixAccounts),Uint8Array.of(1,3,2,0)) || dataLen!==10)deny('UNSAFE_INSTRUCTION');
    if(amountReader.u8()!==12)deny('UNSAFE_INSTRUCTION');
    actual=amountReader.u64();
    if(amountReader.u8()!==6)deny('UNSAFE_INSTRUCTION');
  }
  amountReader.end();
  if(actual!==cfg.amount)deny('AMOUNT_MISMATCH');
  return Object.freeze({
    asset:cfg.asset,requestedNetwork:'mainnet-beta',networkProof:'NOT_VERIFIED_IN_MESSAGE',owner:keys[0],
    recipient:cfg.asset==='SOL'?cfg.recipient:null,claimedRecipientWallet:cfg.asset==='MEKU SI'?cfg.recipient:null,
    sourceTokenAccount:cfg.asset==='MEKU SI'?keys[1]:null,destinationTokenAccount:cfg.asset==='MEKU SI'?keys[2]:null,
    tokenAccountProof:cfg.asset==='MEKU SI'?'NOT_VERIFIED':null,
    amount:format(actual,cfg.decimals),baseUnits:actual.toString(),decimals:cfg.decimals,
    blockhash:keyToBase58(blockhash),programId:keys[program],instructionCount:1,
    status:'REVIEW_ONLY_NO_SIGNING',
    requires: Object.freeze(cfg.asset==='SOL' ? ['trusted-live-blockhash','recipient-account-proof','fee-estimate','owner-and-device-approval','verified-wallet-signer','server-journal','independent-security-review'] : ['finalized-source-token-account-owner-proof','finalized-destination-token-account-wallet-proof','mint-extension-review','trusted-live-blockhash','fee-estimate','owner-and-device-approval','verified-wallet-signer','server-journal','independent-security-review']),
  });
}
/** Returns SHA256 of exactly the inspected raw unsigned message for future approval display binding.
 * This digest is NOT an approval, signature, or chain transaction ID.
 */
export async function reviewUnsignedMessage(rawMessage, expectation, subtle=globalThis.crypto?.subtle) {
  if (!(rawMessage instanceof Uint8Array))deny('INVALID_MESSAGE_BYTES');
  const copy=Uint8Array.from(rawMessage);
  const details=inspectLegacyMessage(copy,expectation);
  if (!subtle || typeof subtle.digest!=='function')deny('CRYPTO_UNAVAILABLE');
  const digest=new Uint8Array(await subtle.digest('SHA-256',copy));
  return Object.freeze({...details,messageSha256:[...digest].map(b=>b.toString(16).padStart(2,'0')).join('')});
}
