const assert = require('node:assert/strict');
const { audioAllowed, audioPolicyUnchanged } = require('../lib/audio-policy');
const base = { kind:'audio', key:'invented-round',autoMarked:'unknown', sectionDataPresent:false, selfTestList:false,classicAssignedAudio:true,audioContextSignature:'invented-assigned-context' };
assert.equal(audioAllowed(base),true);
for(const changed of [{autoMarked:false},{sectionDataPresent:true},{classicAssignedAudio:false},{kind:'typed'}]) assert.equal(audioAllowed({...base,...changed}),false);
for(const changed of [{audioContextSignature:'different task'},{key:'changed'},{classicAssignedAudio:false},{autoMarked:false},{sectionDataPresent:true}]) assert.equal(audioPolicyUnchanged(base,{...base,...changed}),false);
assert.equal(audioPolicyUnchanged(base,{...base}),true);
console.log('Audio policy: narrow assigned allowance, manual precedence and task-context freshness passed.');
const variants = [
    {...base,autoMarked:true,classicAssignedAudio:false,audioContextSignature:'auto'},
    {...base,selfTestList:true,classicAssignedAudio:false,audioContextSignature:'self'},
    base,
];
for (let i=0;i<variants.length;i++) for(let j=0;j<variants.length;j++) {
    assert.equal(audioPolicyUnchanged(variants[i],variants[j]),i===j,`basis ${i}->${j}`);
    // Even equal signatures cannot bridge a distinct allowance basis.
    if(i!==j) assert.equal(audioPolicyUnchanged(variants[i],{...variants[j],audioContextSignature:variants[i].audioContextSignature}),false);
}
for (const d of [undefined,null,{}, {...base,answers:undefined}]) {
    assert.equal(typeof audioAllowed(d),'boolean');
    assert.equal(typeof audioPolicyUnchanged(base,d,'invented'),'boolean');
}
console.log('Audio policy: all six allowance-basis transitions refuse symmetrically; Boolean result hygiene passed.');
