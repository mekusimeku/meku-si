/**
 * Run real Chromium / Chrome IndexedDB + WebCrypto disposable checks with Node 22 built-ins.
 * No npm install, app deployment, user data, wallets, secrets or external HTTP calls.
 */
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync, readFileSync, existsSync, statSync, createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, extname, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
const root=dirname(fileURLToPath(import.meta.url));
const candidates=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
function executable(){for(const c of candidates){try{const p=spawnSync('which',[c],{encoding:'utf8'});if(p.status===0)return p.stdout.trim();if(c.startsWith('/')){const q=spawnSync(c,['--version'],{encoding:'utf8'});if(q.status===0)return c;}}catch{}}throw Error('NO_CHROME_BROWSER');}
const server=createServer((req,res)=>{
  try{
    const path=resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname);
    if(!path.startsWith(root+'/')||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);res.end();return;}
    const type=extname(path)==='.html'?'text/html; charset=utf-8':'text/javascript; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    createReadStream(path).pipe(res);
  }catch{res.writeHead(500);res.end();}
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=mkdtempSync(join(tmpdir(),'meku-pocket-stage19-chrome-'));
  let child,ws;
  try{
    const chrome=executable();
    child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
    let port;
    for(let i=0;i<120;i++){
      if(child.exitCode!==null)throw Error('CHROME_EARLY_EXIT');
      const active=join(profile,'DevToolsActivePort');
      if(existsSync(active)){port=Number(readFileSync(active,'utf8').split('\n')[0]);break;}
      await sleep(200);
    }
    if(!port)throw Error('NO_DEVTOOLS_PORT');
    const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const url=pages.find(x=>x.type==='page')?.webSocketDebuggerUrl;
    if(!url)throw Error('NO_CHROME_PAGE');
    ws=new WebSocket(url);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let id=0;const pending=new Map();const errors=[];
    ws.addEventListener('message',e=>{
      const msg=JSON.parse(e.data);
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
      if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}
    });
    function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/browser-smoke.html`});
    let result;
    for(let i=0;i<200;i++){
      const evalResult=await send('Runtime.evaluate',{expression:'window.__pocketStage19 ?? null',returnByValue:true});
      result=evalResult.result.value;
      if(result)break;
      await sleep(250);
    }
    if(!result)throw Error(`BROWSER_TEST_TIMEOUT errors=${JSON.stringify(errors)}`);
    console.log(JSON.stringify({browser:chrome,tests:result.tests,status:result.status,message:result.message,errors},null,2));
    if(result.status!=='pass'||errors.length)throw Error('BROWSER_CHECK_FAILED');
  }finally{try{ws?.close();}catch{}try{child?.kill('SIGTERM');}catch{}await sleep(100);rmSync(profile,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
