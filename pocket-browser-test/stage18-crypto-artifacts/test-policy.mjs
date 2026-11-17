import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { targets, checkManifest, checkIntegrity, checkLockfile } from './policy.mjs';
const target = targets[0];
const safe = { name: target.name, version: target.version, dependencies: target.deps, exports: { '.': './index.js' }, scripts: { test: 'node test.js' } };
function lockFixture() {
  const metadata = Object.fromEntries(targets.map(t => [t.name, 'sha512-'+Buffer.alloc(64).toString('base64')]));
  const packages = { '': {dependencies:Object.fromEntries(targets.map(t=>[t.name,t.version]))} };
  for(const t of targets) packages[`node_modules/${t.name}`] = {version:t.version,integrity:metadata[t.name],resolved:`https://registry.npmjs.org/${t.name}/-/${t.name.split('/')[1]}-${t.version}.tgz`,dependencies:t.deps};
  return {lock:{lockfileVersion:3,packages},metadata};
}
const bad = (f) => assert.throws(f,/FAIL_CLOSED/);
test('accept exactly specified published package manifest',()=>assert.equal(checkManifest(safe,target),true));
test('reject changed version',()=>bad(()=>checkManifest({...safe,version:'2.4.1'},target)));
test('reject unapproved transitive dependency',()=>bad(()=>checkManifest({...safe,dependencies:{'@noble/hashes':'^2.4.0'}},target)));
test('reject lifecycle install hook',()=>bad(()=>checkManifest({...safe,scripts:{postinstall:'echo hi'}},target)));
test('reject missing exports',()=>bad(()=>checkManifest({...safe,exports:undefined},target)));
test('accept actual SHA512 of matching bytes',()=>{
 const bytes=Buffer.from('isolated-public-fixture');const sri='sha512-'+createHash('sha512').update(bytes).digest('base64');
 assert.equal(checkIntegrity(bytes,sri),createHash('sha512').update(bytes).digest('hex'));
});
test('reject a changed tarball',()=>{
 const sri='sha512-'+createHash('sha512').update('first').digest('base64');bad(()=>checkIntegrity(Buffer.from('second'),sri));
});
test('reject weak/unknown SRI',()=>bad(()=>checkIntegrity(Buffer.from('test'),'sha1-a')));
test('accept exactly three pinned lock packages',()=>{const x=lockFixture();assert.equal(checkLockfile(x.lock,x.metadata),true)});
test('reject unexpected transitive lock package',()=>{
 const x=lockFixture();x.lock.packages['node_modules/rogue']={version:'1.0.0'};bad(()=>checkLockfile(x.lock,x.metadata));
});
test('reject drift in locked hash',()=>{
 const x=lockFixture();x.lock.packages['node_modules/@noble/curves'].integrity='sha512-a';bad(()=>checkLockfile(x.lock,x.metadata));
});
test('reject registry hostname change',()=>{
 const x=lockFixture();x.lock.packages['node_modules/@noble/curves'].resolved='https://wrong.invalid/curves.tgz';bad(()=>checkLockfile(x.lock,x.metadata));
});
test('reject wrong lock dependency pin',()=>{
 const x=lockFixture();x.lock.packages['node_modules/@scure/bip39'].dependencies={'@noble/hashes':'^2.4.0'};bad(()=>checkLockfile(x.lock,x.metadata));
});
