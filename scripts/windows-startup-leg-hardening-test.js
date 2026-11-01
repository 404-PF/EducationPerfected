// Inert host/root and exclusive-copy controls. No runLeg/browser/native APIs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {checkedCliRoot,copySeaExecutable}=require('./windows-startup-leg');
const originalPlatform=Object.getOwnPropertyDescriptor(process,'platform'),originalArch=Object.getOwnPropertyDescriptor(process,'arch');
const env={...process.env},saved={lstatSync:fs.lstatSync,statSync:fs.statSync,realpathSync:fs.realpathSync};
try {
 for(const host of [{platform:'linux',arch:'x64',actions:'true',runner:'Windows',environment:'github-hosted'},{platform:'win32',arch:'arm64',actions:'true',runner:'Windows',environment:'github-hosted'},{platform:'win32',arch:'x64',actions:'false',runner:'Windows',environment:'github-hosted'},{platform:'win32',arch:'x64',actions:'true',runner:'Linux',environment:'github-hosted'},{platform:'win32',arch:'x64',actions:'true',runner:'Windows',environment:'self-hosted'}]) {
  Object.defineProperty(process,'platform',{value:host.platform});Object.defineProperty(process,'arch',{value:host.arch});Object.assign(process.env,{GITHUB_ACTIONS:host.actions,RUNNER_OS:host.runner,RUNNER_ENVIRONMENT:host.environment});let calls=0;
  for(const name of Object.keys(saved))fs[name]=()=>{calls++;throw Error('Unexpected metadata');};
  assert.throws(()=>checkedCliRoot(path.resolve('private-root'),'source'),{message:'Diagnostic host guard'});assert.equal(calls,0);Object.assign(fs,saved);
 }
 Object.assign(fs,saved);Object.defineProperty(process,'platform',{value:'win32'});Object.defineProperty(process,'arch',{value:'x64'});Object.assign(process.env,{GITHUB_ACTIONS:'true',RUNNER_OS:'Windows',RUNNER_ENVIRONMENT:'github-hosted'});
 const {createPanelRoot}=require('./windows-startup-root');const panel=createPanelRoot();
 try{const leg=path.join(panel,'source');fs.mkdirSync(leg);assert.equal(checkedCliRoot(leg,'source'),fs.realpathSync(leg));assert.throws(()=>checkedCliRoot(leg,'sea'),{message:'Diagnostic root uncertainty'});}finally{fs.rmSync(panel,{recursive:true,force:true});}
}finally{Object.defineProperty(process,'platform',originalPlatform);Object.defineProperty(process,'arch',originalArch);for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);Object.assign(fs,saved);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-exclusive-inert-'));
try {
 const from=path.join(root,'from'),to=path.join(root,'to');fs.writeFileSync(from,'candidate');fs.writeFileSync(to,'existing');
 // Directly execute the same helper used by the SEA leg, with inert paths.
 const invoke=(_fs,_path,build,executable)=>copySeaExecutable(build,executable);
 const asset=path.join(root,'educationperfected.exe');fs.copyFileSync(from,asset);
 assert.throws(()=>invoke(fs,path,root,to),{code:'EEXIST'});assert.equal(fs.readFileSync(to,'utf8'),'existing');
 fs.unlinkSync(to);invoke(fs,path,root,to);assert.equal(fs.readFileSync(to,'utf8'),'candidate');
 if(process.platform!=='win32') {const target=path.join(root,'target');fs.writeFileSync(target,'untouched');fs.unlinkSync(to);fs.symlinkSync(target,to);assert.throws(()=>invoke(fs,path,root,to),{code:'EEXIST'});assert.equal(fs.readFileSync(target,'utf8'),'untouched');}
 // Source binding only: these assertions do not prove arbitrary dead-code reachability.
 const source=fs.readFileSync(path.join(__dirname,'windows-startup-leg.js'),'utf8');
 const executableSource=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 assert.equal((executableSource.match(/copySeaExecutable\(build,executable\);/g)||[]).length,1);
 assert.ok(executableSource.includes("else {executable=path.join(root,'educationperfected.exe');copySeaExecutable(build,executable);args=[];}"));
 assert.equal((executableSource.match(/fs\.copyFileSync\(/g)||[]).length,1);
 assert.equal((executableSource.match(/fs\.writeFileSync\(/g)||[]).length,2,'Only result/failure receipt writes, no executable overwrite');
 assert.equal((executableSource.match(/fs\.writeFileSync\(path\.join\(root,'(?:result|failure)\.json'\)/g)||[]).length,2);
 console.log('Inert host rejection before root metadata and exclusive-copy existing-file/symlink no-overwrite passed. No Windows ACL/race/native/browser proof.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
