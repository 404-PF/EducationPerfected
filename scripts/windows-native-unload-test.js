// Real Windows DLL load/unload only. No credential record or OS store is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
(async () => {
 if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 proof requires its native host');
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'ep-native-unload-'));
 let worker, confirmedExit=false, exitObserved, timer;
 try {
  const file = path.join(root,'keyring.node');
  fs.copyFileSync(require.resolve('@napi-rs/keyring-win32-x64-msvc'),file);
  // Fixed source and fixed build dependency, never external/user-supplied code.
  const source = `const {parentPort,workerData}=require('node:worker_threads');
  const binding=require(workerData.file);
  if(typeof binding.AsyncEntry !== 'function') throw Error('Missing native API');
  parentPort.once('message',()=>parentPort.close());
  parentPort.postMessage('loaded');`;
  await new Promise((resolve,reject)=>{
   worker = new Worker(source,{eval:true,workerData:{file}});
   exitObserved = new Promise(done=>worker.once('exit',()=>{confirmedExit=true;done();}));
   worker.once('message',message=>{
    try {
     assert.equal(message,'loaded');
     assert.throws(()=>fs.unlinkSync(file),error=>['EPERM','EBUSY','EACCES'].includes(error.code),'Loaded DLL must remain locked before worker exit');
     worker.postMessage('close');
    } catch(error) {reject(error);worker.unref();worker.terminate().catch(()=>{});}
   });
   worker.on('error',error=>{clearTimeout(timer);reject(error);});
   worker.once('exit',code=>{confirmedExit=true;clearTimeout(timer);if(code===0)resolve();else reject(Error('Native worker load failed'));});
   timer=setTimeout(()=>{worker.unref();worker.terminate().catch(()=>{});reject(Error('Native worker exit unconfirmed'));},10000);
  });
  fs.unlinkSync(file);assert.equal(fs.existsSync(file),false);
  console.log('Windows DLL locked while loaded, worker exited, copied DLL deleted; no credential API called (source-host proof only).');
 } finally {
  clearTimeout(timer);
  if (worker && !confirmedExit) {
   let deadline;
   worker.unref();worker.terminate().catch(()=>{});
   try { await Promise.race([exitObserved,new Promise(resolve=>{deadline=setTimeout(resolve,2000);})]); }
   finally {clearTimeout(deadline);}
  }
  if (!worker || confirmedExit) fs.rmSync(root,{recursive:true,force:true});
  else console.error('Native worker exit unconfirmed; owned test extraction retained.');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
