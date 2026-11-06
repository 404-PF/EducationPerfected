const assert=require('node:assert/strict');
const {collectDropdownDiagnostics,BUILD}=require('../lib/dropdown-diagnostics');
const {createSubmitDropdownOnce}=require('../lib/dropdown-once');
(async()=>{
 let calls=0,laterCalls=0;const never={evaluate(){calls++;return new Promise(()=>{});}},later={evaluate(){laterCalls++;throw Error('must not run');}};
 let start=Date.now();let r=await collectDropdownDiagnostics({frames:()=>[never,later]},{timeoutMs:35});assert.equal(r.incomplete,'timeout');assert.equal(calls,1);assert.equal(laterCalls,0);assert.ok(Date.now()-start<500);
 calls=0;let stopped=false;const timer=setTimeout(()=>{stopped=true;},20);start=Date.now();r=await collectDropdownDiagnostics({frames:()=>[never,later]},{shouldStop:()=>stopped});clearTimeout(timer);assert.equal(r.incomplete,'cancelled');assert.equal(calls,1);assert.equal(laterCalls,0);assert.ok(Date.now()-start<500);
 calls=0;r=await collectDropdownDiagnostics({frames:()=>[never]},{shouldStop:()=>true});assert.equal(r.incomplete,'cancelled');assert.equal(calls,0);
 const bad={evaluate(){return Promise.reject(Error('private details must not leak'));}};r=await collectDropdownDiagnostics({frames:()=>[bad]});assert.equal(r.frames[0].domError,'inspection-unavailable');assert.equal(r.frames[0].detection.guard,'inspection-threw');assert.ok(!JSON.stringify(r).includes('private details'));
 const once=createSubmitDropdownOnce({detectQuestion:async()=>({kind:'unsupported'}),playDropdownRound:()=>{throw Error('must not answer');}});r=await once({frames(){throw Error('collection unavailable');}});assert.equal(r.status,'refused');assert.deepEqual(r.diagnostics,{build:BUILD,error:'inspection-unavailable'});assert.equal((await once({})).reason,'attempt-consumed');
 console.log('Dropdown diagnostic unit PASS: deadline, pending cancellation, pre-cancel0reads, no following-frame reads, sanitized frame/collection errors, consumed refusal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
