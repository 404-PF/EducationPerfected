// Inert: fake TTY stdin, spied stderr. Typed login input echoes only to a live
// terminal; redirected stderr (setup 2>setup.log) must never receive it.
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { promptSecret } = require('../index');

const fakeTtyStdin = () => {
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.raw = false;
    stdin.setRawMode = mode => { stdin.raw = mode; };
    return stdin;
};
const promptAttached = async stdin => {
    for (let i = 0; i < 1000 && stdin.listenerCount('data') === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(stdin.listenerCount('data'), 1, 'the prompt has attached its data listener');
};

(async () => {
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const originalWrite = process.stderr.write;
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    const restore = () => {
        process.stderr.write = originalWrite;
        if (ttyDescriptor) Object.defineProperty(process.stderr, 'isTTY', ttyDescriptor);
        else delete process.stderr.isTTY;
        if (stdinDescriptor) Object.defineProperty(process, 'stdin', stdinDescriptor);
    };
    try {
        // Live terminal: typed input echoes so it can be reviewed while typing.
        let stdin = fakeTtyStdin();
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
        let seen = [];
        process.stderr.write = chunk => { seen.push(String(chunk)); return true; };
        let prompt = promptSecret('First field: ', value => value);
        await promptAttached(stdin);
        stdin.push('me@example.test\r');
        assert.equal(await prompt.promise, 'me@example.test');
        assert.ok(seen.join('').includes('me@example.test'), 'a live terminal echoes typed input');
        assert.equal(stdin.raw, false, 'raw mode restored after submit');
        assert.equal(stdin.listenerCount('data'), 0, 'the prompt data listener is dropped');

        // Redirected stderr: only the label and the closing newline may be written.
        stdin = fakeTtyStdin();
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
        seen = [];
        prompt = promptSecret('Second field: ', value => value);
        await promptAttached(stdin);
        stdin.push('typed-secret\r');
        assert.equal(await prompt.promise, 'typed-secret', 'the value still resolves when echo is off');
        assert.deepEqual(seen, ['Second field: ', '\n'], 'redirected stderr receives no typed input');
    } finally {
        restore();
    }
    console.log('Login prompt: typed input echoes on a live terminal only; redirected stderr stays clean (inert).');
})().catch(error => { console.error(error); process.exitCode = 1; });
