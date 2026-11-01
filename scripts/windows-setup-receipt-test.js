const assert = require('node:assert/strict');
const {setupReceipt} = require('./windows-setup-receipt');
const success='EP_SETUP_CLOSED_SUCCESS\n';
const failure='EP_SETUP_PRIMARY=console-child-nonzero\nEP_SETUP_CLOSED_FAILURE\n';
assert.deepEqual(setupReceipt(success,0,{closed:true}),{certain:true,success:true});
assert.deepEqual(setupReceipt(failure,1,{closed:true}),{certain:true,success:false});
for(const code of [0,1,3,20,259,0xC0000142,null]) {
    for(const text of ['',success+success,success+'trailing\n',failure+failure,failure+'trailing\n','prefix'+failure,'prefix'+success,'EP_SETUP_UNCERTAIN\n']) assert.equal(setupReceipt(text,code,{closed:true}).certain,false);
    if(code!==0)assert.equal(setupReceipt(success,code,{closed:true}).certain,false);
    if(code!==1)assert.equal(setupReceipt(failure,code,{closed:true}).certain,false);
}
for(const state of [{closed:false},{closed:true,terminatedByUs:true},{closed:true,timedOut:true}]) {
    assert.equal(setupReceipt(success,0,state).certain,false);
    assert.equal(setupReceipt(failure,1,state).certain,false);
}
assert.equal(setupReceipt('EP_SETUP_PRIMARY=private-native-text\nEP_SETUP_CLOSED_FAILURE\n',1,{closed:true}).certain,false);
console.log('Setup receipt: exact terminal handshake/code pairing, duplicates/trailing output/crash/parent kill/timeout fail closed (inert only).');
