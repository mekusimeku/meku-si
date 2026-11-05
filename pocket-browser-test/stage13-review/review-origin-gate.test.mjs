import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewOnlyGate, ReviewBoundaryError } from './review-origin-gate.mjs';
import { MEKU_MINT, TOKEN_2022_PROGRAM, createTransferIntent } from './transfer-preflight.mjs';

const ORIGIN = 'https://pocket.meku.farm';
const SOURCE = Object.freeze({ id: 'window-proxy-fixture' });
const NOW = 1793769600000;
const owner = '11111111111111111111111111111112';
const recipient = '11111111111111111111111111111113';
const mkSol = () => ({network:'mainnet-beta', asset:'SOL',requestId:'pocket-req-20261104-001',owner,recipient,amount:'0.000000001'});
const mkMeku = () => ({...mkSol(), asset:'MEKU SI', amount:'1.000001',mint:MEKU_MINT,programId:TOKEN_2022_PROGRAM,decimals:6});
const envelope = (intent=mkSol()) => ({type:'MEKU_POCKET_PREVIEW_REQUEST_V1',version:1,issuedAt:NOW,intent});
const event = (data=envelope(),origin=ORIGIN,source=SOURCE) => ({origin,source,data});
const gate = () => createPreviewOnlyGate({trustedRequestOrigin:ORIGIN,expectedSource:SOURCE,clock:()=>NOW});
const shouldFail = (fn,code) => assert.throws(fn,e=>e instanceof ReviewBoundaryError && e.code===code);

test('SOL receive path is review-only with exact integer base units, no authorization', () => {
  const g=gate(); const p=g.accept(event());
  assert.equal(p.status,'REVIEW_ONLY_NO_AUTHORITY');
  assert.equal(p.baseUnits,'1'); assert.equal(p.decimals,9); assert.equal(p.network,'mainnet-beta');
  assert.match(p.nonce,/^[0-9a-f]{32}$/);
  assert.ok(!Object.hasOwn(p,'approved') && !Object.hasOwn(p,'signature') && !Object.hasOwn(p,'sign'));
  assert.equal(g.getPreview().requestId,p.requestId);
});
test('MEKU SI strict mint/program/decimals and integer unit amount',()=>{
  const g=gate(), p=g.accept(event(envelope(mkMeku())));
  assert.equal(p.asset,'MEKU SI'); assert.equal(p.baseUnits,'1000001');
  assert.equal(p.mint,MEKU_MINT); assert.equal(p.programId,TOKEN_2022_PROGRAM);
});
test('wrong origin is denied (lookalikes, subdomains, insecure http)',()=>{
  for (const origin of ['http://pocket.meku.farm','https://pocket.meku.farm.evil.com','https://evil.pocket.meku.farm','https://pocket.meku.farm:444','null'])
    shouldFail(()=>gate().accept(event(envelope(),origin)),'UNTRUSTED_MESSAGE_SOURCE');
});
test('wrong source window is denied even with exact origin',()=>{
  shouldFail(()=>gate().accept(event(envelope(),ORIGIN,{})),'UNTRUSTED_MESSAGE_SOURCE');
});
test('invalid build-time origin or missing expected source is denied',()=>{
  for(const origin of [undefined,'http://pocket.meku.farm','https://pocket.meku.farm/path','https://pocket.meku.farm.evil.com/path']) {
    if(origin==='https://pocket.meku.farm.evil.com/path'||origin?.startsWith('http:')||!origin) shouldFail(()=>createPreviewOnlyGate({trustedRequestOrigin:origin,expectedSource:SOURCE}),'INVALID_TRUSTED_ORIGIN');
    else shouldFail(()=>createPreviewOnlyGate({trustedRequestOrigin:origin,expectedSource:SOURCE}),'INVALID_TRUSTED_ORIGIN');
  }
  shouldFail(()=>createPreviewOnlyGate({trustedRequestOrigin:ORIGIN}),'INVALID_BOUNDARY_CONFIG');
});
test('never accepts injected message actions, signatures, AI approval or signer keys',()=>{
  for(const field of ['approved','privateKey','mnemonic','signature','send','transaction','aiApproved','origin','signNow','agentId']) {
    shouldFail(()=>gate().accept(event({...envelope(),[field]:'yes'})),'UNEXPECTED_MESSAGE_FIELDS');
  }
});
test('never accepts extra intent fields, malicious schema fields and prototype inputs',()=>{
  for (const field of ['privateKey','approval','allowance','instructions','feePayer','transaction','memo','agent']) {
    shouldFail(()=>gate().accept(event(envelope({...mkSol(),[field]:'anything'}))),'UNEXPECTED_INTENT_FIELDS');
  }
  const obj=Object.assign(Object.create({evil:true}),envelope());
  shouldFail(()=>gate().accept(event(obj)),'UNEXPECTED_MESSAGE_FIELDS');
  const withGetter=Object.defineProperty({...envelope()},'type',{enumerable:true,get(){throw Error('getter invoked');}});
  shouldFail(()=>gate().accept(event(withGetter)),'UNEXPECTED_MESSAGE_FIELDS');
});
test('wrong protocol type or version is denied',()=>{
  for(const input of [{...envelope(),type:'POCKET_SIGN_NOW'},{...envelope(),version:2}])
    shouldFail(()=>gate().accept(event(input)),'UNSUPPORTED_MESSAGE_PROTOCOL');
});
test('expired, future and nonsafe timestamps are denied',()=>{
  for(const t of [NOW-60001,NOW+5001,Number.MAX_SAFE_INTEGER+1,'1793769600000',-1])
    shouldFail(()=>gate().accept(event({...envelope(),issuedAt:t})),'EXPIRED_OR_INVALID_REQUEST_TIME');
});
test('reject wrong chain, wrong mint/program/decimals, invalid amounts',()=>{
  for(const i of [{...mkSol(),network:'devnet'},{...mkMeku(),mint:owner},{...mkMeku(),programId:owner},{...mkMeku(),decimals:9},{...mkSol(),amount:'0'},{...mkSol(),amount:'1e9'}])
    assert.throws(()=>gate().accept(event(envelope(i))));
});
test('does not accept second review while one is open',()=>{
  const g=gate();g.accept(event());
  shouldFail(()=>g.accept(event()),'REVIEW_IN_PROGRESS');
});
test('reject duplicate request after review dismissed',()=>{
  const g=gate();g.accept(event());assert.equal(g.dismiss(),'DISMISSED_NO_APPROVAL');
  shouldFail(()=>g.accept(event()),'DUPLICATE_REQUEST');
  assert.equal(g.getPreview(),null);
});
test('STOP permanently stops view-only gate and has no sign pathway',()=>{
  const g=gate();g.accept(event());assert.equal(g.stop(),'STOPPED_NO_SIGNING');
  assert.equal(g.getPreview(),null);
  shouldFail(()=>g.accept(event({...envelope(),intent:{...mkSol(),requestId:'pocket-req-20261104-002'}})),'STOP_ACTIVE');
});
test('returned snapshot is isolated from internal preview',()=>{
  const g=gate();const p=g.accept(event());p.recipient='changed';
  assert.equal(g.getPreview().recipient,recipient);
});
test('only reviewed source functions imported; transfer preflight unchanged',()=>{
  assert.equal(createTransferIntent(mkSol()).baseUnits,'1');
  assert.equal(typeof gate().accept,'function');
  assert.equal(typeof gate().stop,'function');
  assert.deepEqual(Object.keys(gate()).sort(),['accept','dismiss','getPreview','stop']);
});

// Hardened view-only boundary regressions. These are NOT wallet-signing tests.
test('preview expires after original request timestamp window, not after dismiss', () => {
  let now = NOW;
  const g = createPreviewOnlyGate({trustedRequestOrigin: ORIGIN, expectedSource: SOURCE, clock: () => now});
  const preview = g.accept(event());
  assert.equal(g.getPreview().requestId, preview.requestId);
  now = NOW + 60_000;
  assert.ok(g.getPreview(), 'preview at the exact 60-second limit may still be shown');
  now += 1;
  assert.equal(g.getPreview(), null, 'old preview must not remain active');
});
test('after expiry, new fresh request works but old request ID cannot be replayed', () => {
  let now = NOW;
  const g = createPreviewOnlyGate({trustedRequestOrigin: ORIGIN, expectedSource: SOURCE, clock: () => now});
  g.accept(event());
  now += 60_001;
  const fresh = {...envelope({...mkSol(), requestId:'pocket-req-20261104-003'}), issuedAt: now};
  assert.equal(g.accept(event(fresh)).requestId, 'pocket-req-20261104-003');
  g.dismiss();
  shouldFail(() => g.accept(event(fresh)), 'DUPLICATE_REQUEST');
  const old = {...envelope(), issuedAt: now};
  shouldFail(() => g.accept(event(old)), 'DUPLICATE_REQUEST');
});
test('session replay history is bounded and fails closed, including after dismiss', () => {
  const g = gate();
  for (let i = 0; i < 128; i++) {
    const id = `stage13-bounded-${String(i).padStart(3,'0')}`;
    assert.equal(g.accept(event(envelope({...mkSol(), requestId:id}))).requestId, id);
    g.dismiss();
  }
  shouldFail(() => g.accept(event(envelope({...mkSol(), requestId:'stage13-bounded-129'}))), 'SESSION_REQUEST_LIMIT');
  shouldFail(() => g.accept(event(envelope({...mkSol(), requestId:'stage13-bounded-000'}))), 'DUPLICATE_REQUEST');
});
test('malicious accessor on intent.asset is rejected without invoking getter', () => {
  let accessed = 0;
  const malicious = {...mkSol()};
  Object.defineProperty(malicious, 'asset', {enumerable:true, get(){accessed++;return 'SOL';}});
  shouldFail(() => gate().accept(event(envelope(malicious))), 'UNEXPECTED_INTENT_FIELDS');
  assert.equal(accessed, 0);
});
test('missing or primitive trusted WindowProxy configuration fails closed', () => {
  for(const value of [null,'window-proxy',42,true])
    shouldFail(() => createPreviewOnlyGate({trustedRequestOrigin:ORIGIN, expectedSource:value}),'INVALID_BOUNDARY_CONFIG');
});
test('only view-only methods remain available after hardening', () => {
  const g=gate();
  assert.deepEqual(Object.keys(g).sort(), ['accept','dismiss','getPreview','stop']);
  assert.equal(typeof g.sign, 'undefined');
  assert.equal(typeof g.approve, 'undefined');
  assert.equal(typeof g.broadcast, 'undefined');
});
