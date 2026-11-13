// Inert: no browser, store or network. A fake launch captures the disconnect
// callback; closing the "browser" must drain controls and end the CLI run.
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { runCli } = require('../bin/cli');

const neverEndingInput = () => {
    const input = new Readable({ read() {} });
    input.isTTY = false;
    return input;
};
const quietOutput = collected => ({ write: text => { collected.push(text); }, isTTY: false });

(async () => {
    // External close: CLI announces it, closes controls once and resolves.
    {
        let disconnected, closes = 0;
        const out = [];
        const controls = {
            status: () => ({ state: 'stopped', mode: 'auto' }),
            close: async () => { closes += 1; return { state: 'closed', mode: 'auto' }; },
        };
        const run = runCli({
            input: neverEndingInput(),
            output: quietOutput(out),
            launch: async options => { disconnected = options.onBrowserDisconnected; return controls; },
        });
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(typeof disconnected, 'function', 'runCli must hand a disconnect callback to launch');
        disconnected();
        await run;
        assert.equal(closes, 1);
        assert.ok(out.join('').includes('Browser closed; exiting.'), out.join(''));
    }
    // Our own quit first: a later disconnect must not print or close twice.
    {
        let disconnected, closes = 0;
        const out = [];
        const input = neverEndingInput();
        const controls = {
            status: () => ({ state: 'stopped', mode: 'auto' }),
            close: async () => { closes += 1; return { state: 'closed', mode: 'auto' }; },
        };
        const run = runCli({
            input,
            output: quietOutput(out),
            launch: async options => { disconnected = options.onBrowserDisconnected; return controls; },
        });
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        input.push('quit\n');
        await run;
        assert.equal(closes, 1);
        disconnected();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(closes, 1);
        assert.ok(!out.join('').includes('Browser closed; exiting.'), out.join(''));
    }
    console.log('External browser close exits the CLI; quit-then-disconnect stays silent (inert).');
})().catch(error => { console.error(error); process.exitCode = 1; });
