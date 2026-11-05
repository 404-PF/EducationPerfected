const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
require('puppeteer');
const puppeteerModule = require.cache[require.resolve('puppeteer')];
const mock = require('./mock-ep');
const cleanup = require('./test-process-cleanup');
(async () => {
    const original = { spawn: childProcess.spawn, puppeteer: puppeteerModule.exports, server: mock.createServer, cleanup: cleanup.cleanupTestProcess };
    try {
        for (const mode of ['exited', 'signal', 'missing-group', 'connected-browser']) {
            let groupCleanups = 0, serverCloses = 0, connections = 0, browserCloses = 0;
            const order = [];
            const primary = new Error('Synthetic primary checkpoint error');
            const child = { pid: 123, exitCode: mode === 'exited' ? 0 : null, signalCode: mode === 'signal' ? 'SIGTERM' : null, stdout: new PassThrough(), stderr: new PassThrough() };
            mock.createServer = () => ({ listen: (port, host, done) => done(), address: () => ({ port: 1234 }), close: done => { serverCloses++; done(); } });
            childProcess.spawn = () => { setImmediate(() => child.stdout.write('EP_WS_ENDPOINT=ws://fixture-only\n')); return child; };
            puppeteerModule.exports = { connect: async () => { connections++; if (mode === 'connected-browser') return { waitForTarget: async () => { throw primary; }, close: async () => { browserCloses++; order.push('browser'); } }; throw primary; } };
            cleanup.cleanupTestProcess = target => { assert.equal(target, child); groupCleanups++; order.push('group'); throw Object.assign(new Error('Group already gone'), { code: 'ESRCH' }); };
            delete require.cache[require.resolve('./fixture-cli-session')];
            const { bootFixtureCli } = require('./fixture-cli-session');
            const started = Date.now();
            await assert.rejects(bootFixtureCli('cli.js', 'unused'), error => ['missing-group', 'connected-browser'].includes(mode) ? error === primary : /Fixture CLI checkpoint failed/.test(error.message));
            assert.equal(groupCleanups, 1, mode);
            assert.equal(serverCloses, 1, mode);
            assert.equal(connections, ['missing-group', 'connected-browser'].includes(mode) ? 1 : 0, mode);
            assert.equal(browserCloses, mode === 'connected-browser' ? 1 : 0, mode);
            if (mode === 'connected-browser') assert.deepEqual(order, ['group', 'browser']);
            assert.ok(Date.now() - started < 1000, mode);
        }
    } finally {
        childProcess.spawn = original.spawn; puppeteerModule.exports = original.puppeteer;
        mock.createServer = original.server; cleanup.cleanupTestProcess = original.cleanup;
        delete require.cache[require.resolve('./fixture-cli-session')];
    }
    console.log('Fixture CLI helper: exited/signal child cleanup attempted, ESRCH preserves primary, signal failure prompt, server closed PASS.');
})().catch(error => { console.error(error); process.exitCode = 1; });
