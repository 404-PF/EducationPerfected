// Fixed-source native-test cleanup regression. No DLL load or credential API.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(path.resolve(__dirname,'windows-native-unload-test.js'),'utf8');
(async()=>{
 const timers=new Map(),output=[];let nextId=0,complete,removed=false;
 const finished=new Promise(resolve=>{complete=resolve;});
 class SyntheticWorker extends EventEmitter {
  constructor(){super();queueMicrotask(()=>this.emit('message','loaded'));}
  unref(){} terminate(){return Promise.resolve();} postMessage(){throw new Error('Must not reach native close protocol');}
 }
 const fakeProcess={platform:'win32',arch:'x64'};
 const load=id=>{
  if(id==='node:worker_threads')return {Worker:SyntheticWorker};
  if(id==='node:fs')return {mkdtempSync:()=>'/synthetic-owned-root',copyFileSync(){},unlinkSync(){},rmSync(){removed=true;}};
  assert.ok(id.startsWith('node:'));return require(id);
 };
 load.resolve=id=>{assert.equal(id,'@napi-rs/keyring-win32-x64-msvc');return '/synthetic-keyring.node';};
 vm.runInNewContext(source,{require:load,process:fakeProcess,console:{log(){},error:line=>{output.push(String(line));if(fakeProcess.exitCode===undefined)queueMicrotask(complete);}},
  setTimeout:(callback,milliseconds)=>{const id=++nextId;timers.set(id,milliseconds);if(milliseconds===2000)queueMicrotask(callback);return id;},clearTimeout:id=>{timers.delete(id);}}); // NOSONAR: fixed repository test source with inert worker/filesystem/timers; no external code or native load.
 await finished;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fakeProcess.exitCode,1,'Original loaded-DLL-lock assertion failure remains fatal');
 assert.equal(removed,false,'Unconfirmed worker retains extraction ownership');
 assert.ok(output.some(line=>line.includes('owned test extraction retained')));
 assert.equal([...timers.values()].filter(milliseconds=>milliseconds===10000).length,0,'Failed native proof must clear its 10-second timer');
 console.log('Windows unload-test failure clears timeout and retains unconfirmed extraction (fixed-source synthetic worker, no native proof).');
})().catch(error=>{console.error(error);process.exitCode=1;});
