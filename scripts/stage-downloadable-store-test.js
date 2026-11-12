// Inert bytes only. Native store semantics and disposable-host guards are separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {stage,verify}=require('./stage-downloadable-store-fixture'),{hashFile}=require('./beta-candidate');
(async()=>{
 const saved={GITHUB_ACTIONS:process.env.GITHUB_ACTIONS,RUNNER_ENVIRONMENT:process.env.RUNNER_ENVIRONMENT};
 try {
  process.env.GITHUB_ACTIONS='false';process.env.RUNNER_ENVIRONMENT='github-hosted';
  await assert.rejects(stage(),/GITHUB_ACTIONS host guard/);
  process.env.GITHUB_ACTIONS='true';process.env.RUNNER_ENVIRONMENT='self-hosted';
  await assert.rejects(stage(),/RUNNER_ENVIRONMENT host guard/);
 } finally {for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-stage-contract-'));
 try{
  const filename='inert',source=path.join(root,filename),file=path.join(root,'CANDIDATE.json'),commit='a'.repeat(40);
  fs.writeFileSync(source,'synthetic');
  const candidate={sourceCommit:commit,target:'linux-x64',distributionMode:'direct-google-download',browserBundled:false,files:[{path:filename,...await hashFile(source)}]};
  const write=x=>fs.writeFileSync(file,JSON.stringify(x));write(candidate);
  assert.equal((await verify(root,filename,'linux-x64',commit)).source,source);
  for(const delta of [{sourceCommit:'b'.repeat(40)},{target:'macos-x64'},{distributionMode:'embedded'},{browserBundled:true},{files:[]},{files:[candidate.files[0],candidate.files[0]]}]){
   write({...candidate,...delta});await assert.rejects(verify(root,filename,'linux-x64',commit)); // NOSONAR: serial on purpose; cases mutate the same owned candidate fixture.
  }
  for(const delta of [{size:candidate.files[0].size+1},{sha256:'0'.repeat(64)}]){
   write({...candidate,files:[{...candidate.files[0],...delta}]});await assert.rejects(verify(root,filename,'linux-x64',commit)); // NOSONAR: serial on purpose; cases mutate the same owned candidate fixture.
  }
  write(candidate);fs.appendFileSync(source,'changed');await assert.rejects(verify(root,filename,'linux-x64',commit)); // NOSONAR: serial on purpose; cases mutate the same owned candidate fixture.
  fs.rmSync(source);await assert.rejects(verify(root,filename,'linux-x64',commit)); // NOSONAR: serial on purpose; cases mutate the same owned candidate fixture.
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 console.log('Exact downloadable-store bridge: non-hosted execution denied; commit/target/mode/size/hash/missing/duplicate records fail closed (inert only).');
})().catch(e=>{console.error(e);process.exitCode=1;});
