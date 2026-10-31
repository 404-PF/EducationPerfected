const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWindowsBinding } = require('../lib/packaged-windows-binding');
(async () => {
 let worker, data;
 class FakeWorker extends EventEmitter {
  constructor(source,options) {super();worker=this;data=options.workerData;}
  unref() {}
  async terminate() {this.emit('exit',1);}
 }
 const binding=createWindowsBinding('/synthetic/keyring.node',{WorkerClass:FakeWorker,timeoutMs:100});
 const entry=new binding.AsyncEntry('EducationPerfected','login-v1');
 let resolved=false;
 const read=entry.getPassword().then(value=>{resolved=true;return value;});
 worker.emit('message',{ok:true,value:'synthetic'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(resolved,false);
 worker.emit('exit',0);assert.equal(await read,'synthetic');assert.equal(data.operation,'read');
 const save=entry.setPassword('synthetic-only');assert.equal(data.operation,'save');assert.equal(data.value,'synthetic-only');worker.emit('message',{ok:true});worker.emit('exit',0);await save;
 const remove=entry.deletePassword();assert.equal(data.operation,'delete');worker.emit('message',{ok:true,value:true});worker.emit('exit',0);assert.equal(await remove,true);
 const failed=entry.getPassword();worker.emit('error',new Error('secret fixture value'));worker.emit('exit',1);await assert.rejects(failed,error=>error.code==='EP_NATIVE_STORE'&&!error.message.includes('secret'));
 await assert.rejects(entry.getPassword(),{code:'EP_NATIVE_STORE'});
 assert.throws(()=>new binding.AsyncEntry('other','record'));
 class NeverExit extends FakeWorker { terminate() {return new Promise(()=>{});} }
 let idle=0;
 const stalled=createWindowsBinding('/synthetic/keyring.node',{WorkerClass:NeverExit,timeoutMs:10,onIdle:()=>{idle++;}});
 const late=new stalled.AsyncEntry('EducationPerfected','login-v1').getPassword();
 worker.emit('message',{ok:true,value:'must not resolve before exit'});
 await assert.rejects(late,{code:'EP_NATIVE_STORE'});
 assert.equal(stalled.hasLiveWorkers(),true);assert.equal(idle,0);
 worker.emit('exit',0);assert.equal(stalled.hasLiveWorkers(),false);assert.equal(idle,1);
 class ConstructorFailure {constructor(){throw new Error('secret constructor');}}
 const broken=createWindowsBinding('/synthetic/keyring.node',{WorkerClass:ConstructorFailure});
 await assert.rejects(new broken.AsyncEntry('EducationPerfected','login-v1').getPassword(),error=>error.code==='EP_NATIVE_STORE'&&!error.message.includes('secret'));
 assert.equal(broken.hasLiveWorkers(),false);
 console.log('Windows binding adapter: exit before reply resolution, fixed record/operations, sanitized failure and timeout termination passed (synthetic workers).');
})().catch(error=>{console.error(error);process.exitCode=1;});
