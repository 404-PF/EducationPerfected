const assert = require('node:assert/strict');
const path = require('node:path');
const { runInertTests } = require('./windows-inert-tests');
const names = ['windows-conpty-test.py', 'windows-startup-leg-helper-test.py', 'windows-stage-transport-probe-test.py', 'windows-workflow-policy-test.py'];
for (const platform of ['win32', 'linux', 'darwin']) {
    for (const failure of ['none', 'error', 'signal', 'nonzero', 'null']) {
        const calls = [];
        const spawnSync = (command, args, options) => {
            calls.push({ command, args, options });
            if (calls.length === 2) {
                if (failure === 'error') return { error: new Error('private error'), status: null };
                if (failure === 'signal') return { signal: 'SIGTERM', status: null };
                if (failure === 'nonzero') return { status: 20 };
                if (failure === 'null') return { status: null };
            }
            return { status: 0 };
        };
        const output = [];
        const code = runInertTests(platform, spawnSync, text => output.push(text));
        assert.equal(calls.length, failure === 'none' ? 4 : 2);
        assert.equal(code, failure === 'none' ? 0 : 1);
        calls.forEach((call, index) => {
            assert.equal(call.command, platform === 'win32' ? 'python' : 'python3');
            assert.deepEqual(Array.from(call.args), ['-B', path.join(__dirname, names[index])]);
            assert.equal(call.options.shell, false);
            assert.equal(call.options.timeout, 60000);
            assert.equal(call.options.stdio, 'inherit');
        });
        assert.equal(output.some(text => text.includes('private error')), false);
    }
}
const pkg = require('../package.json');
assert.equal(pkg.scripts['test:windows-inert'], 'node scripts/windows-inert-tests-policy-test.js && node scripts/windows-inert-tests.js');
assert.ok(pkg.scripts['test:packaged-harness'].split(' && ').includes('npm run test:windows-inert'));
console.log('Windows inert test discovery: fixed script list, Python platform choice, shell-free invocation and fail-fast error/signal/status controls passed (injected executor only).');
