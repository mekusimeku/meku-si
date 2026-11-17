/** Downloads registry tarballs inside disposable CI only; no installation or code execution. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { targets, checkManifest, checkIntegrity, checkLockfile } from './policy.mjs';

const work = mkdtempSync(join(tmpdir(),'pocket-stage18-'));
const out = resolve(process.argv[2] ?? './stage18-artifact-report');
function command(program,args,cwd=work) {
  return execFileSync(program,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,env:{...process.env,npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false'}}).trim();
}
try {
  const metadata={};const evidence=[];
  for(const t of targets) {
    const identity=`${t.name}@${t.version}`;
    const integrity=JSON.parse(command('npm',['view',identity,'dist.integrity','--json','--registry=https://registry.npmjs.org/','--fetch-retries=1']));
    if(typeof integrity!=='string'||!integrity.startsWith('sha512-')) throw new Error(`FAIL_CLOSED: missing SHA512 metadata for ${identity}`);
    const before=new Set(readdirSync(work).filter(f=>f.endsWith('.tgz')));
    command('npm',['pack',identity,'--ignore-scripts','--registry=https://registry.npmjs.org/','--pack-destination',work]);
    const names=readdirSync(work).filter(f=>f.endsWith('.tgz')&&!before.has(f));
    if(names.length!==1) throw new Error(`FAIL_CLOSED: wrong tarball count for ${identity}`);
    const file=join(work,names[0]);
    const sha512=checkIntegrity(readFileSync(file),integrity);
    const entries=command('tar',['-tzf',file]).split('\n');
    if(!entries.every(x=>x.startsWith('package/')&&!x.includes('../')&&!x.startsWith('package//'))||entries.filter(x=>x==='package/package.json').length!==1) throw new Error(`FAIL_CLOSED: bad tarball paths for ${identity}`);
    const manifest=JSON.parse(command('tar',['-xOzf',file,'package/package.json']));
    checkManifest(manifest,t);
    metadata[t.name]=integrity;
    evidence.push({name:t.name,version:t.version,registryIntegrity:integrity,verifiedTarballSha512:sha512,tarballEntries:entries.length,dependencies:manifest.dependencies??{}});
    console.log(`PASS published npm tarball SHA512, package identity, lifecycle and dependencies: ${identity}`);
  }
  const root = { name:'meku-pocket-stage18-inspection-only',version:'0.0.0',private:true,dependencies:Object.fromEntries(targets.map(t=>[t.name,t.version]))};
  writeFileSync(join(work,'package.json'),JSON.stringify(root,null,2)+'\n');
  command('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/']);
  const lock=JSON.parse(readFileSync(join(work,'package-lock.json'),'utf8'));
  checkLockfile(lock,metadata);
  mkdirSync(out,{recursive:true});
  copyFileSync(join(work,'package-lock.json'),join(out,'verified-package-lock.json'));
  writeFileSync(join(out,'published-tarball-report.json'),JSON.stringify({stage:'18',scope:'TEST_ONLY_NO_PRODUCTION_APPROVAL',evidence},null,2)+'\n');
  console.log('PASS npm lockfile: exactly three pinned packages and registry integrity hashes');
  console.log('NOTE: tarball integrity and manifest checks do NOT establish a code audit, safe browser vault or production approval');
} finally { rmSync(work,{recursive:true,force:true}); }
