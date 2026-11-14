// Synthetic files/store only. Never removes user data or real credentials.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {uninstallCommand,confirmUninstall}=require('../packaging/uninstall');
const {PassThrough}=require('node:stream');
const {acquireMaintenance,storageRoot}=require('../lib/storage-maintenance');
const {createRuntimeDirectory}=require('../lib/runtime-directory');
(async()=>{
 const lockedHome=fs.mkdtempSync(path.join(os.tmpdir(),'ep-maintenance-inert-'));
 try{const root=storageRoot(lockedHome),write=fs.writeFileSync;try{fs.writeFileSync=()=>{throw Error('inert lock write');};assert.throws(()=>acquireMaintenance(root),/inert lock write/);}finally{fs.writeFileSync=write;}assert.equal(fs.existsSync(path.join(root,'MAINTENANCE.lock')),false);const release=acquireMaintenance(root);assert.throws(()=>createRuntimeDirectory({home:lockedHome}),{code:'EEXIST'});release();const runtime=createRuntimeDirectory({home:lockedHome});assert.ok(runtime.remove(true));}finally{fs.rmSync(lockedHome,{recursive:true,force:true});}
 const ALL={login:true,data:true,browsers:true};
 const choicesFor=scenario=>({
  cancel:{login:false,data:false,browsers:false},
  'keep-browsers':{login:true,data:true,browsers:false},
  'login-only':{login:true,data:false,browsers:false},
 }[scenario]||ALL);
 for(const scenario of ['cancel','empty','safe','keep-browsers','login-only','other-run','download-lock','unknown','store-error','browser-symlink','cleanup-error']){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'ep-uninstall-inert-'));
  try{
   const runtime=createRuntimeDirectory({home});
   const root=path.join(fs.realpathSync(home),'.educationperfected'),browsers=path.join(root,'browsers');
   fs.mkdirSync(browsers);fs.writeFileSync(path.join(browsers,'inert-browser'),'keep-until-confirmed');
   if(scenario==='empty')fs.rmSync(browsers,{recursive:true});
   if(scenario==='other-run')fs.mkdirSync(path.join(root,'tmp','run-ABC123'));
   if(scenario==='download-lock')fs.writeFileSync(path.join(browsers,'version.lock'),'inert');
   if(scenario==='unknown')fs.writeFileSync(path.join(root,'unknown'),'inert');
   if(scenario==='browser-symlink'){fs.rmSync(browsers,{recursive:true});fs.mkdirSync(path.join(home,'unrelated'));fs.writeFileSync(path.join(home,'unrelated','keep'),'inert');fs.symlinkSync(path.join(home,'unrelated'),browsers,process.platform==='win32'?'junction':'dir');}
   const choices=choicesFor(scenario);
   let removed=0,output='';
   const perform=()=>uninstallCommand({home,ownDirectory:runtime.directory,cleanupOwn:async()=>{if(scenario==='cleanup-error')throw Error('inert');runtime.remove(true);},executable:'inert.exe',confirm:async()=>choices,output:{write:text=>{output+=text;}},store:{async remove(){removed++;if(scenario==='store-error')throw Error('inert');}}});
   const result=await perform();
   assert.equal(removed,choices.login?1:0,'store.remove called exactly when the login item is confirmed');
   if(scenario==='cancel'){
    assert.equal(result.cancelled,true);assert.ok(fs.existsSync(runtime.directory));assert.ok(fs.existsSync(browsers));
    assert.ok(output.includes('Uninstall cancelled'));
   }else{
    assert.ok(!output.includes('Uninstall cancelled'));
    if(scenario==='empty'||scenario==='safe'){assert.equal(result.incomplete,false);assert.equal(fs.existsSync(root),false,'everything chosen, everything removed, root gone');}
    else if(scenario==='keep-browsers'){assert.equal(result.incomplete,false);assert.ok(fs.existsSync(path.join(browsers,'inert-browser')),'browser downloads deliberately kept');assert.equal(fs.existsSync(runtime.directory),false);}
    else if(scenario==='login-only'){assert.equal(result.incomplete,false);assert.ok(fs.existsSync(runtime.directory));assert.ok(fs.existsSync(path.join(browsers,'inert-browser')));}
    else{
     assert.equal(result.incomplete,true,scenario);
     if(scenario==='browser-symlink')assert.ok(fs.existsSync(path.join(home,'unrelated','keep')),'symlinked browser dir never followed');
     else if(scenario==='download-lock')assert.ok(fs.existsSync(path.join(browsers,'inert-browser')),'live download lock retains the browsers');
     else assert.equal(fs.existsSync(browsers),false,'healthy browsers were chosen for removal')
    }
    assert.ok(output.includes('Delete the executable manually: inert.exe'));
   }
   assert.ok(!output.includes('Error:'));
  }finally{fs.rmSync(home,{recursive:true,force:true});}
 }
 // confirmUninstall parsing: empty answers and EOF default to No; pasted
 // multi-line input is buffered, not dropped; only y/yes counts as yes.
 for(const [typed,expected] of [
  ['\n\n\n',{login:false,data:false,browsers:false}],
  ['',{login:false,data:false,browsers:false}],
  ['y\nyes\nN\n',{login:true,data:true,browsers:false}],
  ['y\ny\ny\nextra\n',{login:true,data:true,browsers:true}],
  ['YES\nn\nmaybe\n',{login:true,data:false,browsers:false}],
 ]){
  const input=new PassThrough(),output=new PassThrough();
  input.isTTY=true;output.isTTY=true;
  const pending=confirmUninstall(input,output);
  if(typed)input.write(typed);
  input.end();
  assert.deepEqual(await pending,expected,'default-No parsing for '+JSON.stringify(typed));
 }
 const noTty=new PassThrough();await assert.rejects(()=>confirmUninstall(noTty,Object.assign(new PassThrough(),{isTTY:true})),/interactive terminal/);
 console.log('Uninstall per-item Y/n (default No), cancel keeps all, safe removal, live/unknown/download-lock retention, deliberate keeps, credential failure and prompt parsing (empty/EOF/paste) passed (synthetic).');
})().catch(error=>{console.error(error);process.exitCode=1;});
