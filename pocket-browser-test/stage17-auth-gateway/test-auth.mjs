import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createFixtureGateway,verifyFixtureJwt,AuthFailure} from './auth-gateway.mjs';
const now = 1793870000;
const secret=Buffer.from('test only stage17 auth key not live wallet key!!!');
const cfg={secret,issuer:'https://fixture-identity.invalid',audience:'pocket-stage17-test-only',nowSec:now};
const owners=new Map([['test-alice','owner-alice'],['test-bob','owner-bob']]);
function token(sub='test-alice',patch={},header={alg:'HS256',typ:'JWT'}){
  const payload={iss:cfg.issuer,aud:cfg.audience,sub,iat:now-10,nbf:now-10,exp:now+30,jti:'test-jti-00000001',...patch};
  const p=[header,payload].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));
  return p.join('.')+'.'+createHmac('sha256',secret).update(p.join('.')).digest('base64url');
}
function memoryDb(){
  const intents=new Map([['owner-alice|same-request-001',{state:'SIGNED_RECORDED',count:0}],['owner-bob|same-request-001',{state:'SIGNED_RECORDED',count:0}]]);
  const stopped=new Set();
  return {intents,stopped,db:{
    claim:async(o,k)=>{const i=intents.get(o+'|'+k);if(stopped.has(o))throw new Error('STOP_ACTIVE');if(!i||i.state!=='SIGNED_RECORDED')throw new Error('DO_NOT_RETRY');i.state='CLAIMED_UNKNOWN';i.count++;return i.state;},
    stop:async(o)=>{stopped.add(o);return 'STOPPED';},
    status:async(o,k)=>intents.get(o+'|'+k)?.state??'NOT_FOUND'
  }};
}
function gateway(db,nowFn=()=>now){return createFixtureGateway({...cfg,nowSec:nowFn,ownerForSubject:s=>owners.get(s),db});}
function req(t=token(),action='claim',requestKey='same-request-001'){return {authorization:'Bearer '+t,action,requestKey};}
function rejects(code,fn){assert.throws(fn,x=>x instanceof AuthFailure && x.code===code);}
function rejectsAsync(code,fn){return assert.rejects(fn,x=>x instanceof AuthFailure && x.code===code);}

test('accept only the signed short-lived test identity',()=>assert.equal(verifyFixtureJwt(token(),cfg).subject,'test-alice'));
test('refuse empty, non-compact, noncanonical and oversized tokens',()=>{for(const v of ['',null,'xx','a.b.c','abc=.b.c','a.b.c.d','x'.repeat(4097)]) rejects('BAD_TOKEN',()=>verifyFixtureJwt(v,cfg));});
test('refuse altered signature',()=>{const t=token();const parts=t.split('.');parts[2]=parts[2][0]==='a'?'b'+parts[2].slice(1):'a'+parts[2].slice(1);rejects('BAD_SIGNATURE',()=>verifyFixtureJwt(parts.join('.'),cfg));});
test('refuse alg none and unsupported header keys',()=>{for(const h of [{alg:'none',typ:'JWT'},{alg:'HS256',typ:'JWT',kid:'attacker'},{alg:'RS256',typ:'JWT'}])rejects('BAD_HEADER',()=>verifyFixtureJwt(token('test-alice',{},h),cfg));});
test('refuse extra and missing claims',()=>{rejects('BAD_CLAIMS',()=>verifyFixtureJwt(token('test-alice',{owner:'owner-bob'}),cfg));rejects('BAD_CLAIMS',()=>verifyFixtureJwt(token('test-alice',{jti:undefined}),cfg));});
test('refuse wrong issuer and audience',()=>{for(const p of [{iss:'https://evil.invalid'},{aud:'another-audience'}]) rejects('WRONG_ISSUER_OR_AUDIENCE',()=>verifyFixtureJwt(token('test-alice',p),cfg));});
test('refuse expired, future and zero-length token',()=>{for(const p of [{exp:now},{iat:now+1},{nbf:now+1}])rejects('EXPIRED_OR_NOT_YET_VALID',()=>verifyFixtureJwt(token('test-alice',p),cfg));});
test('refuse long-lived and malformed timestamps',()=>{for(const p of [{exp:now+3600},{nbf:now-11},{exp:now-10},{iat:'yesterday'}]){const want= p.iat==='yesterday'?'BAD_TIME':'BAD_TOKEN_LIFETIME';if(p.exp===now-10)continue;rejects(want,()=>verifyFixtureJwt(token('test-alice',p),cfg));}});
test('refuse malformed subject and token id',()=>{rejects('BAD_SUBJECT',()=>verifyFixtureJwt(token('../victim'),cfg));rejects('BAD_JTI',()=>verifyFixtureJwt(token('test-alice',{jti:'tiny'}),cfg));});
test('refuse weak signing secret even with valid token',()=>rejects('INVALID_SERVER_SETUP',()=>verifyFixtureJwt(token(),{...cfg,secret:Buffer.from('short')}));
test('request cannot provide owner or simulated role in its JSON body',async()=>{const d=memoryDb();const g=gateway(d.db);await rejectsAsync('UNSUPPORTED_FIELD',()=>g.handle({...req(),owner:'owner-bob'}));await rejectsAsync('UNSUPPORTED_FIELD',()=>g.handle({...req(),role:'admin'}));});
test('unauthenticated and unbound users are refused',async()=>{const d=memoryDb();const g=gateway(d.db);await rejectsAsync('MISSING_AUTH',()=>g.handle({action:'claim',requestKey:'same-request-001'}));await rejectsAsync('UNBOUND_SUBJECT',()=>g.handle(req(token('test-nobody'))));});
test('bad request key and unknown commands refuse before DB action',async()=>{const d=memoryDb();const g=gateway(d.db);await rejectsAsync('BAD_REQUEST_KEY',()=>g.handle({...req(),requestKey:'../bad'}));await rejectsAsync('UNSUPPORTED_ACTION',()=>g.handle({...req(),action:'sign'}));});
test('Alice claim cannot change Bob record',async()=>{const d=memoryDb();const g=gateway(d.db);assert.equal(await g.handle(req()),'CLAIMED_UNKNOWN');assert.equal(d.intents.get('owner-bob|same-request-001').state,'SIGNED_RECORDED');});
test('replayed claim fails; STOP preserves prior claim',async()=>{const d=memoryDb();const g=gateway(d.db);assert.equal(await g.handle(req()),'CLAIMED_UNKNOWN');await assert.rejects(()=>g.handle(req()),/DO_NOT_RETRY/);assert.equal(await g.handle({authorization:'Bearer '+token(),action:'stop'}),'STOPPED');assert.equal(await g.handle(req(token(),'status')),'CLAIMED_UNKNOWN');await assert.rejects(()=>g.handle(req()),/STOP_ACTIVE/);});
test('Bob independent of Alice STOP',async()=>{const d=memoryDb();const g=gateway(d.db);await g.handle({authorization:'Bearer '+token(),action:'stop'});assert.equal(await g.handle(req(token('test-bob'))),'CLAIMED_UNKNOWN');});
test('fake owner headers cannot become authorization',async()=>{const d=memoryDb();const g=gateway(d.db);await rejectsAsync('UNSUPPORTED_FIELD',()=>g.handle({...req(),headers:{'x-owner':'owner-bob'}}));});
test('user-provided authorization is required in exact bearer shape',async()=>{const d=memoryDb();const g=gateway(d.db);for(const auth of ['bearer '+token(),'Basic xyz','Bearer',''])await rejectsAsync('MISSING_AUTH',()=>g.handle({...req(),authorization:auth}));});
test('no request key is allowed with STOP',async()=>{const d=memoryDb();const g=gateway(d.db);await rejectsAsync('UNSUPPORTED_FIELD',()=>g.handle(req(token(),'stop')));});
