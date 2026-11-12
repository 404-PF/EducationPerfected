const assert=require('node:assert/strict'),{startupEvidence}=require('./packaged-startup-evidence');
const empty=startupEvidence('');assert.ok(Object.values(empty).every(value=>value===false));
const evidence=startupEvidence('secret@example.test C:\\private\\token EducationPerfected could not start. Startup failed: The browser could not launch; check display and system browser dependencies.');
assert.equal(evidence.startupFailed,true);assert.equal(evidence.launchFailed,true);assert.equal(evidence.ownerReady,false);
assert.ok(Object.values(evidence).every(value=>typeof value==='boolean'));for(const privatePart of ['secret@example.test','private','token','secret'])assert.ok(!JSON.stringify(evidence).includes(privatePart));
assert.equal(startupEvidence('The browser sandbox was blocked by operating-system policy.').sandboxBlocked,true);
assert.deepEqual(startupEvidence('arbitrary\nraw\noutput'),empty);
console.log('Packaged startup evidence returns fixed literal booleans only; arbitrary child contents excluded.');

const {parseStartupFailure}=require('./packaged-startup-evidence'),{startupFailure}=require('../lib/test-startup-failure');
const cause=startupFailure(new Error('private'),null),line='EP_TEST_STARTUP_FAILURE='+JSON.stringify(cause);
assert.deepEqual(parseStartupFailure(line),cause);
for(const input of [line+'\n'+line,'EP_TEST_STARTUP_FAILURE='+JSON.stringify({...cause,name:'private'}),'EP_TEST_STARTUP_FAILURE='+JSON.stringify({...cause,private:'private'}),'EP_TEST_STARTUP_FAILURE={bad}'])assert.equal(parseStartupFailure(input),null);
console.log('Owner cause parser enforces one exact bounded-field receipt, duplicate/unknown/private payloads rejected.');
