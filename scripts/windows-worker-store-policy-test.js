// Execute fixed sibling native-fixture source with inert OS, files and workers.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'windows-native-worker-store-test.js'), 'utf8');
async function probe(scenario) {
 let record = scenario === 'existing' ? 'must-not-touch' : null, saves = 0, deletes = 0, removed = 0, unlinked = 0, live = false;
 const primary = new Error('synthetic save failure');
 const logs = [], moduleFixture = {exports:{}};
 const requireFixture = id => {
  if (id === 'node:fs') return {mkdtempSync:()=>'/synthetic-owned',copyFileSync(){},unlinkSync(){assert.equal(live,false);unlinked++;},existsSync:()=>false,rmSync(){removed++;if(scenario==='root-cleanup-failure')throw new Error('synthetic root cleanup');}};
  if (id === 'node:os') return {tmpdir:()=>'/synthetic'};
  if (id === '../lib/packaged-windows-binding') return {createWindowsBinding(){return {hasLiveWorkers:()=>live,AsyncEntry: class {
   constructor(service,account){assert.equal(service,'EducationPerfected');assert.equal(account,'login-v1');}
   async getPassword(){if(scenario==='live-read' || (scenario==='live-cleanup-read' && deletes>0)){live=true;throw primary;}return record;}
   async setPassword(value){saves++;record=value;if(scenario==='live-save'){live=true;throw primary;}if(scenario==='partial-save' || scenario==='cleanup-failure' || scenario==='live-cleanup-delete' || scenario==='live-cleanup-read')throw primary;}
   async deletePassword(){deletes++;if(scenario==='live-cleanup-delete'){live=true;throw primary;}if(scenario==='cleanup-failure')throw new Error('synthetic cleanup failure');const existed=record!==null;record=null;return existed;}
  }};}};
  return require(id);
 };
 requireFixture.resolve=id=>{assert.equal(id,'@napi-rs/keyring-win32-x64-msvc');return '/pinned/synthetic.node';};
 vm.runInNewContext(source,{require:requireFixture,module:moduleFixture,__dirname,process:{platform:'win32',arch:'x64',env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Windows'},argv:['node','fixed-fixture']},console:{log:line=>logs.push(line),error:line=>logs.push(line)}}); // NOSONAR: fixed repository fixture source, inert OS/files/worker state only.
 let error;
 try {await moduleFixture.exports.verifyWorkerStore();} catch(value){error=value;}
 if(scenario==='success'){assert.equal(error,undefined);assert.equal(saves,1);assert.equal(deletes,1);assert.equal(unlinked,1);assert.equal(record,null);}
 if(scenario==='existing'){assert.match(error.message,/Disposable runner record must be absent before mutation/);assert.equal(saves,0);assert.equal(deletes,0);assert.equal(record,'must-not-touch');assert.equal(unlinked,0);}
 if(scenario==='partial-save'){assert.equal(error,primary);assert.equal(saves,1);assert.equal(deletes,1);assert.equal(record,null);assert.equal(unlinked,0);}
 if(scenario==='root-cleanup-failure'){assert.ok(error);assert.equal(error.message,'Native worker fixture file cleanup failed');assert.equal(record,null);}
 if(scenario==='cleanup-failure'){assert.equal(error,primary);assert.equal(deletes,1);assert.ok(logs.includes('Synthetic worker record cleanup failed'));}
 if(['live-save','live-read','live-cleanup-delete','live-cleanup-read'].includes(scenario)) {
  assert.equal(error,primary);assert.equal(deletes,scenario.startsWith('live-cleanup-')?1:0);assert.equal(removed,0);assert.equal(unlinked,0);
  assert.ok(logs.includes('Native worker still live; owned fixture retained without concurrent credential cleanup'));
 } else assert.equal(removed,1);
}
(async()=>{for(const scenario of ['success','existing','partial-save','cleanup-failure','root-cleanup-failure','live-save','live-read','live-cleanup-delete','live-cleanup-read'])await probe(scenario);console.log('Windows store fixture policy: success, preexisting zero mutation, partial-write cleanup and primary-error retention passed (inert only).');})().catch(error=>{console.error(error);process.exitCode=1;});
