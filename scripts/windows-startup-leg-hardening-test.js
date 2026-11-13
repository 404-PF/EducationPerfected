// Execute actual runLeg with inert OS/browser dependencies. No native APIs.
const fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');

const identity={sha256:'b'.repeat(64),length:123,browserVersion:'156.0.8078.47',hashVerified:true,extractionOwned:true,headlessMode:'test-shell-full-browser',executableSource:'owned-extraction-of-pinned-archive'};
async function run(mode,fail,path){
 const calls=[],parent=path.join(__dirname,'inert-virtual'),root=path.join(parent,'ep-startup-owned-ABC');let residue=[],removed=false,closed=false;
 const realAssert=assert;const fault=where=>{calls.push(where);if(fail===where)throw Error('inert');};
 const fakefs={mkdtempSync:prefix=>{fault(prefix.endsWith('ep-startup-owned-')?'allocate':'extract');if(prefix.endsWith('ep-startup-owned-'))return root;residue=['educationperfected-source-ABC'];return path.join(root,'tmp',residue[0]);},mkdirSync:p=>{assert.ok(p.startsWith(root+path.sep));fault('mkdir');},readFileSync:p=>{fault('manifest');return JSON.stringify({...identity,executable:'chrome.exe'});},copyFileSync:(a,b)=>{assert.ok(b.startsWith(root+path.sep));fault('copy');},constants:{COPYFILE_EXCL:1},readdirSync:p=>{assert.equal(p,path.join(root,'tmp'));fault('residue');return residue;},rmSync:p=>{assert.ok(p.startsWith(root));fault(p===root?'remove-root':'remove-extraction');if(p===root)removed=true;else residue=[];}};
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={write:data=>{assert.equal(data,'quit\n');fault('quit');closed=true;child.emit('close',fail==='owner-exit'?1:0,null);}};
 const server=new EventEmitter();server.listen=(port,host,cb)=>{assert.equal(host,'127.0.0.1');fault('listen');cb();};server.address=()=>({port:43188});server.close=cb=>{fault('server-close');cb();};
 const browser={target:()=>({createCDPSession:async()=>({send:async()=>{fault('argv');return {arguments:[path.join(root,'tmp','educationperfected-source-ABC','chrome.exe')]};},detach:async()=>{fault('detach');}})}),version:async()=>{fault('version');return 'Chrome/'+identity.browserVersion;}};
 function req(name){
  if(name==='./windows-fixture-profile')return {prepareWindowsFixtureProfile:()=>{fault('profile');}};
  if(name==='./windows-network-sandbox')return {observeNetworkSandbox:async()=>{fault('network-sandbox');return {sandbox:'Network',appContainer:true,launchFailures:0};}};
  if(name==='node:path')return path;
  if(name==='node:assert/strict')return {...assert,deepEqual:(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b))};if(name==='node:fs')return fakefs;if(name==='node:os')return {tmpdir:()=>parent};
  if(name==='node:child_process')return {spawn:(exe,args,opts)=>{assert.ok(opts.cwd.startsWith(root+path.sep));fault('spawn');return child;}};
  if(name==='./packaged-test-cleanup')return {boundedClose:async promise=>{fault('owner-close');return promise;},stopChild:async()=>{fault('stop');}};
  if(name==='./packaged-fixture-page')return {connectAfterLoginReady:async()=>{fault('ready');child.stdout.emit('data',Buffer.from('EP_TEST_BROWSER_IDENTITY=x\nCommands: start'));return {browser,checkpoint:{}};},selectLoginPage:async()=>{fault('page');return {type:async()=>{fault('type');},click:async()=>{fault('click');}};},disconnectController:async()=>{fault('disconnect');}};
  if(name==='./startup-browser-identity')return {readVerifiedArchive:async()=>{fault('archive');return {identity,bytes:Buffer.from('x')};},parseIdentityReceipt:()=>{fault('receipt');return identity;},assertOwnedBrowser:(tmp,exe)=>{assert.equal(tmp,path.join(root,'tmp'));fault('origin');return true;},verifyLegIdentity:value=>{fault('identity');realAssert.deepEqual(value.expected,identity);realAssert.equal(value.owned,true);realAssert.equal(value.observedVersion,'Chrome/'+identity.browserVersion);}};
  if(name==='../lib/test-browser-identity')return {emitBrowserIdentity:(m,cb)=>cb('inert')};
  if(name==='puppeteer')return {PUPPETEER_REVISIONS:{chrome:identity.browserVersion}};
  if(name==='node:stream/promises')return {pipeline:async()=>{fault('unpack');}};
  if(name==='modern-tar/fs')return {unpackTar:()=>({})};if(name==='node:zlib')return {createGunzip:()=>({})};
  if(name==='./mock-ep')return {createServer:()=>server};
  if(name==='./packaged-checkpoint')return {waitForPackagedCheckpoint:async predicate=>{fault('cli-ready');assert.equal(predicate(),true);}};
  return require(name);
 }
 const originalLoad=Module._load,originalLog=console.log,originalExec=process.execPath,originalEnv=process.env,originalPlatform=Object.getOwnPropertyDescriptor(process,'platform'),originalArch=Object.getOwnPropertyDescriptor(process,'arch');
 const target=require.resolve('./windows-startup-leg');delete require.cache[target];
 let error;
 try {
  Object.defineProperty(process,'platform',{value:'win32'});Object.defineProperty(process,'arch',{value:'x64'});
  process.env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'};process.execPath='/fixed/node.exe';console.log=()=>{};
  Module._load=function(name,parent,isMain){return parent?.filename===target?req(name):originalLoad.call(this,name,parent,isMain);};
  const actual=require('./windows-startup-leg');
  await actual.runLeg(mode,'a'.repeat(64),identity);
 }catch(e){error=e;}finally{
  Module._load=originalLoad;console.log=originalLog;process.execPath=originalExec;process.env=originalEnv;Object.defineProperty(process,'platform',originalPlatform);Object.defineProperty(process,'arch',originalArch);delete require.cache[target];
 }
 assert.equal(!error,!fail,mode+':'+fail+':'+error);
 if(!fail){assert.ok(calls.indexOf('network-sandbox')>calls.indexOf('ready'));assert.equal(removed,true);assert.equal(closed,true);assert.ok(calls.indexOf('remove-root')>calls.indexOf('disconnect'));}
 else assert.equal(removed,false,'failure must not claim root removed: '+fail);
}
(async()=>{for(const paths of [path.posix,path.win32])for(const mode of ['source','sea'])for(const fail of ['', 'allocate','mkdir','manifest','profile','archive','listen','spawn','ready','network-sandbox','argv','detach','version','receipt','identity','page','type','click','cli-ready','quit','owner-close','owner-exit','disconnect','stop','server-close','residue','remove-root',...(mode==='source'?['extract','unpack','origin','remove-extraction']:['copy'])])await run(mode,fail,paths);exclusiveCopy();console.log('Actual driver predicate/lifecycle migration inert matrix passed');})().catch(error=>{console.error(error);process.exitCode=1;});


function exclusiveCopy(){
// Execute unchanged exclusive-copy helper against inert files, preserving no-overwrite.
const {copySeaExecutable}=require('./windows-startup-leg');
const copyRoot=fs.mkdtempSync(path.join(__dirname,'ep-exclusive-inert-'));
try{const asset=path.join(copyRoot,'educationperfected.exe'),dest=path.join(copyRoot,'copy.exe');fs.writeFileSync(asset,'candidate');fs.writeFileSync(dest,'existing');assert.throws(()=>copySeaExecutable(copyRoot,dest),{code:'EEXIST'});assert.equal(fs.readFileSync(dest,'utf8'),'existing');fs.unlinkSync(dest);copySeaExecutable(copyRoot,dest);assert.equal(fs.readFileSync(dest,'utf8'),'candidate');if(process.platform!=='win32'){const target=path.join(copyRoot,'target');fs.writeFileSync(target,'untouched');fs.unlinkSync(dest);fs.symlinkSync(target,dest);assert.throws(()=>copySeaExecutable(copyRoot,dest),{code:'EEXIST'});assert.equal(fs.readFileSync(target,'utf8'),'untouched');}}finally{fs.rmSync(copyRoot,{recursive:true,force:true});}

}
