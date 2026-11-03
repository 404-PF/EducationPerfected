const assert=require('node:assert/strict'),{accepted}=require('./windows-startup-panel');
const nonce='a'.repeat(64),mode='source';
const good={status:0,signal:null,stderr:'',stdout:`EP_OWNED_PIPE_NONCE=${nonce}\nEP_OWNED_PIPE_MODE=${mode}\nEP_OWNED_PIPE_RESULT=pass\n`};
assert.equal(accepted(good,mode,nonce),true);
for(const change of [{status:20},{signal:'SIGTERM'},{error:Error()},{stderr:'private'},{stdout:good.stdout+'\n'},{stdout:good.stdout.replace('source','sea')},{stdout:good.stdout.replace(nonce,'b'.repeat(64))},{stdout:good.stdout.replace(/\n/g,'\r\n')}])assert.equal(accepted({...good,...change},mode,nonce),false);
console.log('Owned pipe panel strict receipts: inert pass');
// Load actual panel normally under scoped inert dependencies. No source execution API.
const Module=require('node:module');
(async()=>{for(const fail of ['none','source','sea','identity','host']){
 const calls=[],logs=[];
 const identity={length:123,sha256:'b'.repeat(64),browserVersion:'156.0.8078.47'};
 const target=require.resolve('./windows-startup-panel'),originalLoad=Module._load,originalLog=console.log,originalEnv=process.env,originalArgv=process.argv,originalPlatform=Object.getOwnPropertyDescriptor(process,'platform'),originalArch=Object.getOwnPropertyDescriptor(process,'arch');
 function req(name){if(name==='node:fs')return {statSync:()=>({isFile:()=>true}),readFileSync:()=>JSON.stringify(identity)};if(name==='node:crypto')return {randomBytes:()=>({toString:()=>nonce})};if(name==='./startup-browser-identity')return {verifyArchive:async()=>{if(fail==='identity')throw Error();return identity;}};if(name==='node:child_process')return {spawnSync:(exe,args)=>{const current=args[2];calls.push(current);return current===fail?{status:20}: {status:0,signal:null,stderr:'',stdout:`EP_OWNED_PIPE_NONCE=${nonce}\nEP_OWNED_PIPE_MODE=${current}\nEP_OWNED_PIPE_RESULT=pass\n`};}};return require(name);}
 let error;
 try{
  Object.defineProperty(process,'platform',{value:fail==='host'?'linux':'win32'});Object.defineProperty(process,'arch',{value:'x64'});process.argv=['node','fixed'];process.env={GITHUB_ACTIONS:'true',RUNNER_OS:'Windows',RUNNER_ENVIRONMENT:'github-hosted',EP_FIXTURE_PYTHON:'/fixed/python'};console.log=s=>logs.push(s);
  Module._load=function(name,parent,isMain){return parent?.filename===target?req(name):originalLoad.call(this,name,parent,isMain);};delete require.cache[target];await require('./windows-startup-panel').panel();
 }catch(e){error=e;}finally{Module._load=originalLoad;console.log=originalLog;process.env=originalEnv;process.argv=originalArgv;Object.defineProperty(process,'platform',originalPlatform);Object.defineProperty(process,'arch',originalArch);delete require.cache[target];}
 assert.deepEqual(calls,fail==='host'||fail==='identity'?[]:fail==='source'?['source']:['source','sea']);assert.equal(!error,fail==='none');
}})().catch(error=>{console.error(error);process.exitCode=1;});
