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
 let fd;try{fd=fs.openSync(file,'wx',0o600);}catch(error){if(error.code==='EEXIST'){console.error('Maintenance lock retained: '+file+'. Close all app/browser processes, inspect this lock, then remove it manually only when no maintenance is running.');}throw error;}
 fs.writeFileSync(fd,String(process.pid));
 let released=false;
 return()=>{if(!released){released=true;try{fs.closeSync(fd);}catch{console.error('Maintenance descriptor close failed; inspect '+file);}try{fs.unlinkSync(file);}catch{console.error('Maintenance lock release failed: '+file+'. Close all app/browser processes before manual removal.');}}};
}
module.exports={storageRoot,acquireMaintenance};
