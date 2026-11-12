// Offline contracts only. No browser downloaded, executed, or rights attested.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hostPin,ensureBrowser,promptDownload}=require('../packaging/download-browser');
const pins=require('../packaging/browser-downloads.json');
(async()=>{
 for(const [platform,arch] of [['linux','x64'],['linux','arm64'],['darwin','x64'],['darwin','arm64'],['win32','x64']])assert.ok(hostPin(platform,arch).url.startsWith('https://storage.googleapis.com/'));
 assert.throws(()=>hostPin('win32','arm64'));assert.throws(()=>hostPin('linux','ia32'));
 await assert.rejects(promptDownload({input:{isTTY:false},output:{isTTY:false}}),/interactive/);
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'ep-download-contract-'));
 const api={Browser:{CHROME:'chrome'},BrowserPlatform:{LINUX:'linux',LINUX_ARM:'linux_arm',MAC:'mac',MAC_ARM:'mac_arm',WIN64:'win64'}};
 const base={home,api,platform:'linux',arch:'x64',output:{write(){}},consent:async()=>true};
 let calls=0;
 try {
  await assert.rejects(ensureBrowser({...base,consent:async()=>false,install:()=>{throw Error('Must not download');}}),/cancelled/);
  const root=path.join(home,'.educationperfected','browsers');assert.deepEqual(fs.readdirSync(root),[]);
  await assert.rejects(ensureBrowser({...base,install:async()=>{throw Error('Network failed');}}),/Network failed/);assert.deepEqual(fs.readdirSync(root),[]);
  await assert.rejects(ensureBrowser({...base,install:async()=>({executablePath:__filename})}),/Unexpected/);assert.deepEqual(fs.readdirSync(root),[]);
  const file=await ensureBrowser({...base,install:async options=>{
   calls++;assert.equal(options.expectedHash,hostPin('linux','x64').sha256);assert.equal(options.buildId,pins.version);assert.equal(options.installDeps,false);assert.equal(options.baseUrl,'https://storage.googleapis.com/chrome-for-testing-public');
   const executablePath=path.join(options.cacheDir,'chrome','test','chrome');fs.mkdirSync(path.dirname(executablePath),{recursive:true});fs.writeFileSync(executablePath,'inert-not-browser');return {executablePath};
  }});
  assert.equal(fs.readFileSync(file,'utf8'),'inert-not-browser');
  assert.equal(await ensureBrowser({...base,consent:()=>{throw Error('No repeated consent');},install:()=>{throw Error('No repeated download');}}),file);assert.equal(calls,1);
  const directory=path.join(root,pins.version+'-linux64');
  const receipt=path.join(directory,'COMPLETE.json');const record=JSON.parse(fs.readFileSync(receipt));record.executable='../outside';fs.writeFileSync(receipt,JSON.stringify(record));await assert.rejects(ensureBrowser(base),/Invalid|Incomplete/);
  fs.rmSync(directory,{recursive:true});fs.writeFileSync(directory+'.lock','');await assert.rejects(ensureBrowser({...base,consent:()=>{throw Error('Must lock before prompting');}}),/lock/);
  console.log('Direct browser download:5target pins, unsupported targets, interactive consent, cancellation, failure cleanup, fixed Google/hash/no-system-deps options, containment, cache reuse and install-lock contracts passed (offline synthetic only).');
 } finally {fs.rmSync(home,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
