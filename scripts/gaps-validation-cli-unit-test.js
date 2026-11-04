const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { runGapsValidation } = require('../lib/gaps-validation-cli');
(async () => {
    for (const submit of [false, true]) {
        const input = new PassThrough(), output = new PassThrough();
        let text = '', closes = 0, starts = 0;
        const before = ['SIGINT', 'SIGTERM', 'SIGHUP'].map(name => process.listenerCount(name));
        output.on('data', data => {
            text += data;
            if (text.includes('Validation control failed.') && closes === 1) input.write('quit\n');
        });
        const controls = {
            mode: async value => assert.equal(value, submit ? 'auto' : 'semi'),
            start: () => { starts++; }, stop: async () => {}, status: () => ({ state: 'stopped' }),
            close: async () => { if (++closes === 1) throw new Error('Synthetic close failure'); }
        };
        const run = runGapsValidation({ input, output, launch: async options => {
            assert.deepEqual(options, submit ? { gapsSubmitOnce: true } : { gapsFillOnly: true });
            return controls;
        } }, submit);
        await new Promise(resolve => setImmediate(resolve));
        input.write('quit\n');
        await run;
        assert.equal(closes, 2);
        assert.equal(starts, 0);
        assert.match(text, /Validation control failed/);
        assert.deepEqual(['SIGINT', 'SIGTERM', 'SIGHUP'].map(name => process.listenerCount(name)), before);
    }
    console.log('Shared validation CLI: rejected close clears cached promise, second quit succeeds, no answering starts, listeners removed in both modes PASS.');
})().catch(error => { console.error(error); process.exitCode = 1; });
