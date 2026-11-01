// Execute fixed repository CLI/bootstrap with inert store/assets; never native credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function probe(kind,scenario) {
 const source=fs.readFileSync(path.join(__dirname,kind==='source'?'../bin/cli.js':'../packaging/bootstrap.js'),'utf8');
 let reads=0,writes=0,removes=0,browser=0,output='',cleaned=0;
 const store={async read(){reads++;if(scenario==='error')throw Error('do-not-print-fixture-secret');return scenario==='valid'?{email:['fixture','example.test'].join('@'),password:['synthetic','hidden'].join('-')}:null;},async save(){writes++;},async remove(){removes++;}};
 const moduleFixture={exports:{}};
 const fakeProcess={platform:'linux',execPath:process.execPath,argv:['fixed','fixed','--check-credentials'],env:{},stdout:{write:line=>{output+=line;}},on(){},removeListener(){}};
 if(scenario==='conflict')fakeProcess.argv.push('--forget-credentials');
 const load=id=>{
  if(id==='../index')return {launchProgram(){browser++;},promptCredentials(){throw Error('Unexpected prompt');}};
  if(id==='../lib/credential-store')return {createCredentialStore:()=>store};
  if(kind==='bootstrap'){
   if(id==='../bin/cli')return {credentialCommand:async command=>{assert.equal(command,'--check-credentials');return require('../bin/cli').credentialCommand(command,{store,output:fakeProcess.stdout});}};
   if(id==='node:fs')return {mkdtempSync:()=>'/fixed-owned',chmodSync(){},writeFileSync(){},rmSync(){cleaned++;}};
   if(id==='node:sea')return {getAsset:key=>key==='manifest'?'{}':new ArrayBuffer(0),getRawAsset(){browser++;throw Error('Browser must not be read');}};
   if(id==='node:module')return {createRequire:()=>()=>({})};
   if(id==='../lib/native-binding')return {setPackagedBinding(){}};
   if(id==='modern-tar/fs')return {};
  }
  return require(id);
 };
 load.main=moduleFixture;
 vm.runInNewContext(source,{require:load,module:moduleFixture,process:fakeProcess,Buffer,console:{log:line=>{output+=line;},error:line=>{output+=line;}}}); // NOSONAR: fixed repository source and inert store/OS only.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(reads,scenario==='conflict'?0:1);assert.equal(writes,0);assert.equal(removes,0);assert.equal(browser,0);
 assert.ok(!output.includes('fixture@example.test')&&!output.includes('synthetic-hidden')&&!output.includes('do-not-print-fixture-secret'));
 if(scenario==='conflict'){assert.equal(fakeProcess.exitCode,1);assert.ok(output.includes('Choose only one credential command.'));}
 else if(scenario==='error'){assert.equal(fakeProcess.exitCode,1);assert.ok(output.includes('Credential command failed.'));}
 else {assert.equal(fakeProcess.exitCode,undefined);assert.equal(output,scenario==='valid'?'Saved login is available and its record is valid.\n':'No saved login was found.\n');}
 if(kind==='bootstrap')assert.equal(cleaned,1);
}
(async()=>{for(const kind of ['source','bootstrap'])for(const scenario of ['valid','absent','error','conflict'])await probe(kind,scenario);console.log('Credential health command: source/SEA routing, one native read only, no writes/prompts/browser/assets/secret output, errors sanitized and cleanup preserved (inert only).');})().catch(error=>{console.error(error);process.exitCode=1;});
