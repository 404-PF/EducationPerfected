const assert=require('node:assert/strict'),{accepted}=require('./windows-startup-panel');
const nonce='a'.repeat(64),mode='source';
const good={status:0,signal:null,stderr:'',stdout:`EP_OWNED_PIPE_NONCE=${nonce}\nEP_OWNED_PIPE_MODE=${mode}\nEP_OWNED_PIPE_RESULT=pass\n`};
assert.equal(accepted(good,mode,nonce),true);
for(const change of [{status:20},{signal:'SIGTERM'},{error:Error()},{stderr:'private'},{stdout:good.stdout+'\n'},{stdout:good.stdout.replace('source','sea')},{stdout:good.stdout.replace(nonce,'b'.repeat(64))},{stdout:good.stdout.replace(/\n/g,'\r\n')}])assert.equal(accepted({...good,...change},mode,nonce),false);
console.log('Owned pipe panel strict receipts: inert pass');
// Execute actual panel source with inert archive/child APIs. Source-first stop.
const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require('node:path').join(__dirname,'windows-startup-panel.js'),'utf8');
for(const fail of ['none','source','sea','identity','host']){
 const calls=[],logs=[];let status;const fakeProcess={argv:['node','fixed'],platform:fail==='host'?'linux':'win32',arch:'x64',env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Windows',RUNNER_ENVIRONMENT:'github-hosted',EP_FIXTURE_PYTHON:'/fixed/python'},get exitCode(){return status;},set exitCode(value){status=value;}};
 const identity={length:123,sha256:'b'.repeat(64),browserVersion:'156.0.8078.47'};
 function req(name){if(name==='node:fs')return {statSync:()=>({isFile:()=>true}),readFileSync:()=>JSON.stringify(identity)};if(name==='node:crypto')return {randomBytes:()=>({toString:()=>nonce})};if(name==='./startup-browser-identity')return {verifyArchive:async()=>{if(fail==='identity')throw Error();return identity;}};if(name==='node:child_process')return {spawnSync:(exe,args)=>{const current=args[2];calls.push(current);return current===fail?{status:20}: {status:0,signal:null,stderr:'',stdout:`EP_OWNED_PIPE_NONCE=${nonce}\nEP_OWNED_PIPE_MODE=${current}\nEP_OWNED_PIPE_RESULT=pass\n`};}};return require(name);}
 const module={exports:{}};req.main=module;
 vm.runInNewContext(source,{require:req,module,__dirname,process:fakeProcess,console:{log:s=>logs.push(s)}});
 // Asynchronous panel continuation is checked after all nested promises settle.
 setImmediate(()=>{assert.deepEqual(calls,fail==='host'||fail==='identity'?[]:fail==='source'?['source']:['source','sea']);assert.equal(status,fail==='none'?undefined:1);});
}
