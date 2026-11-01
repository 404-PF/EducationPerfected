// Deliberate manual entrypoint only. Not wired to push/workflow/test scripts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {createPanelRoot}=require('./windows-startup-root');
const {verifyArchive,runStagedPanel}=require('./startup-browser-identity');
function strictJobReceipt(result,nonce) {
 return /^[a-f0-9]{64}$/.test(nonce) && !result.error && result.status===0 && result.signal===null && result.stderr==='' &&
  result.stdout==='EP_DIAGNOSTIC_JOB_NONCE='+nonce+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true\nEP_DIAGNOSTIC_JOB_OUTCOME=success\n';
}
function failureEvidence(result,mode,nonce) {
 const unknown={stage:'unknown',driverStage:'unknown',transportStage:'unobserved',closed:'unknown'};
 if(result.error||result.status!==20||result.signal!==null||result.stderr!==''||typeof result.stdout!=='string'||result.stdout.includes('\r'))return unknown;
 const lines=result.stdout.split('\n');
 if(lines.length!==4||lines[3]!==''||lines[2]!=='EP_DIAGNOSTIC_JOB_OUTCOME=uncertainty'||!lines[0].startsWith('EP_DIAGNOSTIC_JOB_FAILURE='))return unknown;
 try {
  const value=JSON.parse(lines[0].slice('EP_DIAGNOSTIC_JOB_FAILURE='.length));
  const stages=['helper-entry','arguments','root-check','node-check','driver-check','transport','result-check','result-parse','result-binding'];
  const driver=['unknown','cli-entry','cli-root-checked','host-checked','leg-root-checked','archive-check-entered','archive-verified','unpack-entered','unpacked','spawn-entered','spawn-returned','ready-observed','owner-closed','leg-complete'];
  const transport=['unobserved','system-identity','host-guard','node-identity','pipe-create','console-create','attribute-size','attribute-init','attribute-console','job-create','job-limit','process-create','job-assignment-pre-resume','process-resume','process-timeout','process-exit-code','console-status-missing','console-input-echoed','Requires x64 pointer ABI','Windows SDK ABI mismatch','process-exit-unconfirmed','job-exit-unconfirmed','console-eof-unconfirmed','console-writer-unconfirmed','console-prompt-order','console-duplicate-prompt','console-prompt-count','console-prompt','console-read','console-write','console-short-write','console-output-limit','job-query','job-terminate','suspended-process-terminate','handle-close','console-child-nonzero','console-command-failed'];
  if(Object.keys(value).sort().join(',')!=='closed,driverStage,mode,nonce,stage,transportStage'||value.nonce!==nonce||value.mode!==mode||!stages.includes(value.stage)||!driver.includes(value.driverStage)||!transport.includes(value.transportStage)||typeof value.closed!=='boolean'||lines[1]!=='EP_DIAGNOSTIC_JOB_OBSERVED_CLOSED='+value.closed)return unknown;
  return {stage:value.stage,driverStage:value.driverStage,transportStage:value.transportStage,closed:value.closed};
 }catch{return unknown;}
}
function readBoundResult(owned,mode,nonce) {
 if(fs.readdirSync(owned).filter(name=>name==='result.json'||name==='failure.json').join(',')!=='result.json')throw Error('Diagnostic missing or conflicting result');
 const file=path.join(owned,'result.json');const stat=fs.lstatSync(file);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>4096)throw Error('Diagnostic result ownership uncertainty');
 const record=JSON.parse(fs.readFileSync(file,'utf8'));
 const keys=['nonce','mode','receipt','observedVersion','owned','ready','cleanupCertain','navigationCategory'];
 if(Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key))||record.nonce!==nonce||record.mode!==mode||record.cleanupCertain!==true||record.navigationCategory!=='unobserved')throw Error('Diagnostic result binding uncertainty');
 return record;
}
function probeRootRename(owned) {
 // A negative lock indicator only. Success is NOT proof that no process survived.
 const probe=owned+'-removability-probe';
 if(fs.existsSync(probe))throw Error('Diagnostic unexpected probe root');
 fs.renameSync(owned,probe);fs.renameSync(probe,owned);
 return true;
}
function finishPanel(root,outcome,remove=directory=>fs.rmSync(directory,{recursive:true,force:true})) {
 if(outcome.outcome!=='not-reproduced-in-one-instrumented-sample')return outcome;
 try {remove(root);return outcome;}catch{return {outcome:'uncertainty',leg:'cleanup',seaAttempted:true};}
}
async function runPanel() {
 if(process.argv.length!==2||process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.RUNNER_OS!=='Windows')throw Error('Diagnostic panel host guard');
 const python=process.env.EP_FIXTURE_PYTHON;
 if(!python||!path.isAbsolute(python)||!fs.statSync(python).isFile())throw Error('Diagnostic Python identity uncertainty');
 const build=path.resolve(__dirname,'../build/windows-x64');
 let expected;
 try {expected=await verifyArchive(path.join(build,'browser.tar.gz'),JSON.parse(fs.readFileSync(path.join(build,'manifest.json'),'utf8')));}
 catch {console.log('EP_DIAGNOSTIC_PANEL='+JSON.stringify({outcome:'uncertainty',leg:'identity',seaAttempted:false}));process.exitCode=1;return;}
 const root=createPanelRoot();
 const leg=mode=>async()=>{
  const nonce=randomBytes(32).toString('hex');
  const owned=path.join(root,mode);fs.mkdirSync(owned,{mode:0o700});
  const helper=path.resolve(__dirname,'windows-startup-leg-helper.py');
  const result=spawnSync(python,[helper,owned,process.execPath,mode,nonce],{encoding:'utf8',timeout:155000,maxBuffer:4096,windowsHide:true});
  // No raw helper/child output or filesystem exceptions are printed.
  if(!strictJobReceipt(result,nonce)) {
   console.log('EP_DIAGNOSTIC_EARLY_EVIDENCE='+JSON.stringify(failureEvidence(result,mode,nonce)));
   let category='unobserved';
   try {
    const file=path.join(owned,'failure.json');const stat=fs.lstatSync(file);
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=4096) {
     const failed=JSON.parse(fs.readFileSync(file,'utf8'));
     if(failed.nonce===nonce&&failed.mode===mode&&['navigation-timeout','target-detached','browser-disconnected','protocol-error','other'].includes(failed.navigationCategory))category=failed.navigationCategory;
    }
   }catch{}
   console.log('EP_DIAGNOSTIC_FAILURE_CATEGORY='+category);
   throw Error('Diagnostic observed supervisor closure uncertainty');
  }
  const record=readBoundResult(owned,mode,nonce);probeRootRename(owned);return record;
 };
 const outcome=await runStagedPanel(leg('source'),leg('sea'),expected);
 const finalOutcome=finishPanel(root,outcome);
 console.log('EP_DIAGNOSTIC_PANEL='+JSON.stringify(finalOutcome));
 if(finalOutcome.outcome==='uncertainty'){console.log('EP_DIAGNOSTIC_ROOT_RETAINED=true');process.exitCode=1;}
}
module.exports={failureEvidence,strictJobReceipt,readBoundResult,probeRootRename,finishPanel,runPanel};
if(require.main===module)runPanel().catch(()=>{console.log('EP_DIAGNOSTIC_PANEL='+JSON.stringify({outcome:'uncertainty',leg:'preparation',seaAttempted:false}));process.exitCode=1;});
