// Hosted diagnostic only. Run the setup shipped in the verified owned Chrome archive.
const fs=require('node:fs'),path=require('node:path');
function sandboxSetup(executablePath,run=require('node:child_process').spawnSync){
 const directory=path.dirname(executablePath),setup=path.join(directory,'setup.exe');
 let stat;
 try{stat=fs.lstatSync(setup);}catch(error){return{state:error.code==='ENOENT'?'absent':'unreadable',exitCode:null};}
 if(!stat.isFile()||stat.isSymbolicLink()||path.dirname(fs.realpathSync(setup))!==fs.realpathSync(directory))return{state:'unsafe',exitCode:null};
 const result=run(setup,['--configure-browser-in-directory='+directory],{shell:false,stdio:'ignore',timeout:30000,windowsHide:true});
 if(result.error)return{state:result.error.code==='ETIMEDOUT'?'timeout':'spawn-error',exitCode:null};
 const exitCode=Number.isInteger(result.status)&&result.status>=0&&result.status<=65535?result.status:null;
 // Chrome156 installer defines 78=CONFIGURE_APP_CONTAINER_SANDBOX_SUCCESS, 79=FAILED.
 return{state:exitCode===78?'configured':exitCode===79?'configuration-failed':'other-exit',exitCode};
}
module.exports={sandboxSetup};
