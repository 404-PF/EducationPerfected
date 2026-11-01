// Fixed sibling source only; all OS, filesystem, native workers and child effects inert.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'windows-packaged-store-delete-test.js'),'utf8');
async function probe(scenario) {
 let record=scenario==='existing'?'untouched':null, live=false, saves=0, deletes=0, removed=0, spawns=0, polls=0;
 const primary=Error('synthetic operation failure'), logs=[], moduleFixture={exports:{}};
 const requireFixture=id=>{
  if(id==='node:fs')return {mkdtempSync:()=>'/owned',copyFileSync(){},mkdirSync(){},readdirSync:()=>scenario==='residue'?['owned-extraction']:[],rmSync(){removed++;assert.equal(live,false);}};
  if(id==='node:os')return {tmpdir:()=>'/synthetic'};
  if(id==='./packaged-fixture-target')return {packagedFixtureTarget:()=>({executable:'/fixed/educationperfected.exe'})};
  if(id==='../lib/packaged-windows-binding')return {createWindowsBinding:()=>({hasLiveWorkers:()=>live,AsyncEntry:class {
   async getPassword(){polls++;if(scenario==='initial-read-live'){live=true;throw primary;}if(scenario==='cleanup-read-live' && deletes){live=true;throw primary;}return record;}
   async setPassword(value){saves++;record=value;if(['partial','cleanup-delete-live','cleanup-read-live'].includes(scenario))throw primary;if(scenario==='save-live'){live=true;throw primary;}}
   async deletePassword(){deletes++;if(scenario==='cleanup-delete-live'){live=true;throw primary;}record=null;return true;}
  }})};
  if(id==='node:child_process')return {spawn(file,args,options){spawns++;assert.deepEqual(Array.from(args),['--forget-credentials']);assert.equal(options.env.PATH,'/owned/empty');const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;queueMicrotask(()=>{if(scenario==='child-live')return;if(!['child-failure','child-noop'].includes(scenario))record=null;child.stdout.emit('data','Saved login removed from the OS credential store.');child.emit('close',scenario==='child-failure'?1:0);});return child;}};
  if(id==='./packaged-test-cleanup')return {boundedClose:async promise=>{if(scenario==='child-live')throw primary;return promise;},stopChild:async()=>{if(scenario==='child-live')throw primary;}};
  return require(id);
 };
 requireFixture.resolve=()=>'/fixed/native.node';
 vm.runInNewContext(source,{require:requireFixture,module:moduleFixture,process:{platform:'win32',arch:'x64',argv:['node','fixture'],env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Windows'}},console:{log:line=>logs.push(line),error:line=>logs.push(line)}}); // NOSONAR: fixed sibling repository source, inert effects only.
 let error;try {await moduleFixture.exports.verifyPackagedDelete();}catch(value){error=value;}
 if(scenario==='success'){assert.equal(error,undefined);assert.equal(saves,1);assert.equal(spawns,1);assert.equal(record,null);assert.equal(deletes,0);assert.equal(removed,1);assert.ok(polls>=3);}
 if(scenario==='existing'){assert.match(error.message,/must be absent/);assert.equal(saves,0);assert.equal(spawns,0);assert.equal(deletes,0);assert.equal(record,'untouched');}
 if(scenario==='partial'){assert.equal(error,primary);assert.equal(deletes,1);assert.equal(record,null);}
 if(['initial-read-live','save-live','cleanup-delete-live','cleanup-read-live','child-live'].includes(scenario)){assert.equal(error,primary);assert.equal(removed,0);assert.equal(deletes,scenario.startsWith('cleanup-')?1:0);assert.ok(logs.includes('Native operation still live; owned fixture retained without concurrent credential cleanup'));}
 if(['child-failure','child-noop','residue'].includes(scenario)){assert.ok(error);assert.equal(deletes,1);assert.equal(record,null);assert.equal(removed,1);}
}
(async()=>{for(const scenario of ['existing','success','partial','initial-read-live','save-live','cleanup-delete-live','cleanup-read-live','child-failure','child-noop','residue','child-live'])await probe(scenario);console.log('Windows SEA deletion fixture ownership/absence/primary failure/retention controls passed (inert only).');})().catch(error=>{console.error(error);process.exitCode=1;});
