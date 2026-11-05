const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {runValidationCli}=require('../lib/validation-cli');
(async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='',closes=0;output.on('data',d=>text+=d);
 const controls={mode:async()=>{},status:()=>({state:'stopped'}),close:async()=>{closes++;if(closes===1)throw Error('synthetic close failure');},start:()=>{},stop:async()=>{}};
 const run=runValidationCli({input,output,launch:async()=>controls,launchOptions:{choiceSelectOnly:true},action:'select once',warning:'Synthetic'});
 const wait=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,5));assert.ok(predicate());};
 await wait(()=>text.includes('Commands:'));input.write('quit\n');await wait(()=>text.includes('Validation control failed'));assert.equal(closes,1);input.write('quit\n');await run;assert.equal(closes,2);console.log('Validation CLI close failure clears cached promise; secondquit cleanup succeeds PASS');
 for(const signal of ['SIGINT','SIGTERM','SIGHUP']) {
  if(process.platform==='win32') continue; // POSIX delivery only; not Windows proof.
  const source=`const {PassThrough}=require('node:stream');
  const {runValidationCli}=require(${JSON.stringify(path.resolve(__dirname,'../lib/validation-cli'))});
  let closes=0,starts=0;const input=new PassThrough();
  runValidationCli({input,output:process.stdout,launch:async()=>({mode:async()=>{process.kill(process.pid,${JSON.stringify(signal)});await new Promise(r=>setTimeout(r,50));},close:async()=>{closes++;console.log('CLOSED');},start:()=>{starts++;},status:()=>({})}),action:'select once',warning:'Synthetic'}).then(()=>{if(closes!==1||starts!==0)process.exitCode=1;console.log('DONE');}).catch(()=>process.exitCode=1);`;
  const result=spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.signal,null);
  assert.match(result.stdout,/CLOSED/);assert.match(result.stdout,/DONE/);assert.doesNotMatch(result.stdout,/Commands:/);
 }
 for(const stage of ['mode','terminal']) {
  let closes=0;const before=['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s));
  const controls={mode:async()=>{if(stage==='mode')throw Error('setup');},close:async()=>{closes++;}};
  await assert.rejects(runValidationCli({input:stage==='terminal'?{}:new PassThrough(),output:new PassThrough(),launch:async()=>controls,action:'select once',warning:'Synthetic'}));
  assert.equal(closes,1);assert.deepEqual(['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s)),before);
 }
 for(const signal of ['SIGINT','SIGTERM','SIGHUP']) {
  const input=new PassThrough(),output=new PassThrough();let text='',closes=0,starts=0,release;
  output.on('data',d=>text+=d);
  const before=['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s));
  const controls={mode:async()=>{},close:()=>{closes++;return new Promise(r=>{release=r;});},start:()=>{starts++;},status:()=>({state:'stopped'})};
  const run=runValidationCli({input,output,launch:async()=>controls,action:'select once',warning:'Synthetic'});
  await wait(()=>text.includes('Commands:'));process.emit(signal);input.write('select once\n');
  await new Promise(r=>setTimeout(r,15));assert.equal(starts,0);assert.equal(closes,1);
  release();await Promise.race([run,new Promise((_,reject)=>setTimeout(()=>reject(Error('signal shutdown did not settle')),200))]);
  assert.equal(starts,0);assert.equal(closes,1);assert.deepEqual(['SIGINT','SIGTERM','SIGHUP'].map(s=>process.listenerCount(s)),before);
 }
 console.log('Validation CLI signal rejects buffered action during slow close, settles loop and restores listeners PASS');
 console.log('Validation CLI post-launch signals drain before commands; mode/terminal setup failures close and remove handlers PASS (signals POSIX only)');
})().catch(e=>{console.error(e);process.exitCode=1;});
