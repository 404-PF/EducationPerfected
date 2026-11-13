// Fixed sibling source only; all OS, filesystem, native workers and child effects inert.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'windows-packaged-store-delete-test.js'),'utf8');
async function probe(scenario, fixturePath) {
 let cancelStarted='';
 const [targetMode='',failureScenario=''] = scenario.split(':');
 const modeOrder=['interrupt-email','interrupt-password','cancel-email','cancel-password'];
 const expectedFailureSpawns=modeOrder.indexOf(targetMode)+1;
 let record=scenario==='existing'?'untouched':null, live=false, saves=0, deletes=0, removed=0, spawns=0, polls=0, commands=[];
 const primary=Error('synthetic operation failure'), logs=[], moduleFixture={exports:{}};
 const requireFixture=id=>{
  if(id==='./windows-setup-receipt')return require('./windows-setup-receipt');
  if(id==='node:path')return fixturePath;
  if(id==='node:fs')return {mkdtempSync:()=>'/owned',copyFileSync(){},mkdirSync(){},statSync:()=>({isFile:()=>true}),readdirSync:()=>scenario==='residue' && saves>0?['owned-extraction']:[],rmSync(){removed++;assert.equal(live,false);if(['file-cleanup','busy-cleanup','busy-primary'].includes(scenario)){const error=new Error('sensitive-fixture-native-error');error.code=scenario==='file-cleanup'?'EPERM':'EBUSY';error.path=fixturePath.join('/owned','educationperfected.exe');throw error;}if(scenario==='unknown-cleanup'){const error=new Error('sensitive-fixture-native-error');error.code='private-code';error.path=fixturePath.join('/outside','private-name');throw error;}}};
  if(id==='node:os')return {tmpdir:()=>'/synthetic'};
  if(id==='./packaged-fixture-target')return {packagedFixtureTarget:()=>({executable:'/fixed/educationperfected.exe'})};
  if(id==='../lib/packaged-windows-binding')return {createWindowsBinding:()=>({hasLiveWorkers:()=>live,AsyncEntry:class {
   async getPassword(){polls++;if(scenario==='busy-primary' && commands.at(-1)==='forget-credentials' && !deletes)throw primary;if(failureScenario==='cancel-read-failure' && cancelStarted===targetMode)throw primary;if(scenario==='initial-read-live'){live=true;throw primary;}if(scenario==='cleanup-read-live' && deletes){live=true;throw primary;}return record;}
   async setPassword(){assert.fail('Source fixture must never prepare the SEA setup record');}
   async deletePassword(){deletes++;if(scenario==='cleanup-delete-live'){live=true;throw primary;}record=null;return true;}
  }})};
  if(id==='node:child_process')return {spawn(file,args,options){
   spawns++;const command=args[0];commands.push(command);
   assert.ok(command.endsWith('windows-sea-setup-helper.py') || ['check-credentials','forget-credentials'].includes(command));
   assert.equal(options.env.PATH,fixturePath.join('/owned','empty'));
   const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;
   queueMicrotask(()=>{
    if(scenario==='child-live')return;
    if(command.endsWith('windows-sea-setup-helper.py')){
     if(args[2]!=='save'){
      cancelStarted=args[2];
      if(failureScenario==='cancel-uncertain' && args[2]===targetMode){child.stdout.emit('data','EP_SETUP_UNCERTAIN\n');child.emit('close',20);return;}
      if(failureScenario==='cancel-closed-failure' && args[2]===targetMode){child.stdout.emit('data','EP_SETUP_PRIMARY=console-command-failed\nEP_SETUP_CLOSED_FAILURE\n');child.emit('close',1);return;}
      assert.ok(['interrupt-email','interrupt-password','cancel-email','cancel-password'].includes(args[2]));
      if(failureScenario==='cancel-mutation' && args[2]===targetMode)record='unexpected';
      child.stdout.emit('data','EP_SETUP_CLOSED_SUCCESS\n');child.emit('close',0);return;
     }
     saves++;record=JSON.stringify({version:1,email:['fixture','example.test'].join('@'),password:['synthetic','sea','delete'].join('-')});
     if(['partial','cleanup-delete-live','cleanup-read-live'].includes(scenario)){record='partial';child.stdout.emit('data','EP_SETUP_PRIMARY=console-child-nonzero\nEP_SETUP_CLOSED_FAILURE\n');child.emit('close',1);return;}
     if(scenario==='setup-uncertain'){child.stdout.emit('data','EP_SETUP_PRIMARY=job-exit-unconfirmed\nEP_SETUP_UNCERTAIN\n');child.emit('close',20);return;}
     if(scenario==='setup-no-receipt'){child.emit('close',1);return;}
     if(scenario==='setup-pair-mismatch')record='mismatch';
     child.stdout.emit('data','EP_SETUP_CLOSED_SUCCESS\n');child.emit('close',0);return;
    }
    if(command==='check-credentials'){
     if(scenario==='read-mutation')record='changed';
     child.stdout.emit('data',scenario==='read-wrong'?'Saved login is available and its record is valid. private-fixture-secret\n':'Saved login is available and its record is valid.\n');
     child.emit('close',scenario==='read-failure'?1:0);return;
    }
    if(!['child-failure','child-noop'].includes(scenario))record=null;
    child.stdout.emit('data','Saved login removed from the OS credential store.\n');child.emit('close',scenario==='child-failure'?1:0);
   });return child;
  }};
  if(id==='./packaged-test-cleanup')return {boundedClose:async promise=>{if(scenario==='child-live')throw primary;return promise;},stopChild:async()=>{if(scenario==='child-live')throw primary;}};
  return require(id);
 };
 requireFixture.resolve=()=>'/fixed/native.node';
 vm.runInNewContext(source,{__dirname:fixturePath.resolve('/fixed/scripts'),require:requireFixture,module:moduleFixture,process:{platform:'win32',arch:'x64',argv:['node','fixture'],env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Windows',RUNNER_ENVIRONMENT:'github-hosted',EP_FIXTURE_PYTHON:fixturePath.resolve('/fixed/python.exe')}},console:{log:line=>logs.push(line),error:line=>logs.push(line)}}); // NOSONAR: fixed sibling repository source, inert effects only.
 let error;try {await moduleFixture.exports.verifyPackagedDelete();}catch(value){error=value;}
 if(scenario==='success'){assert.equal(error,undefined);assert.equal(saves,1);assert.equal(spawns,7);assert.ok(commands[0].endsWith('windows-sea-setup-helper.py'));assert.deepEqual(commands.slice(5),['check-credentials','forget-credentials']);assert.equal(record,null);assert.equal(deletes,0);assert.equal(removed,1);assert.ok(polls>=3);}
 if(['setup-uncertain','setup-no-receipt'].includes(scenario)){assert.ok(error);assert.equal(deletes,0);assert.equal(removed,0);assert.ok(record);}
 if(['cancel-uncertain','cancel-closed-failure','cancel-read-failure'].includes(failureScenario)){assert.ok(error);assert.equal(deletes,0);assert.equal(removed,0);assert.equal(spawns,expectedFailureSpawns);}
 if(failureScenario==='cancel-mutation'){assert.ok(error);assert.equal(record,'unexpected');assert.equal(deletes,0);assert.equal(removed,0);assert.equal(spawns,expectedFailureSpawns);}
 if(scenario==='setup-pair-mismatch'){assert.ok(error);assert.equal(deletes,1);assert.equal(record,null);assert.equal(removed,1);}
 if(['file-cleanup','busy-cleanup','busy-primary','unknown-cleanup'].includes(scenario)){if(scenario==='busy-primary')assert.equal(error,primary);else assert.match(error.message,/file cleanup failed/);assert.equal(removed,1);assert.equal(record,null);assert.equal(spawns,7);assert.equal(deletes,scenario==='busy-primary'?1:0);assert.ok(logs.some(line=>line.includes('code='+(scenario==='file-cleanup'?'EPERM; target=executable-copy':scenario.startsWith('busy-')?'EBUSY; target=executable-copy':'other; target=unknown'))));assert.doesNotMatch(logs.join(' '),/sensitive-fixture|private-code|private-name|outside/);}
 if(scenario==='busy-cleanup') {
  const successAt=logs.findIndex(line=>line.includes('Windows SEA interactive setup saved'));
  const failureAt=logs.findIndex(line=>line.includes('code=EBUSY; target=executable-copy'));
  assert.ok(successAt>=0 && failureAt>successAt);assert.ok(error,'Subchain pass must not mask final failure');
  assert.ok(logs[failureAt].includes('childClosed=true; workersLive=false'));
 }
 if(scenario==='busy-primary'){assert.equal(logs.some(line=>line.includes('Windows SEA interactive setup saved')),false);assert.ok(logs.some(line=>line==='Packaged store fixture file cleanup failed'));}
 if(scenario==='existing'){assert.match(error.message,/must be absent/);assert.equal(saves,0);assert.equal(spawns,0);assert.equal(deletes,0);assert.equal(record,'untouched');}
 if(scenario==='partial'){assert.match(error.message,/closed failure/);assert.equal(deletes,1);assert.equal(record,null);}
 if(['initial-read-live','cleanup-delete-live','cleanup-read-live','child-live'].includes(scenario)){if(scenario==='initial-read-live' || scenario==='child-live')assert.equal(error,primary);assert.equal(removed,0);assert.equal(deletes,scenario.startsWith('cleanup-')?1:0);assert.ok(logs.some(line=>/retained|cleanup failed/.test(line)));}
 if(['read-failure','read-wrong','read-mutation'].includes(scenario)){assert.ok(error);assert.equal(commands.length,6);assert.equal(commands[5],'check-credentials');assert.equal(deletes,1);assert.equal(record,null);assert.equal(removed,1);}
 if(scenario==='residue'){assert.ok(error);assert.equal(saves,1);assert.equal(spawns,6);assert.equal(commands[5],'check-credentials');assert.equal(deletes,1);assert.equal(record,null);assert.equal(removed,1);}
 if(['child-failure','child-noop'].includes(scenario)){assert.ok(error);assert.equal(deletes,1);assert.equal(record,null);assert.equal(removed,1);}
}
(async()=>{
 const ordinary=['setup-uncertain','setup-no-receipt','setup-pair-mismatch','read-failure','read-wrong','read-mutation','file-cleanup','busy-cleanup','busy-primary','unknown-cleanup','existing','success','partial','initial-read-live','cleanup-delete-live','cleanup-read-live','child-failure','child-noop','residue','child-live'];
 const modes=['interrupt-email','interrupt-password','cancel-email','cancel-password'];
 const failures=['cancel-uncertain','cancel-closed-failure','cancel-read-failure','cancel-mutation'];
 for(const fixturePath of [path.posix,path.win32]){
  for(const scenario of ordinary)await probe(scenario,fixturePath);
  for(const mode of modes)for(const failure of failures)await probe(mode+':'+failure,fixturePath);
 }
 console.log('Windows SEA deletion fixture ownership/absence/primary failure/retention controls passed (inert only; all4 no-write modes x all4 failure categories x both path flavors).');
})().catch(error=>{console.error(error);process.exitCode=1;});
