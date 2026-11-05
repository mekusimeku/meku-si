/** Stage 17: real PostgreSQL 16 CI fixture under a shared backend login.
 * No actual Pocket identity provider or production database is involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createFixtureGateway,AuthFailure} from './auth-gateway.mjs';

const container=process.env.POCKET_CI_PG_CONTAINER;
if (!container) throw new Error('Stage 17 requires explicit throwaway CI Postgres service');
const fixtures={secret:Buffer.from('stage17 postgres CI signing fixture not real!'),issuer:'https://stage17-issuer.invalid',audience:'stage17-test-only',nowSec:()=>1793870000};
function jwt(sub){
 const header={alg:'HS256',typ:'JWT'};
 const body={iss:fixtures.issuer,aud:fixtures.audience,sub,iat:1793869990,nbf:1793869990,exp:1793870030,jti:'stage17-abcdefghijk'};
 const b=[header,body].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));
 return b.join('.')+'.'+createHmac('sha256',fixtures.secret).update(b.join('.')).digest('base64url');
}
function clientSQL(op,owner,request){
  const available={claim:'claim_once',stop:'stop_owner',status:'status_owner'};
  if(!available[op])throw Error('UNSUPPORTED_SQL');
  const sql=op==='stop'
    ? 'SELECT pocket_stage17_test_only.'+available[op]+"(:'owner');\n"
    : 'SELECT pocket_stage17_test_only.'+available[op]+"(:'owner',:'request');\n";
  return new Promise(resolve=>{
    const args=['exec','-i','-e','PGPASSWORD=stage17_app_fixture_do_not_reuse',container,
       'psql','-X','-h','127.0.0.1','-U','pocket_stage17_app','-d','pocket_ci',
       '-v','ON_ERROR_STOP=1','-v','owner='+owner,'-v','request='+String(request??''),'-Atq'];
    const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    p.stdout.on('data',c=>stdout+=c);
    p.stderr.on('data',c=>stderr+=c);
    p.on('error',e=>resolve({code:2,stderr:String(e)}));
    p.on('close',code=>resolve({code,stdout:stdout.trim(),stderr:stderr.trim()}));
    p.stdin.end(sql);
  });
}
function service(){
 return createFixtureGateway({...fixtures,ownerForSubject:s=>({
   'test-alice':'owner-alice','test-bob':'owner-bob'
 })[s],db:{
  claim:(o,r)=>clientSQL('claim',o,r),
  stop:o=>clientSQL('stop',o),
  status:(o,r)=>clientSQL('status',o,r)
 }});
}
function req(sub,action,requestKey){
 return {authorization:'Bearer '+jwt(sub),action,...(requestKey?{requestKey}:{})};
}
function success(r,s){assert.equal(r.code,0,r.stderr);assert.equal(r.stdout,s);}
function denied(r,pattern){
 assert.notEqual(r.code,0,'unexpected success');
 assert.match(r.stderr,new RegExp(pattern));
}
const gateway=service();
test('Alice and Bob tokens map to separate PostgreSQL owner records',async()=>{
 success(await gateway.handle(req('test-alice','status','alice-only-001')),'SIGNED_RECORDED');
 success(await gateway.handle(req('test-bob','status','alice-only-001')),'NOT_FOUND');
 success(await gateway.handle(req('test-bob','status','bob-only-0001')),'SIGNED_RECORDED');
 success(await gateway.handle(req('test-alice','status','bob-only-0001')),'NOT_FOUND');
});
test('owner override and missing auth blocked before querying PostgreSQL',async()=>{
 await assert.rejects(()=>gateway.handle({...req('test-alice','claim','same-request-001'),owner:'owner-bob'}),e=>e instanceof AuthFailure&&e.code==='UNSUPPORTED_FIELD');
 await assert.rejects(()=>gateway.handle({action:'claim',requestKey:'same-request-001'}),e=>e instanceof AuthFailure&&e.code==='MISSING_AUTH');
});
test('the shared Postgres app login may not read a private table directly',()=>{
 const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD=stage17_app_fixture_do_not_reuse',container,'psql','-X','-h','127.0.0.1','-U','pocket_stage17_app','-d','pocket_ci','-v','ON_ERROR_STOP=1','-Atq'],{input:'SELECT * FROM pocket_stage17_test_only.intents;\n',encoding:'utf8'});
 denied({code:r.status,stderr:r.stderr},'permission denied');
});
test('12 separate backend sessions race to claim: one succeeds',async()=>{
 const results=await Promise.all(Array.from({length:12},()=>gateway.handle(req('test-alice','claim','same-request-001'))));
 assert.equal(results.filter(r=>r.code===0&&r.stdout==='CLAIMED_UNKNOWN').length,1,JSON.stringify(results));
 assert.equal(results.filter(r=>r.code!==0&&r.stderr.includes('DO_NOT_RETRY')).length,11,JSON.stringify(results));
});
test('a new session cannot claim the same record again',async()=>{
 denied(await gateway.handle(req('test-alice','claim','same-request-001')),'DO_NOT_RETRY');
 success(await gateway.handle(req('test-alice','status','same-request-001')),'CLAIMED_UNKNOWN');
});
test('STOP preserves claimed evidence and blocks further Alice claims',async()=>{
 success(await gateway.handle(req('test-alice','stop')),'STOPPED');
 success(await gateway.handle(req('test-alice','status','same-request-001')),'CLAIMED_UNKNOWN');
 success(await gateway.handle(req('test-alice','status','stop-me-0000001')),'CANCELLED');
 denied(await gateway.handle(req('test-alice','claim','alice-only-001')),'STOP_ACTIVE');
 success(await gateway.handle(req('test-bob','claim','same-request-001')),'CLAIMED_UNKNOWN');
});
test('Bob STOP cannot rewrite Alice evidence',async()=>{
 success(await gateway.handle(req('test-bob','stop')),'STOPPED');
 success(await gateway.handle(req('test-alice','status','same-request-001')),'CLAIMED_UNKNOWN');
 success(await gateway.handle(req('test-bob','status','same-request-001')),'CLAIMED_UNKNOWN');
});
