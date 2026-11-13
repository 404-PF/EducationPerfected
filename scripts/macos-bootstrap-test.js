// Fixed bootstrap with synthetic SEA asset and inert unpack/CLI/native hooks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {gzipSync}=require('node:zlib'),{createHash}=require('node:crypto'),{Writable}=require('node:stream');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(rejectPath) {
 const asset=gzipSync(Buffer.from('synthetic browser archive')),raw=asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength);
 const executable='Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 const processFixture={platform:'darwin',execPath:process.execPath,argv:['synthetic'],env:{},on(){},removeListener(){}};
 const order=[],moduleError=Error('synthetic invalid path');let finish,timer;
 const completed=new Promise(resolve=>{finish=resolve;});
 const load=id=>{
  if(id==='../lib/runtime-directory')return {createRuntimeDirectory:()=>({directory:'/synthetic-owned-root',remove:safe=>{assert.ok(safe);order.push('cleanup');finish();return true;}})};
  if(id==='../lib/cli-command')return require(id);
  if(id==='node:fs')return {mkdtempSync:()=>'/synthetic-owned-root',chmodSync(){},writeFileSync(){},rmSync(){order.push('cleanup');finish();}};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify({length:asset.length,sha256:createHash('sha256').update(asset).digest('hex'),executable}):new ArrayBuffer(0),getRawAsset:()=>raw};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='modern-tar/fs')return {unpackTar:()=>new Writable({write(chunk,encoding,callback){order.push('unpack');callback();}})};
  if(id==='./macos-extracted-executable')return {macosExtractedExecutable:(root,relative)=>{order.push('validate');assert.equal(root,'/synthetic-owned-root');assert.equal(relative,executable);if(rejectPath)throw moduleError;return '/validated-canonical/browser';}};
  if(id==='../bin/cli')return {runCli:async()=>{order.push('cli');assert.equal(processFixture.env.PUPPETEER_EXECUTABLE_PATH,'/validated-canonical/browser');}};
  if(id==='../lib/diagnostics')return {diagnostic:error=>{assert.equal(error,moduleError);return 'Synthetic rejected path';}};
  assert.ok(id.startsWith('node:'));return require(id);
 };
 vm.runInNewContext(source,{require:load,process:processFixture,Buffer,console:{error(){order.push('error');finish();}}}); // NOSONAR: fixed repository bootstrap with inert assets and synthetic dependencies, no external source.
 try {await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic bootstrap timeout')),3000);})]);await new Promise(resolve=>setImmediate(resolve));}
 finally {clearTimeout(timer);}
 assert.ok(order.includes('unpack'),'Bootstrap must unpack before validation');
 assert.ok(order.includes('validate'),'Bootstrap must validate executable');
 assert.ok(order.indexOf('unpack')<order.indexOf('validate'));
 assert.equal(order.includes('cli'),!rejectPath);assert.equal(processFixture.exitCode,rejectPath?1:undefined);
 if(rejectPath)assert.equal(processFixture.env.PUPPETEER_EXECUTABLE_PATH,undefined);
 else {assert.ok(order.includes('cli'));assert.ok(order.indexOf('validate')<order.indexOf('cli'));}
}
(async()=>{await probe(false);await probe(true);console.log('Darwin bootstrap validates canonical executable after unpack and before CLI; invalid path fails closed with owned cleanup (synthetic only).');})().catch(error=>{console.error(error);process.exitCode=1;});
