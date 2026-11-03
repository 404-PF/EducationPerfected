const assert = require('node:assert/strict');
const {setupReceipt,setupReceiptDiagnostic} = require('./windows-setup-receipt');
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

for(const text of [success.replace(/\n/g,'\r\n'), failure.replace(/\n/g,'\r\n')]) {
    assert.equal(setupReceipt(text,text.startsWith('EP_SETUP_CLOSED_SUCCESS')?0:1,{closed:true}).certain,false);
}
assert.match(setupReceiptDiagnostic(success.replace(/\n/g,'\r\n'),0,{closed:true}),/receipt=success-crlf/);
assert.match(setupReceiptDiagnostic(failure.replace(/\n/g,'\r\n'),1,{closed:true}),/receipt=failure-crlf/);
assert.match(setupReceiptDiagnostic(success,0,{closed:true}),/receipt=success-lf/);
const privateText='sensitive-path-and-native-error';
const diagnostic=setupReceiptDiagnostic(privateText,0xC0000142,{closed:false,terminatedByUs:true,timedOut:true,helperError:true});
assert.equal(diagnostic,'Setup helper checkpoint: exit=other; receipt=unrecognized; closed=false; timeout=true; parentKill=true; stderrOrError=true');
assert.ok(!diagnostic.includes(privateText));
console.log('Strict receiver still rejects CRLF; fixed-only diagnostics distinguish line endings without granting certainty.');
assert.match(setupReceiptDiagnostic(failure.replace('PRIMARY=console-child-nonzero\n','PRIMARY=console-child-nonzero\r\n'),1,{closed:true}),/receipt=unrecognized/);
