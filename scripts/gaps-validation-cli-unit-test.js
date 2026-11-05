const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { runGapsValidation } = require('../lib/gaps-validation-cli');
const { launchProgram } = require('../index');
const { guardVerifiedPointDispatch } = require('./verified-point-dispatch-fixture');
(async () => {
    // Negative control: a forbidden handle click must increment and throw;
    // a verified mouse point is forwarded, and the target path is counted.
    let forwarded = 0;
    const element = {click: async () => { throw Error('unpatched click'); }};
    const button = {asElement: () => element};
    const handle = {getProperty: async () => button};
    const dispatch = guardVerifiedPointDispatch({mouse: {click: async () => {forwarded++;}}, evaluateHandle: async () => handle});
    const evaluated = await dispatch.page.evaluateHandle(null, null, 'submit');
    await assert.rejects((await evaluated.getProperty('target')).asElement().click(), /Must dispatch verified point/);
    assert.equal(dispatch.targetPaths(), 1);assert.deepEqual(dispatch.counts(), [0,1]);
    await dispatch.page.mouse.click(4,5);assert.equal(forwarded,1);assert.deepEqual(dispatch.counts(),[1,1]);
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
        let timer;
        try { await Promise.race([run, new Promise((_, reject) => { timer = setTimeout(() => { input.end(); reject(new Error('Close retry test timed out')); }, 2000); })]); }
        finally { clearTimeout(timer); }
        assert.equal(closes, 2);
        assert.equal(starts, 0);
        assert.match(text, /Validation control failed/);
        assert.deepEqual(['SIGINT', 'SIGTERM', 'SIGHUP'].map(name => process.listenerCount(name)), before);
    }
    for(const options of [
        {gapsSubmitOnce:true,gapsFillOnly:true}, {gapsSubmitOnce:true,choiceSelectOnly:true},
        {gapsFillOnly:true,choiceSelectOnly:true}, {gapsSubmitOnce:true,legacySignals:true},
        {gapsFillOnly:true,legacySignals:true}, {choiceSelectOnly:true,legacySignals:true}
    ]) await assert.rejects(launchProgram(options),/exclusive nonlegacy/);
    console.log('All mixed validation modes and legacy validation launches refuse before browser startup PASS');
    console.log('Shared validation CLI: rejected close clears cached promise, second quit succeeds, no answering starts, listeners removed in both modes PASS.');
})().catch(error => { console.error(error); process.exitCode = 1; });
