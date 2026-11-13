// Fixed repository bootstrap with inert assets/OS; never launches a browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(boot,diagnostic,badHash=false) {
 const bytes=Buffer.from('synthetic identity archive'),manifest={length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),browserVersion:'156.0.8078.47',executable:'chrome.exe'};
 if(badHash)manifest.sha256='0'.repeat(64);
 const output=[],order=[];let loads=0;
 const process={platform:'linux',execPath:'fixed-node',argv:['fixed','fixed'],env:{EP_TEST_BOOT:boot,EP_TEST_BROWSER_IDENTITY:diagnostic},on(){},removeListener(){}};
 const load=id=>{
  if(id==='../lib/runtime-directory')return {createRuntimeDirectory:()=>({directory:'/fixed-owned',remove:safe=>{assert.ok(safe);order.push('cleanup');return true;}})};
  if(id==='node:fs')return {mkdtempSync:()=>'/fixed-owned',chmodSync(){},writeFileSync(){},rmSync(){order.push('cleanup');}};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify(manifest):new ArrayBuffer(0),getRawAsset:()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='node:stream/promises')return {pipeline:async()=>{order.push('unpack');}};
  if(id==='modern-tar/fs')return {unpackTar:()=>({})};
  if(id==='../lib/test-browser-identity'){loads++;return {emitBrowserIdentity:value=>require('../lib/test-browser-identity').emitBrowserIdentity(value,line=>{order.push('receipt');output.push(line);})};}
  if(id==='../bin/cli')return {runCli:async()=>{order.push('cli');}};
  if(id==='../lib/diagnostics')return {diagnostic:()=> 'fixed failure'};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process,Buffer,console:{log:line=>output.push(line),error:line=>output.push(line)}},{timeout:1000}); // NOSONAR: literal repository bootstrap source only; fixed inert assets/fs/process and fake CLI, no user/env/network code input.
 for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));
 return {loads,order,output,process};
}
(async()=>{
 for(const pair of [['0','0'],['0','1'],['1','0']]) {const r=await probe(...pair);assert.equal(r.loads,0);assert.ok(!r.output.some(line=>line.startsWith('EP_TEST_BROWSER_IDENTITY=')));assert.deepEqual(r.order,['unpack','cli','cleanup']);}
 const good=await probe('1','1');assert.equal(good.loads,1);assert.deepEqual(good.order,['unpack','receipt','cli','cleanup']);assert.equal(good.output.length,1);assert.ok(!good.output[0].includes('/fixed-owned'));
 const bad=await probe('1','1',true);assert.equal(bad.loads,0);assert.deepEqual(bad.order,['cleanup']);assert.ok(bad.output[0].includes('EP_BROWSER_CHECKSUM'));
 const normalized=source.replace(/\r\n/g,'\n');const start=normalized.indexOf("if (process.env.EP_TEST_BOOT === '1' && process.env.EP_TEST_BROWSER_IDENTITY === '1')");const gate=normalized.slice(start,normalized.indexOf('\n    }',start));
 assert.ok(gate.includes('emitBrowserIdentity(manifest)'));assert.ok(!gate.includes('await '));
 assert.ok(normalized.indexOf('hash.digest(\'hex\') !== manifest.sha256')<normalized.indexOf('emitBrowserIdentity(manifest)'));
 console.log('Actual fixed bootstrap: dual gate excludes receipt imports on normal boot, checksum failure forbids receipt/unpack/CLI, receipt after unpack and before CLI, no new await/secret path (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
