const assert = require('node:assert/strict');
const {validate} = require('./release-gate');
const criteria = require('../release/criteria.json');
const commit='a'.repeat(40), record=()=>({status:'passed',sourceCommit:commit,evidence:'fixture-report',reviewer:'fixture-reviewer'});
const evidence={schemaVersion:1,sourceCommit:commit,global:{},targets:{}};
assert.ok(validate({},commit).length);
for(const check of criteria.globalChecks)evidence.global[check]=record();
for(const target of criteria.targets){evidence.targets[target]={};for(const check of criteria.targetChecks)evidence.targets[target][check]=record();}
assert.deepEqual(validate(evidence,commit),[]);
evidence.targets['windows-x64']['console-shutdown'].status='skipped';assert.ok(validate(evidence,commit).some(x=>x.includes('windows-x64/console-shutdown')));
evidence.targets['windows-x64']['console-shutdown']=record();
assert.ok(validate(evidence,'b'.repeat(40)).some(x=>x.includes('commit')));
delete evidence.targets['linux-arm64']['clean-machine-no-node'].evidence;assert.ok(validate(evidence,commit).some(x=>x.includes('missing evidence')));
console.log('Release gate: incomplete, skipped native console, stale commit and missing evidence rejected; complete synthetic record accepted only as schema proof.');
