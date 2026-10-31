// Keep the extracted Windows DLL out of the main environment so it can be removed.
const { Worker } = require('node:worker_threads');
const source = `
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
(async () => {
 const binding = createRequire(workerData.executable)(workerData.file);
 const entry = new binding.AsyncEntry('EducationPerfected', 'login-v1', {linux:{store:'secret-service'}});
 let value;
 if (workerData.operation === 'read') value = await entry.getPassword();
 else if (workerData.operation === 'save') value = await entry.setPassword(workerData.value);
 else if (workerData.operation === 'delete') value = await entry.deletePassword();
 else throw new Error('Unsupported credential operation');
 parentPort.postMessage({ok:true,value});
})().catch(() => { parentPort.postMessage({ok:false}); });
`;
function createWindowsBinding(file, { WorkerClass = Worker, timeoutMs = 10000, onIdle = () => {} } = {}) {
 const live = new Set();
 const operation = (method, value) => new Promise((resolve,reject) => {
  let worker, result, failure, timer;
  let settled = false;
  const fail = error => { if (!settled) {settled=true;reject(error);} };
  const succeed = value => {if (!settled) {settled=true;resolve(value);} };
  const unavailable = () => Object.assign(new Error('Native credential operation failed.'),{code:'EP_NATIVE_STORE'});
  try { worker = new WorkerClass(source,{eval:true,workerData:{file,executable:process.execPath,operation:method,value}}); }
  catch { fail(unavailable()); return; }
  live.add(worker);
  // A reply is not completion: wait for exit so the DLL environment is gone.
  worker.on('message',message => { result=message; });
  worker.on('error',() => { failure=unavailable(); });
  worker.once('exit',code => {
   clearTimeout(timer);
   live.delete(worker);
   if (!live.size) onIdle();
   if (failure || code !== 0 || !result?.ok) fail(failure || unavailable());
   else succeed(result.value);
  });
  timer=setTimeout(() => {
   failure=unavailable();
   // A native call can delay exit indefinitely. Fail the caller, retain ownership
   // and forbid extraction cleanup until an actual exit confirms DLL unload.
   fail(failure);
   worker.unref();
   worker.terminate().catch(() => {});
  },timeoutMs);
 });
 return { hasLiveWorkers: () => live.size > 0, AsyncEntry: class {
  constructor(service, account) {
   if (service !== 'EducationPerfected' || account !== 'login-v1') throw Error('Unexpected credential record');
  }
  getPassword() { return operation('read'); }
  setPassword(value) { return operation('save',value); }
  deletePassword() { return operation('delete'); }
 }};
}
module.exports = { createWindowsBinding };
