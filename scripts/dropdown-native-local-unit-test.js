const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {runLocal,localVariant}=require('./dropdown-native-local');
assert.equal(localVariant([]),'legacy');
assert.equal(localVariant(['--f4-popup']),'f4-popup');
assert.equal(localVariant(['--variant=f4-popup']),'f4-popup');
assert.equal(localVariant(['--variant','f4-popup']),'f4-popup');
assert.throws(()=>localVariant(['--variant=other']),/Unknown local dropdown variant/);
async function testShutdown() {
    const signals=new EventEmitter();
    let release,closed=0,pageReads=0;
    const launched=new Promise(resolve=>{release=resolve;});
    const pending=runLocal({signals,launch:()=>launched});
    signals.emit('SIGINT');
    release({pages:async()=>{pageReads++;return [];},close:async()=>{closed++;},process:()=>null});
    await pending;
    assert.equal(closed,1);
    assert.equal(pageReads,0);
    assert.equal(signals.listenerCount('SIGINT'),0);
    async function cancelPrompt(source) {
        const signals=new EventEmitter(),terminal=new EventEmitter();
        let closed=0;
        terminal.close=()=>{};
        terminal.question=async(text,{signal})=>new Promise((resolve,reject)=>{
            signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
            setImmediate(()=>source==='terminal'?terminal.emit('SIGINT'):signals.emit('SIGTERM'));
        });
        const browser={pages:async()=>[{setContent:async()=>{}}],close:async()=>{closed++;},process:()=>null};
        await runLocal({signals,launch:async()=>browser,makeTerminal:()=>terminal});
        assert.equal(closed,1);
        assert.equal(signals.listenerCount('SIGTERM'),0);
        assert.equal(terminal.listenerCount('SIGINT'),0);
    }
    await cancelPrompt('terminal');
    await cancelPrompt('process');
    console.log('Local native harness shutdown PASS: deferred-launch cancellation and pending-question terminal/process cancellation close exactly once. Inert unit mocks, not Windows console proof.');
}
let completed=false;
process.on('exit',()=>{if(!completed){console.error('Local shutdown test did not complete assertions.');process.exitCode=1;}});
testShutdown().then(()=>{completed=true;}).catch(error=>{console.error(error);process.exitCode=1;});
