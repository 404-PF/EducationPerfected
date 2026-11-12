// Inert bytes only. Native store semantics and disposable-host guards are separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {stage,verify}=require('./stage-downloadable-store-fixture'),{hashFile}=require('./beta-candidate');
(async()=>{
 const saved=process.env.GITHUB_ACTIONS;process.env.GITHUB_ACTIONS='false';
 try {await assert.rejects(stage());}
 finally {if(saved===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=saved;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-stage-contract-'));
 try{
  const filename='inert',source=path.join(root,filename),file=path.join(root,'CANDIDATE.json'),commit='a'.repeat(40);
  fs.writeFileSync(source,'synthetic');
  const candidate={sourceCommit:commit,target:'linux-x64',distributionMode:'direct-google-download',browserBundled:false,files:[{path:filename,...await hashFile(source)}]};
  const write=x=>fs.writeFileSync(file,JSON.stringify(x));write(candidate);
  assert.equal((await verify(root,filename,'linux-x64',commit)).source,source);
  for(const delta of [{sourceCommit:'b'.repeat(40)},{target:'macos-x64'},{distributionMode:'embedded'},{browserBundled:true},{files:[]},{files:[candidate.files[0],candidate.files[0]]}]){
   write({...candidate,...delta});await assert.rejects(verify(root,filename,'linux-x64',commit));
  }
  write(candidate);fs.appendFileSync(source,'changed');await assert.rejects(verify(root,filename,'linux-x64',commit));
  fs.rmSync(source);await assert.rejects(verify(root,filename,'linux-x64',commit));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 console.log('Exact downloadable-store bridge: non-hosted execution denied; commit/target/mode/size/hash/missing/duplicate records fail closed (inert only).');
})().catch(e=>{console.error(e);process.exitCode=1;});
