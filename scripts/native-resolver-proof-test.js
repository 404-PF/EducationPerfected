// Inert controls only. No native binding, browser, credential prompt or network.
const assert = require('node:assert/strict');
const { proveNativeResolver } = require('./native-resolver-proof');
(async () => {
    const expected = { email: ['resolver', 'example.test'].join('@'), password: ['inert', 'resolver'].join('-') };
    let calls = 0;
    await proveNativeResolver({ async read() { calls++; return { ...expected }; } }, expected);
    assert.equal(calls, 1);
    for (const value of [null, { ...expected, email: String(0) }, { ...expected, password: String(0) }]) {
        await assert.rejects(proveNativeResolver({ async read() { return value; } }, expected));
    }
    await assert.rejects(proveNativeResolver({ async read() { throw new Error('inert failure'); } }, expected));
    const fs = require('node:fs');
    const read = fs.readFileSync;
    const indexPath = require('node:path').join(__dirname, '../index.js');
    const source = read(indexPath, 'utf8');
    const mutations = [
        text => text.replace('// ===== Program ===== //', '// changed boundary'),
        text => text + '\n// ===== Credentials ===== //',
        text => text.replace("if (process.env.EP_TEST_BOOT === '1') return null;", 'return null;'),
        text => text.replace("source: 'the OS credential store'", "source: 'wrong source'"),
        text => text.replace('if (saved) return { ...saved,', "if (saved) return { ...saved, password: String(0),"),
        text => text.replace('if (saved) return { ...saved,', "if (saved) { await require('./lib/credential-store').createCredentialStore().read(); } if (saved) return { ...saved,"),
    ];
    let intercepted = 0;
    try {
        for (const mutate of mutations) {
            const changed = mutate(source);
            assert.notEqual(changed, source);
            fs.readFileSync = (file, ...args) => {
                if (file !== indexPath) return read(file, ...args);
                intercepted++; return changed;
            };
            await assert.rejects(proveNativeResolver({ async read() { return { ...expected }; } }, expected));
        }
        assert.equal(intercepted, mutations.length);
    } finally { fs.readFileSync = read; }
    console.log('Production resolver exact-block bridge: single read, pair/source checks and fail-closed fallbacks passed (inert only).');
})().catch(() => { console.error('Resolver bridge inert controls failed.'); process.exitCode = 1; });
