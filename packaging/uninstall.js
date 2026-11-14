// Destructive maintenance requires local per-item confirmation; every prompt
// defaults to No (keeping the item). No native binding is loaded here;
// bootstrap supplies its owned store and cleanup callback.
const fs=require('node:fs'),path=require('node:path');
const {storageRoot,acquireMaintenance}=require('../lib/storage-maintenance');
function askYesNo(rl,output,question){
 output.write(question);
 return new Promise(resolve=>{rl.once('line',line=>resolve(/^\s*y(es)?\s*$/i.test(line)));});
}
async function confirmUninstall(input=process.stdin,output=process.stdout){
 if(!input.isTTY||!output.isTTY)throw new Error('Uninstall requires an interactive terminal');
 output.write('Close every other EducationPerfected copy (including source CLI) and its Chrome window first.\n');
 const rl=require('node:readline').createInterface({input,output});
 try{
  const login=await askYesNo(rl,output,'Remove the saved login from the OS credential store? [y/N] ');
  const data=await askYesNo(rl,output,'Remove EducationPerfected app data (settings and temporary files)? [y/N] ');
  const browsers=await askYesNo(rl,output,'Remove downloaded browsers (about 200 MB)? [y/N] ');
  return {login,data,browsers};
 }finally{rl.close();}
}
function realDirectory(file){const stat=fs.lstatSync(file);return stat.isDirectory()&&!stat.isSymbolicLink();}
function safeRuntimeRoot(tmp,own){
 try{
  if(!realDirectory(tmp))return false;
  for(const name of fs.readdirSync(tmp)){
   const file=path.join(tmp,name);
   if(file===own)continue;
   // Safe stale directories are swept by startup before uninstall. Anything
   // remaining may belong to a live/uncertain browser; do not guess.
   return false;
  }
  return true;
 }catch(error){return error.code==='ENOENT';}
}
async function uninstallCommand({store,ownDirectory,cleanupOwn,home,executable=process.execPath,confirm=confirmUninstall,output=process.stdout}={}){
 const choices=await confirm();
 if(!choices||(!choices.login&&!choices.data&&!choices.browsers)){output.write('Uninstall cancelled; no app data, browser downloads or saved login removed.\n');return {cancelled:true};}
 const root=storageRoot(home),release=acquireMaintenance(root);
 let incomplete=false;
 try{
  // Credential deletion is authorized by the same explicit local confirmation.
  if(choices.login){
   try{await store.remove();output.write('App saved login removed (or none existed).\n');}
   catch{incomplete=true;output.write('Saved login removal failed; unlock the native OS credential store and retry.\n');}
  }
  const tmp=path.join(root,'tmp'),browsers=path.join(root,'browsers');
  if(choices.browsers&&fs.existsSync(browsers)){
   let safe=realDirectory(browsers);
   try{if(safe&&fs.readdirSync(browsers).some(name=>name.endsWith('.lock')||name.startsWith('.download-')))safe=false;}catch{safe=false;}
   if(safe){fs.rmSync(browsers,{recursive:true});output.write('Downloaded browsers removed.\n');}
   else{incomplete=true;output.write('Browser downloads retained: a live download lock or an unexpected path. Close every copy and inspect before removing manually: '+browsers+'\n');}
  }
  if(choices.data){
   let safe=safeRuntimeRoot(tmp,ownDirectory);
   // Unknown root entries are not recursively deleted, nor followed as links.
   try{if(fs.readdirSync(root).some(name=>!['tmp','browsers','MAINTENANCE.lock'].includes(name)))safe=false;}catch{safe=false;}
   if(!safe){incomplete=true;output.write('Live/uncertain runtime files or unknown app data retained. Close all app/browser processes and inspect before retrying.\n');}
   try{await cleanupOwn();}catch{incomplete=true;output.write('Owned runtime cleanup failed; retained for inspection.\n');}
   // Only remove empty containers. No recursive root or temp deletion.
   try{fs.rmdirSync(tmp);}catch(error){if(error.code!=='ENOENT')incomplete=true;}
  }
 }finally{release();}
 // Removing the root is best-effort: entries the user chose to keep make it
 // non-empty, which is deliberate, not a failure.
 try{fs.rmdirSync(root);}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTEMPTY'&&error.code!=='ENOTDIR')incomplete=true;}
 output.write((incomplete?'Uninstall incomplete; retained data remains.':'Requested items removed.')+'\nDelete the executable manually: '+executable+'\n');
 return {incomplete};
}
module.exports={uninstallCommand,confirmUninstall,safeRuntimeRoot};
