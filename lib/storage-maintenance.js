// Serializes app startup allocation against destructive maintenance. A stale
// lock is retained for inspection, never stolen based only on owner PID.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function storageRoot(home=os.homedir()){
 const canonical=fs.realpathSync(home);
 const root=path.join(canonical,'.educationperfected');
 try{fs.mkdirSync(root,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('App root must be a real directory');
 return fs.realpathSync(root);
}
function acquireMaintenance(root){
 const file=path.join(root,'MAINTENANCE.lock');
 const fd=fs.openSync(file,'wx',0o600);
 fs.writeFileSync(fd,String(process.pid));
 let released=false;
 return()=>{if(!released){fs.closeSync(fd);fs.unlinkSync(file);released=true;}};
}
module.exports={storageRoot,acquireMaintenance};
