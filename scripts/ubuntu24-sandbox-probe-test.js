// Fixed source, inert process/files/browser. No security-policy mutation.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'ubuntu24-sandbox-probe.js'),'utf8');
async function check(scenario){
 let launched=0,removed=0,closed=0,output='';
 const fakeProcess={platform:'linux',arch:'x64',env:{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted'},argv:['node','probe'],getuid:()=>scenario==='root'?0:1000};
 const settings={'/etc/os-release':'ID=ubuntu\nVERSION_ID="24.04"','/sys/module/apparmor/parameters/enabled':'Y','/proc/sys/kernel/apparmor_restrict_unprivileged_userns':scenario==='unrestricted'?'0':'1','/proc/sys/kernel/apparmor_restrict_unprivileged_unconfined':'1'};
 const load=id=>{
  if(id==='node:fs')return {existsSync:file=>file in settings,readFileSync:file=>settings[file],mkdtempSync:()=>'/owned-probe',rmSync(){removed++;}};
  if(id==='puppeteer')return {launch:async options=>{launched++;assert.equal(options.headless,true);assert.equal(options.timeout,15000);assert.equal(options.args,undefined);if(scenario==='denied')throw Error('No usable sandbox! private-detail');return {process:()=>scenario==='null-handle'?null:({spawnargs:['fixed-chrome'],exitCode:closed?0:null}),newPage:async()=>({goto:async url=>{assert.equal(url,'about:blank');},url:()=>'about:blank'}),close:async()=>{closed++;}};}};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process:fakeProcess,console:{log:line=>{output+=line;},error:line=>{output+=line;}}}); // NOSONAR: fixed sibling source, inert OS/files/browser only.
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(!output.includes('private-detail'));
 if(['root','unrestricted'].includes(scenario)){assert.equal(launched,0);assert.equal(fakeProcess.exitCode,1);}
 else if(scenario==='denied'){assert.equal(launched,1);assert.equal(fakeProcess.exitCode,1);assert.ok(output.includes('sandbox-denied'));assert.equal(removed,0);assert.ok(output.includes('owned profile retained'));}
 else if(scenario==='null-handle'){assert.equal(launched,1);assert.equal(closed,1);assert.equal(removed,0);assert.equal(fakeProcess.exitCode,1);assert.ok(output.includes('Browser exit unconfirmed'));}
 else {assert.equal(launched,1);assert.equal(closed,1);assert.equal(removed,1);assert.equal(fakeProcess.exitCode,undefined);}
}
(async()=>{for(const scenario of ['root','unrestricted','denied','null-handle','success'])await check(scenario);console.log('Ubuntu24 probe guards, restricted policy gate, sanitized denial and sandboxed blank target passed (inert only).');})().catch(error=>{console.error(error);process.exitCode=1;});
