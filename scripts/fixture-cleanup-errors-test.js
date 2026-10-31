const assert = require('node:assert/strict');
const { finishFixtureCleanup } = require('./fixture-cleanup-errors');
(async () => {
 const primary = new Error('checkpoint'), stop = Object.assign(new Error('child cleanup'),{code:'ETIMEDOUT'});
 let later = false, reports = [];
 const run = async () => {
  try { throw primary; }
  finally { await finishFixtureCleanup(primary,[async()=>{throw stop;},()=>{later=true;}],text=>reports.push(text)); }
 };
 await assert.rejects(run,error=>error===primary);
 assert.equal(later,true); assert.deepEqual(reports,['Fixture cleanup also failed (ETIMEDOUT).']);
 later=false;
 await assert.rejects(finishFixtureCleanup(null,[()=>{throw stop;},()=>{later=true;throw new Error('later cleanup');}],()=>{}),error=>error===stop);
 assert.equal(later,true);
 for (const value of [null,undefined,0,false,'plain rejection']) {
  let ran=false, caught=false;
  try {await finishFixtureCleanup(null,[()=>Promise.reject(value),()=>{ran=true;}],()=>{});}
  catch(error) {caught=true;assert.equal(error,value);}
  assert.equal(caught,true);assert.equal(ran,true);
 }
 await finishFixtureCleanup(null,[()=>{}],()=>{});
 console.log('Fixture cleanup preserves primary errors, runs later cleanup, and fails cleanup-only errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});
