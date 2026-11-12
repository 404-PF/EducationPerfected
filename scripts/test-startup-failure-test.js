const assert=require('node:assert/strict'),{startupFailure,recordStartupFailure}=require('../lib/test-startup-failure');
const error=Object.assign(new Error(String.raw`private@example.test C:\private\token net::ERR_FAILED detached Frame`),{code:'UNKNOWN',name:'ProtocolError'});
const browser={isConnected:()=>true,process:()=>({exitCode:null})};
const value=startupFailure(error,browser);assert.equal(value.frameDetached,true);assert.equal(value.navigationNetwork,true);assert.equal(value.code,'UNKNOWN');assert.equal(value.browserExit,'running');assert.equal(value.controllerConnected,true);
const text=JSON.stringify(value);for(const token of ['private','token','example.test','ERR_FAILED'])assert.ok(!text.includes(token));
assert.equal(startupFailure({name:'private',code:'private',message:'private'},null).name,'other');assert.equal(startupFailure({},null).browserCreated,false);
assert.equal(startupFailure({}, {isConnected(){throw new Error('private');},process(){throw new Error('private');}}).controllerConnected,null);
let called=false;recordStartupFailure(error,browser,false,()=>{called=true;});assert.equal(called,false);
recordStartupFailure(error,browser,true,()=>{throw new Error('private');});
let report;recordStartupFailure(error,browser,true,line=>{report=line;});assert.ok(report.startsWith('EP_TEST_STARTUP_FAILURE='));
assert.equal(startupFailure({}, {process:()=>({exitCode:1})}).browserExit,'nonzero');assert.equal(startupFailure({}, {process:()=>({exitCode:0})}).browserExit,'zero');
console.log('Catch-only startup evidence: bounded names/codes/booleans, private data excluded, observer failures inert, TEST_BOOT required.');

assert.equal(startupFailure({}, {process:()=>({exitCode:null,signalCode:'SIGTERM'})}).browserExit,'signalled');
