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
const {failureEvidence}=require('./windows-startup-panel');
function failed(value) {return {status:20,signal:null,stderr:'',stdout:'EP_DIAGNOSTIC_JOB_FAILURE='+JSON.stringify(value)+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED='+value.closed+'\nEP_DIAGNOSTIC_JOB_OUTCOME=uncertainty\n'};}
const failure={nonce,mode:'source',stage:'transport',driverStage:'archive-check-entered',transportStage:'console-child-nonzero',closed:true};
assert.deepEqual(failureEvidence(failed(failure),'source',nonce),{stage:'transport',driverStage:'archive-check-entered',transportStage:'console-child-nonzero',closed:true});
const unknown={stage:'unknown',driverStage:'unknown',transportStage:'unobserved',closed:'unknown'};
assert.deepEqual(failureEvidence({...failed(failure),stdout:failed(failure).stdout.replace('}\n','}\r\n')},'source',nonce),unknown);
for(const change of [{nonce:'b'.repeat(64)},{mode:'sea'},{stage:'private'},{driverStage:'private'},{transportStage:'private'},{closed:'true'},{extra:'private'}])assert.deepEqual(failureEvidence(failed({...failure,...change}),'source',nonce),unknown);
for(const change of [{error:Error('private')},{signal:'SIGTERM'},{status:0},{stderr:'private'},{stdout:failed(failure).stdout+'private\n'},{stdout:failed(failure).stdout.replace(/\n/g,'\r\n')},{stdout:failed(failure).stdout.replace('CLOSED=true','CLOSED=false')},{stdout:''}])assert.deepEqual(failureEvidence({...failed(failure),...change},'source',nonce),unknown);
const driver=fs.readFileSync(path.join(__dirname,'windows-startup-leg.js'),'utf8');
const ordered=["driverStage(mode,nonce,'cli-entry')","const root=validateLegRoot(process.argv[2],mode)","driverStage(mode,nonce,'cli-root-checked')"];
let previous=-1;for(const token of ordered){const at=driver.indexOf(token);assert.ok(at>previous);previous=at;}
const leg=driver.slice(driver.indexOf('async function runLeg'),driver.indexOf('module.exports'));
const boundaries=["throw Error('Diagnostic host guard')","'host-checked'",'root=validateLegRoot',"'leg-root-checked'","'archive-check-entered'",'await readVerifiedArchive',"'archive-verified'","'unpack-entered'",'await pipeline',"'unpacked'","'spawn-entered'",'child=spawn',"'spawn-returned'",'await connectAfterLoginReady',"'ready-observed'",'await boundedClose',"'owner-closed'",'result.cleanupCertain=true',"'leg-complete'"];
previous=-1;for(const token of boundaries){const at=leg.indexOf(token);assert.ok(at>previous,token);previous=at;}
console.log('Strict failure stage/status/closure privacy and actual-source marker boundary ordering checked (inert/static; no driver execution).');
