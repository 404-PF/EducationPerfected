// No browser needed: hold the launch promise and verify cleanup ownership.
const assert = require('node:assert/strict');
if (process.argv.includes('--child')) {
    const Module = require('node:module'), load = Module._load;
    let release, closes = 0;
    Module._load = function(id, ...args) {
        if (id === 'puppeteer') return { launch: () => new Promise(resolve => { release = resolve; }) };
        return load.call(this, id, ...args);
    };
    require('../index').launchProgram().catch(() => { process.exitCode = 1; });
    process.emit('SIGINT');
    assert.equal(closes, 0);
    release({ close: async () => { closes += 1; console.log('Fixture browser closed exactly once: ' + closes); }, process: () => null, disconnect: () => {} });
} else {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, [__filename, '--child'], { encoding: 'utf8', timeout: 8000 });
    assert.ifError(result.error);
    assert.equal(result.status, 130);
    assert.match(result.stdout, /Cancellation requested; waiting for browser launch before cleanup/);
    assert.match(result.stdout, /Fixture browser closed exactly once: 1/);
    console.log('Pending launch cancellation gives feedback and closes eventual browser.');
}
