const assert = require('node:assert/strict');
const { waitForPackagedCheckpoint } = require('./packaged-checkpoint');
(async () => {
 const child = {exitCode:null, signalCode:null};
 let elapsed = 0;
 const opts = {child, name:'browser-endpoint', milliseconds:45000, now:()=>elapsed, pause:async()=>{elapsed+=1000;}};
 const arrived = await waitForPackagedCheckpoint(()=>elapsed >= 31000, opts);
 assert.equal(arrived.outcome, 'arrived'); assert.equal(arrived.elapsedMs, 31000);
 elapsed=0;
 await assert.rejects(waitForPackagedCheckpoint(()=>elapsed >= 31000,{...opts,milliseconds:20000}), /\"outcome\":\"timeout\"/);
 elapsed=31000;
 assert.equal(elapsed,31000,'Startup checkpoint must permit observation past Puppeteer launch 30s default');
 elapsed=0;
 await assert.rejects(waitForPackagedCheckpoint(()=>false,opts),error=>{
  assert.equal(error.code,'EP_FIXTURE_CHECKPOINT');
  assert.match(error.message, /"checkpoint":"browser-endpoint"/);
  assert.match(error.message, /"elapsedMs":45000/);
  assert.match(error.message, /"childExited":false/);return true;
 });
 elapsed=0;
 await assert.rejects(waitForPackagedCheckpoint(()=>false,{...opts,child:{exitCode:1,signalCode:null}}),/"outcome":"child-exit"/);
 assert.equal(elapsed,0,'Exit must not wait for timeout');
 const failure=Error('synthetic spawn failure');
 await assert.rejects(waitForPackagedCheckpoint(()=>false,{...opts,failure:()=>failure}),error=>error===failure);
 elapsed=0;
 await assert.rejects(waitForPackagedCheckpoint(()=>false,{...opts,milliseconds:20000}),/"budgetMs":20000/);
 assert.equal(elapsed,20000,'Later checkpoints retain their original budget');
 console.log('Packaged checkpoint budgets, late startup, fatal exit and source failure passed (fake monotonic clock).');
})().catch(error=>{console.error(error);process.exitCode=1;});
