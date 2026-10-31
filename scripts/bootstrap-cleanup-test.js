// Execute the fixed repository bootstrap with inert assets and failed owned cleanup.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(signal) {
 const listeners=new Map();let output='',finished;
 const done=new Promise(resolve=>{finished=resolve;});
 const fakeProcess={platform:'linux',execPath:process.execPath,argv:['fixture','fixture','--help'],env:{},
  on(name,handler){listeners.set(name,handler);},removeListener(name){listeners.delete(name);},
  exit(code){this.exitCode=code;listeners.get('exit')?.();}};
 const load=id=>{
  if(id==='node:fs')return {mkdtempSync:()=>'/synthetic-owned-root',chmodSync(){},writeFileSync(){},rmSync(){throw Object.assign(Error('private path'),{code:'EPERM'});}};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?'{}':new ArrayBuffer(0)};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='modern-tar/fs')return {};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process:fakeProcess,Buffer,console:{log(){if(signal)listeners.get(signal)();},error(text){output+=text;finished();}}},{filename:'fixed-bootstrap-cleanup.js'}); // NOSONAR: fixed repository bootstrap with inert dependencies; no external input.
 await done;await new Promise(resolve=>setImmediate(resolve));
 assert.ok(output.includes('Owned extraction cleanup failed'));
 assert.ok(!output.includes('private path'));
 return fakeProcess.exitCode;
}
(async()=>{
 assert.equal(await probe(),1);
 for(const [signal,code]of [['SIGINT',130],['SIGTERM',143],['SIGHUP',129]])assert.equal(await probe(signal),code);
 console.log('Actual bootstrap cleanup failure marks clean exit failed and preserves INT/TERM/HUP codes (inert VM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
