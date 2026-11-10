const assert = require('node:assert/strict');
const { createRunControls } = require('../lib/run-controls');
(async () => {
    let reads = 0, runs = 0, finishInspect, finishRun, closes = 0;
    const controls = createRunControls({
        run() { runs++; return new Promise(resolve => { finishRun = resolve; }); },
        inspect() { reads++; return new Promise(resolve => { finishInspect = resolve; }); },
        requestStop() {}, setMode() {}, refresh() {}, close() { closes++; },
    });
    const inspecting = controls.inspect();
    assert.equal(controls.status().state, 'updating');
    controls.start(); await assert.rejects(controls.inspect()); await assert.rejects(controls.mode('semi')); await assert.rejects(controls.refresh());
    await Promise.resolve(); assert.equal(runs, 0); assert.equal(reads, 1);
    finishInspect({ guard: 'captured' }); assert.deepEqual(await inspecting, { guard: 'captured' });
    controls.start(); await Promise.resolve(); await assert.rejects(controls.inspect()); assert.equal(reads, 1);
    finishRun(); await controls.stop();
    const second = controls.inspect(); await Promise.resolve();
    const closing = controls.close(); assert.equal(closes, 0);
    finishInspect({ guard: 'captured' }); await second; await closing;
    assert.equal(closes, 1); await assert.rejects(controls.inspect());
    const failed = createRunControls({ inspect() { throw new Error('fixture'); } });
    await assert.rejects(failed.inspect()); assert.equal(failed.status().state, 'stopped');
    console.log('Inspection controls PASS: stopped-only, exclusive with starts/mode/refresh, close waits, errors unlock.');
})().catch(error => { console.error(error); process.exitCode = 1; });
