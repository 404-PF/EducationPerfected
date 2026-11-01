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
for(const change of [{error:Error('private')},{signal:'SIGTERM'},{status:0},{stderr:'private'},{stdout:failed(failure).stdout+'private\n'},{stdout:failed(failure).stdout.replace(/\n/g,'\r\n')},{stdout:failed(failure).stdout.replace('CLOSED=true','CLOSED=false')},{stdout:''},{stdout:failed(failure).stdout.replace('OUTCOME=uncertainty','OUTCOME=success')}])assert.deepEqual(failureEvidence({...failed(failure),...change},'source',nonce),unknown);
// Closed key set, independent of wire key insertion order. No locale sorting.
const accepted={stage:'transport',driverStage:'archive-check-entered',transportStage:'console-child-nonzero',closed:true};
function permutations(values){return values.length?values.flatMap((value,index)=>permutations(values.filter((_,at)=>at!==index)).map(rest=>[value,...rest])):[[]];}
for(const keys of permutations(Object.keys(failure)))assert.deepEqual(failureEvidence(failed(Object.fromEntries(keys.map(key=>[key,failure[key]]))),'source',nonce),accepted);
for(const key of Object.keys(failure)) {
 const missing={...failure};delete missing[key];
 assert.deepEqual(failureEvidence(failed(missing),'source',nonce),unknown);
 // Keep count unchanged while replacing one required own key with an unknown key.
 assert.deepEqual(failureEvidence(failed({...missing,unexpected:'private'}),'source',nonce),unknown);
}
for(const extra of ['unexpected','__proto__','constructor','toString'])assert.deepEqual(failureEvidence(failed(Object.fromEntries([...Object.entries(failure),[extra,'private']])),'source',nonce),unknown);
for(const value of [null,[],['private'],'private',17,true]) {
 const result={...failed(failure),stdout:'EP_DIAGNOSTIC_JOB_FAILURE='+JSON.stringify(value)+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true\nEP_DIAGNOSTIC_JOB_OUTCOME=uncertainty\n'};
 assert.deepEqual(failureEvidence(result,'source',nonce),unknown);
}
const driver=fs.readFileSync(path.join(__dirname,'windows-startup-leg.js'),'utf8');
// Strip comments before checking exact marker calls; this remains a static source check,
// not proof of reachability against arbitrary dead-code insertion.
const executable=driver.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const ordered=["driverStage(mode,nonce,'cli-entry')","const root=validateLegRoot(process.argv[2],mode)","driverStage(mode,nonce,'cli-root-checked')"];
let previous=-1;for(const token of ordered){const at=executable.indexOf(token);assert.ok(at>previous);previous=at;}
const leg=executable.slice(executable.indexOf('async function runLeg'),executable.indexOf('module.exports'));
const boundaries=["throw Error('Diagnostic host guard')","driverStage(mode,nonce,'host-checked')",'root=validateLegRoot',"driverStage(mode,nonce,'leg-root-checked')","driverStage(mode,nonce,'archive-check-entered')",'await readVerifiedArchive',"driverStage(mode,nonce,'archive-verified')","driverStage(mode,nonce,'unpack-entered')",'await pipeline',"driverStage(mode,nonce,'unpacked')","driverStage(mode,nonce,'spawn-entered')",'child=spawn',"driverStage(mode,nonce,'spawn-returned')",'await connectAfterLoginReady',"driverStage(mode,nonce,'ready-observed')",'await boundedClose',"driverStage(mode,nonce,'owner-closed')",'result.cleanupCertain=true',"driverStage(mode,nonce,'leg-complete')"];
previous=-1;for(const token of boundaries){const at=leg.indexOf(token);assert.ok(at>previous,token);previous=at;}
// Python owns these tuples; compare their literal members to the JS literal arrays.
const panel=fs.readFileSync(path.join(__dirname,'windows-startup-panel.js'),'utf8');
function members(text,pattern){const match=text.match(pattern);assert.ok(match);return [...match[1].matchAll(/'([^']*)'/g)].map(value=>value[1]);}
const helper=fs.readFileSync(path.join(__dirname,'windows-startup-leg-helper.py'),'utf8'),transport=fs.readFileSync(path.join(__dirname,'windows-conpty.py'),'utf8');
assert.deepEqual(members(panel,/const driver=\[([^\n]+)\];/),['unknown',...members(helper,/DRIVER_STAGES=\(([^\n]+)\)/)]);
assert.deepEqual(members(panel,/const transport=\[([^\n]+)\];/),['unobserved',...members(transport,/FIXED_STAGES=frozenset\(\(([^\n]+)\)\)/)]);
console.log('Strict failure stage/status/closure privacy, literal allowlist sync and comment-stripped marker ordering checked (inert/static; no dead-code reachability or driver execution proof).');
