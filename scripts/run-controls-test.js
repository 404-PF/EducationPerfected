const assert = require('node:assert/strict');
const { createRunControls } = require('../lib/run-controls');
(async () => {
    let runs = 0, stops = 0, closes = 0, release;
    const controls = createRunControls({
        run: () => { runs += 1; return new Promise(resolve => { release = resolve; }); },
        requestStop: () => { stops += 1; }, setMode: () => {}, refresh: () => {}, close: () => { closes += 1; },
    });
    assert.equal(controls.status().state, 'stopped');
    controls.start(); controls.start();
    await Promise.resolve();
    assert.equal(runs, 1);
    const a = controls.stop(), b = controls.stop();
    assert.equal(a, b); assert.equal(stops, 1); assert.equal(controls.status().state, 'stopping');
    controls.start(); assert.equal(runs, 1);
    await assert.rejects(controls.mode('semi'));
    release(); await a; assert.equal(controls.status().state, 'stopped');
    await controls.mode('semi'); assert.equal(controls.status().mode, 'semi');
    controls.start(); await controls.stop(); assert.equal(runs, 1, 'same-tick stop must cancel queued start');
    controls.start(); await Promise.resolve(); assert.equal(runs, 2);
    const c = controls.close(); assert.equal(controls.status().state, 'closing');
    release(); await c; assert.equal(closes, 1); assert.equal(controls.status().state, 'closed');
    controls.start(); await controls.close(); assert.equal(runs, 2); assert.equal(closes, 1);
    const failing = createRunControls({ run: () => { throw new Error('fixture failure'); }, requestStop: () => {}, setMode: () => {}, refresh: () => {}, close: () => {} });
    failing.start(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(failing.status().state, 'error');
    for (const action of ['mode', 'refresh']) {
        let finish, didClose = 0;
        const updating = createRunControls({ run: () => {}, requestStop: () => {}, setMode: () => new Promise(r => { finish = r; }), refresh: () => new Promise(r => { finish = r; }), close: () => { didClose += 1; } });
        const change = action === 'mode' ? updating.mode('semi') : updating.refresh();
        await Promise.resolve();
        const closing = updating.close();
        assert.equal(updating.status().state, 'closing');
        assert.equal(didClose, 0);
        finish(); await change; await closing;
        assert.equal(didClose, 1); assert.equal(updating.status().state, 'closed');
    }
    const completed = createRunControls({ run: async () => ({ reason: 'completed' }), requestStop: () => {}, setMode: () => {}, refresh: () => {}, close: () => {} });
    completed.start(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed.status().state, 'completed');
    await completed.stop(); assert.equal(completed.status().state, 'completed');
    completed.start(); assert.equal(completed.status().state, 'running');
    await new Promise(resolve => setImmediate(resolve)); await completed.close();
    let externalStop = 0, externalRelease;
    const external = createRunControls({ run: () => new Promise(r => { externalRelease = r; }), requestStop: () => { externalStop += 1; }, setMode: () => {}, refresh: () => {}, close: () => { throw new Error('already closed'); } });
    external.start(); await Promise.resolve();
    external.browserClosed(); assert.equal(external.status().state, 'closed');
    external.start(); assert.equal(externalStop, 1);
    const drainedExternal = external.close(); externalRelease(); await drainedExternal;
    assert.equal(external.status().state, 'closed');
    let queuedRuns = 0;
    const queued = createRunControls({ run: () => { queuedRuns += 1; }, requestStop: () => {}, setMode: () => {}, refresh: () => {}, close: () => {} });
    queued.start(); queued.browserClosed();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(queuedRuns, 0); assert.equal(queued.status().state, 'closed');
    const { diagnostic } = require('../lib/diagnostics');
    const secret = new Error('private payload https://user:password@example.invalid/private'); secret.code = 'ENOENT';
    assert.match(diagnostic(secret), /ENOENT.*missing/);
    assert.doesNotMatch(diagnostic(secret), /private|password|example/);
    assert.match(diagnostic(Object.assign(new Error('arbitrary'), { name: 'TimeoutError' })), /timed out/);
    assert.match(diagnostic(new Error('Missing X server or DISPLAY')), /could not launch/);
    assert.doesNotMatch(diagnostic(new Error('Question displayed unexpectedly')), /display and system browser/);
    assert.doesNotMatch(diagnostic(new Error('REDISPLAY')), /display and system browser/);
    const { windowsTaskkillPath } = require('./test-process-cleanup');
    assert.equal(windowsTaskkillPath('C:\\Windows'), 'C:\\Windows\\System32\\taskkill.exe');
    assert.throws(() => windowsTaskkillPath('Windows'));
    assert.throws(() => windowsTaskkillPath('C:\\Windows\\..\\other'));
    console.log('Run controls: idempotent start/stop, stop drain, mode guard, same-tick cancel, close passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
