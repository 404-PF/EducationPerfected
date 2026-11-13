// Destructive maintenance requires local typed confirmation. No native binding
// is loaded here; bootstrap supplies its owned store and cleanup callback.
const fs=require('node:fs'),path=require('node:path');
const {storageRoot,acquireMaintenance}=require('../lib/storage-maintenance');
async function confirmUninstall(input=process.stdin,output=process.stdout){
 if(!input.isTTY||!output.isTTY)throw new Error('Uninstall requires an interactive terminal');
 output.write('Close every other EducationPerfected copy (including source CLI) and its Chrome window first. Remove app browser downloads, safe temporary data and saved login? Type uninstall to confirm: ');
 const rl=require('node:readline').createInterface({input,output});
 try{return await new Promise(resolve=>{rl.once('line',line=>resolve(line.trim()==='uninstall'));rl.once('close',()=>resolve(false));});}finally{rl.close();}
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
 if(!await confirm()){output.write('Uninstall cancelled; no app data or saved login removed.\n');return {cancelled:true};}
 const root=storageRoot(home),release=acquireMaintenance(root);
 let incomplete=false;
 try{
  // Credential deletion is authorized by the same explicit local confirmation.
  try{await store.remove();output.write('App saved login removed (or none existed).\n');}
  catch{incomplete=true;output.write('Saved login removal failed; unlock Credential Manager and retry.\n');}
  const tmp=path.join(root,'tmp'),browsers=path.join(root,'browsers');
  let safe=safeRuntimeRoot(tmp,ownDirectory);
  try{
   if(fs.existsSync(browsers)){
    if(!realDirectory(browsers)||fs.readdirSync(browsers).some(name=>name.endsWith('.lock')||name.startsWith('.download-')))safe=false;
   }
  }catch{safe=false;}
  // Unknown root entries are not recursively deleted, nor followed as links.
  if(fs.readdirSync(root).some(name=>!['tmp','browsers','MAINTENANCE.lock'].includes(name)))safe=false;
  if(safe){
   try{if(fs.existsSync(browsers))fs.rmSync(browsers,{recursive:true});}
   catch{incomplete=true;output.write('Browser files could not all be removed; retained for inspection.\n');}
  }else{incomplete=true;output.write('Live/uncertain runtime files, download locks or unknown app data retained. Close all app/browser processes and inspect before retrying.\n');}
  await cleanupOwn();
  // Only remove empty containers. No recursive root or temp deletion.
  for(const directory of [tmp])try{fs.rmdirSync(directory);}catch(error){if(error.code!=='ENOENT'){incomplete=true;}}
 }finally{release();}
 try{fs.rmdirSync(root);}catch(error){if(error.code!=='ENOENT')incomplete=true;}
 output.write((incomplete?'Uninstall incomplete; retained data remains.':'App-owned data removed.')+'\nDelete the executable manually: '+executable+'\n');
 return {incomplete};
}
module.exports={uninstallCommand,confirmUninstall,safeRuntimeRoot};
