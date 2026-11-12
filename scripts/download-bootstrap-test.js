// Fixed bootstrap, inert SEA assets/native hooks: no download or executable launch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(fail){
 let finished;const done=new Promise(resolve=>{finished=resolve;});const events=[];
 const fake={platform:'linux',execPath:process.execPath,argv:['fixture'],env:{PUPPETEER_EXECUTABLE_PATH:'/untrusted-env'},on(){},removeListener(){}};
 const pin=require('../packaging/browser-downloads.json').version;
 const load=id=>{
  if(id==='node:fs')return {mkdtempSync:()=>'/owned-native',chmodSync(){},writeFileSync(){},rmSync(){events.push('cleanup');finished();}};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify({browserMode:'direct-google-download',browserVersion:pin}):new ArrayBuffer(0),getRawAsset(){throw Error('No embedded browser asset allowed');}};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='modern-tar/fs')return {unpackTar(){throw Error('No bundled unpack');}};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='./browser-downloads.json')return {version:pin};
  if(id==='./download-browser')return {ensureBrowser:async()=>{events.push('acquire');if(fail)throw Error('Synthetic cancellation');return '/approved-google-cache/browser';}};
  if(id==='../bin/cli')return {runCli:async()=>{assert.equal(fake.env.PUPPETEER_EXECUTABLE_PATH,'/approved-google-cache/browser');events.push('cli');}};
  if(id==='../lib/diagnostics')return {diagnostic:()=> 'Synthetic cancellation'};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process:fake,Buffer,console:{error(){events.push('error');finished();}}}); // NOSONAR: fixed repository source with inert synthetic dependencies only.
 await done;await new Promise(resolve=>setImmediate(resolve));assert.ok(events.includes('acquire'));assert.equal(events.includes('cli'),!fail);assert.ok(events.includes('cleanup'));assert.equal(fake.exitCode,fail?1:undefined);
}
(async()=>{await probe(false);await probe(true);console.log('Downloadable bootstrap bypasses browser SEA asset/unpack, overwrites inherited browser path, and blocks CLI on failed acquisition (synthetic only).');})().catch(e=>{console.error(e);process.exitCode=1});
