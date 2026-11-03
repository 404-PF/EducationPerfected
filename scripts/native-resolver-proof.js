// Test-only bridge: execute the exact production credential block without loading
// index.js's browser startup. Call only inside an already-owned native fixture.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function proveNativeResolver(store, expected) {
    const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const begin = '// ===== Credentials ===== //';
    const end = '// ===== Program ===== //';
    if (source.split(begin).length !== 2 || source.split(end).length !== 2 || source.indexOf(end) <= source.indexOf(begin)) throw new Error('Credential block boundaries changed');
    let reads = 0;
    const context = {
        process: { env: {}, get stdin() { throw new Error('Unexpected prompt fallback'); } },
        console: { warn() { throw new Error('Unexpected resolver warning'); } },
        require(id) {
            if (id !== './lib/credential-store') throw new Error('Unexpected resolver dependency');
            return { createCredentialStore() { return { async read() { reads++; return store.read(); } }; } };
        },
    };
    const script = source.slice(source.indexOf(begin), source.indexOf(end)) + '\nresolveCredentials();';
    const record = await vm.runInNewContext(script, context, { timeout: 1000 }); // NOSONAR - exact repository credential block only, never external input.
    if (reads !== 1 || record?.email !== expected.email || record?.password !== expected.password || record?.source !== 'the OS credential store') throw new Error('Native resolver proof failed');
}
module.exports = { proveNativeResolver };
