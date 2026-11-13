// Fixed bootstrap, inert SEA assets/native hooks: no download or executable launch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(fail,mismatch=false,cliFail=false,confirmedBeforeFailure=false){
 let finished;const done=new Promise(resolve=>{finished=resolve;});const events=[];
 const fake={platform:'linux',execPath:process.execPath,argv:['fixture'],env:{PUPPETEER_EXECUTABLE_PATH:'/untrusted-env'},on(){},removeListener(){}};
 const pin=require('../packaging/browser-downloads.json').version;
 const load=id=>{
  if(id==='../lib/runtime-directory')return {createRuntimeDirectory:()=>({directory:'/owned-native',remove:safe=>{assert.equal(safe,!cliFail||confirmedBeforeFailure);events.push(safe?'cleanup':'retained');finished();return safe;}})};
  if(id==='node:fs')return {mkdtempSync:()=>'/owned-native',chmodSync(){},writeFileSync(){},rmSync(){events.push('cleanup');finished();}};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify({browserMode:'direct-google-download',browserVersion:mismatch?'0.0.0.0':pin}):new ArrayBuffer(0),getRawAsset(){throw new Error('No embedded browser asset allowed');}};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='modern-tar/fs')return {unpackTar(){throw new Error('No bundled unpack');}};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='./browser-downloads.json')return {version:pin};
  if(id==='./download-browser')return {ensureBrowser:async()=>{events.push('acquire');if(fail){throw new Error('Synthetic cancellation');}return '/approved-google-cache/browser';}};
  if(id==='../bin/cli')return {runCli:async options=>{assert.equal(fake.env.PUPPETEER_EXECUTABLE_PATH,'/approved-google-cache/browser');assert.equal(fake.env.PUPPETEER_TMP_DIR,'/owned-native');events.push('cli');if(confirmedBeforeFailure){options.onBrowserClosed();}if(cliFail)throw new Error('Synthetic CLI close uncertainty');}};
  if(id==='../lib/diagnostics')return {diagnostic:()=> 'Synthetic cancellation'};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process:fake,Buffer,console:{error(){events.push('error');finished();}}}); // NOSONAR: fixed repository source with inert synthetic dependencies only.
 let timer;try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Bootstrap probe timeout')),3000);})]);}finally{clearTimeout(timer);}await new Promise(resolve=>setImmediate(resolve));assert.equal(events.includes('acquire'),!mismatch);assert.equal(events.includes('cli'),!fail&&!mismatch);assert.ok(events.includes(cliFail&&!confirmedBeforeFailure?'retained':'cleanup'));assert.equal(fake.exitCode,fail||mismatch||cliFail?1:undefined);
}
(async()=>{await probe(false);await probe(true);await probe(false,true);await probe(false,false,true);await probe(false,false,true,true);console.log('Downloadable bootstrap bypasses browser SEA asset/unpack, overwrites inherited browser path, and blocks CLI on failed acquisition (synthetic only).');})().catch(e=>{console.error(e);process.exitCode=1});
