// Fixed bootstrap with inert dependencies. Never downloads, launches or reads stores.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseCommand,helpText}=require('../lib/cli-command');
for(const command of ['setup','check-credentials','forget-credentials','update','uninstall','version','help'])assert.equal(parseCommand([command]).command,command);
for(const flag of ['-h','--help'])assert.equal(parseCommand([flag]).command,'help');
for(const flag of ['-v','--version'])assert.equal(parseCommand([flag]).command,'version');
for(const command of ['setup','check-credentials','forget-credentials','update','uninstall'])assert.equal(parseCommand(['--'+command]).error,`Use ${command} instead of --${command}.`);
assert.ok(parseCommand(['setup','help']).error);assert.ok(parseCommand(['nonsense']).error);
assert.match(helpText(),/no answers until start/);
const source=fs.readFileSync(path.join(__dirname,'../packaging/bootstrap.js'),'utf8');
async function probe(args,downloadFails=false){
 const events=[],out=[];
 const processFixture={argv:['fixed','fixed',...args],env:{},execPath:'fixed.exe',platform:'linux',on(){},removeListener(){}};
 const load=id=>{
  if(id==='../lib/cli-command')return require(id);
  if(id==='../package.json')return {version:'2026.0.0'};
  if(id==='../lib/runtime-directory')return {createRuntimeDirectory:()=>{events.push('runtime');return {directory:'/inert-runtime',remove:()=>{events.push('cleanup');return true;}};}};
  if(id==='node:fs')return {writeFileSync(){}};
  if(id==='node:module')return {createRequire:()=>()=>({})};
  if(id==='node:sea')return {getAsset:key=>key==='manifest'?JSON.stringify({browserMode:'direct-google-download',browserVersion:require('../packaging/browser-downloads.json').version}):new ArrayBuffer(0)};
  if(id==='modern-tar/fs')return {};
  if(id==='../lib/native-binding')return {setPackagedBinding(){}};
  if(id==='./update')return {updateCommand:async options=>{assert.equal(options.executable,'fixed.exe');events.push('update');}};
  if(id==='../lib/credential-store')return {createCredentialStore:()=>({inert:true})};
  if(id==='./uninstall')return {uninstallCommand:async options=>{assert.equal(options.ownDirectory,'/inert-runtime');assert.equal(options.store.inert,true);events.push('uninstall');await options.cleanupOwn();return {incomplete:false};}};
  if(id==='./download-browser')return {ensureBrowser:async()=>{events.push('acquire');if(downloadFails)throw Error('inert cancellation');}};
  if(id==='../bin/cli')return {credentialCommand:async command=>{events.push(command);},runCli:async()=>{throw Error('Must not launch browser');}};
  if(id==='../lib/diagnostics')return {diagnostic:()=> 'inert'};
  return require(id);
 };
 vm.runInNewContext(source,{require:load,process:processFixture,Buffer,console:{log:text=>out.push(text),error:text=>out.push(text)}}); // NOSONAR - fixed repository bootstrap only with inert dependencies.
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 return {events,out,exitCode:processFixture.exitCode};
}
(async()=>{
 for(const args of [['help'],['-h'],['--help'],['version'],['-v'],['--version']])assert.deepEqual((await probe(args)).events,[]);
 for(const command of ['setup','check-credentials','forget-credentials','update','uninstall']){
  const result=await probe(['--'+command]);assert.deepEqual(result.events,[]);assert.equal(result.exitCode,1);assert.ok(result.out[0].includes('Use '+command));
 }
 assert.deepEqual((await probe(['update'])).events,['update']);
 assert.deepEqual((await probe(['uninstall'])).events,['runtime','uninstall','cleanup','cleanup']);
 assert.deepEqual((await probe(['setup'])).events,['runtime','acquire','--setup','cleanup']);
 assert.deepEqual((await probe(['setup'],true)).events,['runtime','acquire','cleanup']);
 for(const command of ['check-credentials','forget-credentials'])assert.deepEqual((await probe([command])).events,['runtime','--'+command,'cleanup']);
 console.log('Subcommand/flag dispatch, side-effect-free help/version/legacy refusals, consent-before-optional-store setup passed (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
