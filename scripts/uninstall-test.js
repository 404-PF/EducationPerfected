// Synthetic files/store only. Never removes user data or real credentials.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {uninstallCommand}=require('../packaging/uninstall');
const {acquireMaintenance,storageRoot}=require('../lib/storage-maintenance');
const {createRuntimeDirectory}=require('../lib/runtime-directory');
(async()=>{
 const lockedHome=fs.mkdtempSync(path.join(os.tmpdir(),'ep-maintenance-inert-'));
 try{const root=storageRoot(lockedHome),write=fs.writeFileSync;try{fs.writeFileSync=()=>{throw Error('inert lock write');};assert.throws(()=>acquireMaintenance(root),/inert lock write/);}finally{fs.writeFileSync=write;}assert.equal(fs.existsSync(path.join(root,'MAINTENANCE.lock')),false);const release=acquireMaintenance(root);assert.throws(()=>createRuntimeDirectory({home:lockedHome}),{code:'EEXIST'});release();const runtime=createRuntimeDirectory({home:lockedHome});assert.ok(runtime.remove(true));}finally{fs.rmSync(lockedHome,{recursive:true,force:true});}
 for(const scenario of ['cancel','empty','safe','other-run','download-lock','unknown','store-error','browser-symlink','cleanup-error']){
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
   let removed=0,output='';
   const perform=()=>uninstallCommand({home,ownDirectory:runtime.directory,cleanupOwn:async()=>{if(scenario==='cleanup-error')throw Error('inert');runtime.remove(true);},executable:'inert.exe',confirm:async()=>scenario!=='cancel',output:{write:text=>{output+=text;}},store:{async remove(){removed++;if(scenario==='store-error')throw Error('inert');}}});
   const result=await perform();
   assert.equal(removed,scenario==='cancel'?0:1);
   if(scenario==='cancel'){assert.ok(fs.existsSync(runtime.directory));assert.ok(fs.existsSync(browsers));}
   else if(scenario==='empty'){assert.equal(result.incomplete,false);assert.equal(fs.existsSync(root),false);}
   else{assert.equal(result.incomplete,true);if(scenario==='browser-symlink')assert.ok(fs.existsSync(path.join(home,'unrelated','keep')));else if(scenario!=='empty')assert.ok(fs.existsSync(path.join(browsers,'inert-browser')));}
   assert.ok(!output.includes('Error:'));
   if(scenario!=='cancel')assert.ok(output.includes('Delete the executable manually: inert.exe'));
  }finally{fs.rmSync(home,{recursive:true,force:true});}
 }
 console.log('Uninstall confirmation/cancel, safe removal, live/unknown/download-lock retention and credential failure passed (synthetic).');
})().catch(error=>{console.error(error);process.exitCode=1;});
