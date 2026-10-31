// Bootstrap checksum ordering proof with synthetic SEA assets, not native proof.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(expectedHash, declaredLength) {
 let unpackCalls=0,cliCalls=0,output='',timer;
 const bytes=Buffer.from('synthetic browser asset: deliberately not gzip'.repeat(4096));
 const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const original=Buffer.from(bytes);
 let complete;
 const finished=new Promise(resolve=>{complete=resolve;});
 const fakeProcess={execPath:process.execPath,argv:['fixture','fixture'],env:{},on(){},removeListener(){},exit(){throw Error('Unexpected exit');}};
 const load=id=>{
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify({length:declaredLength ?? bytes.length,sha256:expectedHash}):new ArrayBuffer(0),getRawAsset:key=>{assert.equal(key,'browser');return raw;}};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='modern-tar/fs')return {unpackTar:()=>{unpackCalls++;throw Error('Synthetic unpack checkpoint');}};
  if(id==='../bin/cli')return {runCli:async()=>{cliCalls++;}};
  if(id==='../lib/diagnostics')return {diagnostic:()=> 'Synthetic failure category'};
  return require(id);
 };
 // Executes only the fixed sibling repository bootstrap read above, never user input.
 vm.runInNewContext(source,{require:load,process:fakeProcess,Buffer,console:{error:text=>{output+=text;complete();},log(){}}},{filename:'synthetic-bootstrap.js'}); // NOSONAR: fixed repository source under test; no user-controlled code.
 try {await Promise.race([finished,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic bootstrap timeout')),3000);})]);}
 finally {clearTimeout(timer);}
 assert.deepEqual(Buffer.from(raw), original, 'Embedded raw asset must remain unchanged');
 return {unpackCalls,cliCalls,output};
}
(async()=>{
 const bad=await probe('0'.repeat(64));assert.equal(bad.unpackCalls,0);assert.equal(bad.cliCalls,0);assert.ok(bad.output.includes('EP_BROWSER_CHECKSUM'));
 const hash=createHash('sha256').update('synthetic browser asset: deliberately not gzip'.repeat(4096)).digest('hex');
 const wrongSize=await probe(hash,1);assert.equal(wrongSize.unpackCalls,0);assert.equal(wrongSize.cliCalls,0);
 const good=await probe(hash);assert.equal(good.unpackCalls,1);assert.equal(good.cliCalls,0);assert.ok(!good.output.includes('EP_BROWSER_CHECKSUM'));
 console.log('Synthetic bootstrap: mismatched checksum rejected before unpack/browser; matching checksum reaches unpack control.');
})().catch(error=>{console.error(error);process.exitCode=1;});
