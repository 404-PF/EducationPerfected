// Fixed checker in an inert context: no OS APIs, terminal or product imports.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname,'windows-conpty-tty-check.js'),'utf8');
for (const scenario of ['guard','success','mismatch','timeout']) {
    const stdin = new EventEmitter();stdin.isTTY = scenario !== 'guard';stdin.setRawMode = value => {stdin.raw=value;};stdin.pause = () => {};
    const output=[];let timer;
    const processFixture={stdin,stdout:{isTTY:true,write(text,callback){output.push(text);if(callback)callback();}},exit(){throw new Error('Immediate exit forbidden');}};
    vm.runInNewContext(source,{process:processFixture,setTimeout(fn){timer=fn;return 1;},clearTimeout(){}}); // NOSONAR - fixed repository checker, fully inert fixture.
    if(scenario==='guard')assert.equal(processFixture.exitCode,1);
    if(scenario==='success'){stdin.emit('data',Buffer.from('inert-'));stdin.emit('data',Buffer.from('key\r'));assert.equal(processFixture.exitCode,0);assert.equal(stdin.raw,false);assert.ok(output.includes('CONPTY_TTY_RAW_INPUT_OK\n'));}
    if(scenario==='mismatch'){stdin.emit('data',Buffer.from('wrong'));assert.equal(processFixture.exitCode,2);assert.equal(stdin.raw,false);}
    if(scenario==='timeout'){timer();assert.equal(processFixture.exitCode,3);assert.equal(stdin.raw,false);}
    assert.ok(output[0].startsWith('CONPTY_CAPABILITY stdinTTY='));
    assert.doesNotMatch(output.join(''),/inert-key|wrong/);
}
console.log('ConPTY fixed checker: flushed readiness, guard1/input2/timeout3/success0 and hidden chunked input passed (inert only).');
