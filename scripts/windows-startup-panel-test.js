// Inert receipt/result/probe tests only; never invokes runPanel or a child.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {strictJobReceipt,readBoundResult,probeRootRename,finishPanel}=require('./windows-startup-panel');
const nonce='a'.repeat(64),record={nonce,mode:'source',receipt:{},observedVersion:'Chrome/156.0.8078.47',owned:true,ready:true,cleanupCertain:true,navigationCategory:'unobserved'};
const good={status:0,signal:null,stderr:'',stdout:'EP_DIAGNOSTIC_JOB_NONCE='+nonce+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true\nEP_DIAGNOSTIC_JOB_OUTCOME=success\n'};
assert.equal(strictJobReceipt(good,nonce),true);
for(const bad of [{status:20},{signal:'SIGTERM'},{error:Error('private')},{stderr:'private'},{stdout:good.stdout.replace(/\n/g,'\r\n')},{stdout:good.stdout+'extra\n'},{stdout:good.stdout.replace('true','false')},{stdout:good.stdout.replace(nonce,'b'.repeat(64))}])assert.equal(strictJobReceipt({...good,...bad},nonce),false);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-panel-inert-'));
try {
 const owned=path.join(root,'source');fs.mkdirSync(owned);const file=path.join(owned,'result.json');
 assert.throws(()=>readBoundResult(owned,'source',nonce));
 for(const bad of [{nonce:'b'.repeat(64)},{mode:'sea'},{cleanupCertain:false},{unknown:'private'},{navigationCategory:'other'}]){fs.writeFileSync(file,JSON.stringify({...record,...bad}));assert.throws(()=>readBoundResult(owned,'source',nonce));}
 fs.writeFileSync(file,JSON.stringify(record));assert.deepEqual(readBoundResult(owned,'source',nonce),record);
 fs.writeFileSync(path.join(owned,'failure.json'),'{}');assert.throws(()=>readBoundResult(owned,'source',nonce));fs.unlinkSync(path.join(owned,'failure.json'));
 assert.equal(probeRootRename(owned),true);assert.ok(fs.existsSync(file));fs.mkdirSync(owned+'-removability-probe');assert.throws(()=>probeRootRename(owned));
 const success={outcome:'not-reproduced-in-one-instrumented-sample',seaAttempted:true};
 assert.deepEqual(finishPanel(root,success,()=>{throw Error('private fs failure');}),{outcome:'uncertainty',leg:'cleanup',seaAttempted:true});
 let removed=false;assert.equal(finishPanel(root,success,()=>{removed=true;}),success);assert.equal(removed,true);
 console.log('Strict nonce/status/LF/duplicate receipt, stale/missing/conflicting result and negative-only root rename probe controls passed (inert; no tree-closure proof).');
}finally{fs.rmSync(root,{recursive:true,force:true});}
