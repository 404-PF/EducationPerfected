const assert=require('node:assert/strict');
const {createTestCdpDiagnostic}=require('../lib/test-cdp-diagnostic');
const entries=[],logger=createTestCdpDiagnostic(entry=>entries.push(entry));
const send=logger('puppeteer:protocol:SEND ►'),receive=logger('puppeteer:protocol:RECV ◀');
const secret='sensitive-user:password@private-host/token';
send(JSON.stringify({id:1,method:'Page.getFrameTree',params:{secret}}));
receive(JSON.stringify({id:1,result:{frameTree:{frame:{id:secret,url:secret}}}}));
send(JSON.stringify({id:2,method:'Runtime.enable'}));
receive(JSON.stringify({id:2,error:{message:'Session closed: '+secret}}));
receive(JSON.stringify({method:'Page.frameDetached',params:{frameId:secret,reason:'swap',secret}}));
receive(JSON.stringify({method:'Inspector.detached',params:{reason:secret}}));
receive(JSON.stringify({method:'Network.requestWillBeSent',params:{secret}}));
logger('puppeteer:error')(new Error('Target closed '+secret));
receive('invalid '+secret); receive('x'.repeat(262145)); receive('null');
assert.equal(logger('unknown'),undefined);
assert.deepEqual(entries.map(({sequence,...entry})=>entry),[
 {kind:'request',method:'Page.getFrameTree'},
 {kind:'response',method:'Page.getFrameTree',status:'ok',mainFramePresent:true},
 {kind:'request',method:'Runtime.enable'},
 {kind:'response',method:'Runtime.enable',status:'error',category:'session-closed'},
 {kind:'event',method:'Page.frameDetached',reason:'swap'},
 {kind:'event',method:'Inspector.detached'},
 {kind:'suppressed-error',category:'target-closed'},
]);
assert.ok(!JSON.stringify(entries).includes(secret));
for(let i=0;i<100;i++)receive(JSON.stringify({method:'Inspector.targetCrashed'}));
assert.equal(entries.length,64);assert.equal(entries[63].sequence,64);
const throwing=createTestCdpDiagnostic(()=>{throw Error('sink failed');});
assert.doesNotThrow(()=>throwing('puppeteer:error')(new Error(secret)));
assert.doesNotThrow(()=>throwing('puppeteer:protocol:RECV ◀')('{"method":"Inspector.targetCrashed"}'));
console.log('CDP diagnostic allowlist, response correlation, redaction, malformed input, bounded output and noninterference passed (synthetic only).');
