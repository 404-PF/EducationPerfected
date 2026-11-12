const assert=require('node:assert/strict'),{startupEvidence}=require('./packaged-startup-evidence');
const empty=startupEvidence('');assert.ok(Object.values(empty).every(value=>value===false));
const evidence=startupEvidence('secret@example.test C:\\private\\token EducationPerfected could not start. Startup failed: The browser could not launch; check display and system browser dependencies.');
assert.equal(evidence.startupFailed,true);assert.equal(evidence.launchFailed,true);assert.equal(evidence.ownerReady,false);
assert.ok(Object.values(evidence).every(value=>typeof value==='boolean'));assert.ok(!JSON.stringify(evidence).includes('secret'));
assert.deepEqual(startupEvidence('arbitrary\nraw\noutput'),empty);
console.log('Packaged startup evidence returns fixed literal booleans only; arbitrary child contents excluded.');
