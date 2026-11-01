// Fixed single-leg driver, only called by the owned Windows job wrapper.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {boundedClose,stopChild}=require('./packaged-test-cleanup');
const {connectAfterLoginReady,selectLoginPage,disconnectController}=require('./packaged-fixture-page');
const {readVerifiedArchive,parseIdentityReceipt,assertOwnedBrowser,verifyLegIdentity}=require('./startup-browser-identity');
const {pipeline}=require('node:stream/promises'),{createGunzip}=require('node:zlib');
const {unpackTar}=require('modern-tar/fs');
const {Readable}=require('node:stream');
const {validateLegRoot}=require('./windows-startup-root');
function requireDiagnosticHost() {
 if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.RUNNER_OS!=='Windows')throw Error('Diagnostic host guard');
}
function checkedCliRoot(root,mode) {requireDiagnosticHost();return validateLegRoot(root,mode);}
function copySeaExecutable(build,executable) {fs.copyFileSync(path.join(build,'educationperfected.exe'),executable,fs.constants.COPYFILE_EXCL);}
function driverStage(mode,nonce,stage) {console.log('EP_DIAGNOSTIC_DRIVER_STAGE='+JSON.stringify({nonce,mode,stage}));}
async function runLeg(root,mode,nonce) {
 requireDiagnosticHost();
 driverStage(mode,nonce,'host-checked');
 assert.ok(['source','sea'].includes(mode));assert.match(nonce,/^[a-f0-9]{64}$/);
 root=validateLegRoot(root,mode);driverStage(mode,nonce,'leg-root-checked');
 assert.deepEqual(fs.readdirSync(root),[],'Diagnostic leg must begin empty');
 const build=path.resolve(__dirname,'../build/windows-x64');
 const manifest=JSON.parse(fs.readFileSync(path.join(build,'manifest.json'),'utf8'));
 // Reads before process creation. No missing-file/cache/system fallback.
 driverStage(mode,nonce,'archive-check-entered');
 const verified=await readVerifiedArchive(path.join(build,'browser.tar.gz'),manifest);
 driverStage(mode,nonce,'archive-verified');
 const expected=verified.identity;
 let sourceReceipt='';
 if(mode==='source')require('../lib/test-browser-identity').emitBrowserIdentity(manifest,line=>{sourceReceipt=line;});
 assert.equal(expected.browserVersion,require('puppeteer').PUPPETEER_REVISIONS.chrome);
 for(const name of ['home','tmp','empty','runtime'])fs.mkdirSync(path.join(root,name),{mode:0o700});
 const home=path.join(root,'home'),tmp=path.join(root,'tmp');
 let sourceExecutable;
 assert.equal(manifest.executable,path.basename(manifest.executable));
 assert.equal(path.isAbsolute(manifest.executable),false);
 if(mode==='source') {
  driverStage(mode,nonce,'unpack-entered');
  const extraction=fs.mkdtempSync(path.join(tmp,'educationperfected-source-'));
  await pipeline(Readable.from([verified.bytes]),createGunzip(),unpackTar(extraction));
  sourceExecutable=path.join(extraction,manifest.executable);assertOwnedBrowser(tmp,sourceExecutable);driverStage(mode,nonce,'unpacked');
 }
 const server=require('./mock-ep').createServer();let child,closed,browser,text='',serverError,spawnError,primary;
 const result={nonce,mode,receipt:null,observedVersion:null,owned:false,ready:false,cleanupCertain:false,navigationCategory:'unobserved'};
 try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.on('error',error=>{serverError=error;});
  const origin='http://127.0.0.1:'+server.address().port;
  const env={...process.env,HOME:home,USERPROFILE:home,PATH:path.join(root,'empty'),TEMP:tmp,TMP:tmp,TMPDIR:tmp,XDG_CONFIG_HOME:path.join(home,'config'),XDG_CACHE_HOME:path.join(home,'cache'),XDG_DATA_HOME:path.join(home,'data'),XDG_RUNTIME_DIR:path.join(root,'runtime'),EP_TEST_BOOT:'1',EP_TEST_BROWSER_IDENTITY:'1',EP_LOGIN_URL:origin+'/app/login',EP_LOGIN_HOST:'127.0.0.1',PUPPETEER_EXECUTABLE_PATH:sourceExecutable||''};
  for(const name of ['EP_EMAIL','EP_PASSWORD','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','PUPPETEER_CACHE_DIR','PUPPETEER_BROWSER'])delete env[name];
  let executable,args;
  if(mode==='source'){executable=process.execPath;args=[path.resolve(__dirname,'../bin/cli.js')];}
  else {executable=path.join(root,'educationperfected.exe');copySeaExecutable(build,executable);args=[];}
  driverStage(mode,nonce,'spawn-entered');
  child=spawn(executable,args,{env,cwd:home,stdio:['pipe','pipe','pipe']});
  driverStage(mode,nonce,'spawn-returned');
  closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  child.once('error',error=>{spawnError=error;});
  const capture=chunk=>{if(spawnError)return;text+=chunk.toString();if(Buffer.byteLength(text)>65536){text='';spawnError=Error('Diagnostic output limit');}};
  child.stdout.on('data',capture);child.stderr.on('data',capture);
  const ready=await connectAfterLoginReady({text:()=>text,child,failure:()=>spawnError||serverError,connect:options=>require('puppeteer').connect(options)});
  browser=ready.browser;result.ready=true;driverStage(mode,nonce,'ready-observed');
  console.log('EP_DIAGNOSTIC_READY_CHECKPOINT='+JSON.stringify(ready.checkpoint));
  // All observer calls are after owner marker, never on endpoint availability.
  const command=await browser.target().createCDPSession();let argv;
  try {argv=(await command.send('Browser.getBrowserCommandLine')).arguments;}finally{await command.detach();}
  result.owned=assertOwnedBrowser(tmp,argv[0]);
  result.observedVersion=await browser.version();
  result.receipt=parseIdentityReceipt(mode==='source'?sourceReceipt:text);
  verifyLegIdentity({...result,expected});
  const page=await selectLoginPage(browser,origin+'/app/login');
  await page.type('#loginId','fixture-user');await page.type('#password','fixture-only');await page.click('form button');
  await require('./packaged-checkpoint').waitForPackagedCheckpoint(()=>text.includes('Commands: start'),{child,failure:()=>spawnError||serverError,name:'diagnostic-cli-ready',milliseconds:20000});
  child.stdin.write('quit\n');
  const status=await boundedClose(closed,10000,'Diagnostic owner quit uncertainty');assert.equal(status.code,0);assert.equal(status.signal,null);driverStage(mode,nonce,'owner-closed');
 } catch(error) {primary=error;}
 finally {
  // Neither driver nor wrapper proves global browser tree closure. Disposable VM teardown is a backstop.
  try {await disconnectController(browser);}catch{primary||=Error('Diagnostic disconnect uncertainty');}
  try {await stopChild(child,closed);}catch{primary||=Error('Diagnostic owner closure uncertainty');}
  await new Promise(resolve=>server.close(resolve));
 }
 const categories=['navigation-timeout','target-detached','browser-disconnected','protocol-error','other'];
 const failures=text.split(/\r?\n/).filter(line=>line.startsWith('EP_TEST_NAVIGATION_FAILURE='));
 if(failures.length===1) {
  try {const value=JSON.parse(failures[0].slice('EP_TEST_NAVIGATION_FAILURE='.length));if(categories.includes(value.category))result.navigationCategory=value.category;}catch{}
 }
 if(primary)throw Object.assign(Error('Diagnostic leg uncertainty'),{diagnosticResult:result});
 // Source extraction is test-owned; SEA extraction must already have gone on exit.
 const residue=fs.readdirSync(tmp);
 if(mode==='source') {assert.equal(residue.length,1);assert.ok(residue[0].startsWith('educationperfected-source-'));fs.rmSync(path.join(tmp,residue[0]),{recursive:true,force:true});}
 assert.deepEqual(fs.readdirSync(tmp),[]);
 result.cleanupCertain=true;driverStage(mode,nonce,'leg-complete');return result;
}
module.exports={runLeg,checkedCliRoot,copySeaExecutable};
if(require.main===module)(async()=>{
 if(process.argv.length!==5)throw Error('Diagnostic arguments');const mode=process.argv[3],nonce=process.argv[4];
 if(!['source','sea'].includes(mode)||!/^[a-f0-9]{64}$/.test(nonce))throw Error('Diagnostic arguments');
 driverStage(mode,nonce,'cli-entry');const root=checkedCliRoot(process.argv[2],mode);driverStage(mode,nonce,'cli-root-checked');
 try {const result=await runLeg(root,mode,nonce);fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result),{flag:'wx',mode:0o600});console.log('EP_DIAGNOSTIC_LEG_DONE');}
 catch(error) {if(error.diagnosticResult)fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify(error.diagnosticResult),{flag:'wx',mode:0o600});console.error('EP_DIAGNOSTIC_LEG_UNCERTAIN');process.exitCode=1;}
})().catch(()=>{console.error('EP_DIAGNOSTIC_LEG_UNCERTAIN');process.exitCode=1;});
