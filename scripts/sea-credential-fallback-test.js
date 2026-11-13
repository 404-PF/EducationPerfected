// Exact production block only. No native store, browser, network or real credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const begin = '// ===== Credentials ===== //';
const end = '// ===== Program ===== //';
assert.equal(source.split(begin).length, 2);
assert.equal(source.split(end).length, 2);
const block = source.slice(source.indexOf(begin), source.indexOf(end));
async function run({sea, saved = null, failure = false}) {
    let reads = 0, legacyLoads = 0;
    const warnings = [];
    const context = {
        process: { env: {}, stdin: { isTTY: false }, stderr: { write() {} } },
        console: { log() {}, warn(message) { warnings.push(message); } },
        require(id) {
            if (id === 'node:sea') return { isSea: () => sea };
            if (id === './lib/credential-store') return { createCredentialStore: () => ({ async read() {
                reads++;
                if (failure) throw Object.assign(new Error('inert'), {code:'EP_NATIVE_STORE'});
                return saved;
            } }) };
            if (id === 'keytar') {
                legacyLoads++;
                if (sea) throw new Error('No such built-in module: keytar');
                return { async getPassword(service, field) {
                    assert.equal(service, 'EducationPerfected');
                    return field === 'EP_EMAIL' ? 'legacy-value' : 'legacy-secret';
                } };
            }
            throw new Error('Unexpected resolver dependency');
        },
    };
    const result = await vm.runInNewContext(block + '\nresolveCredentials();', context, {timeout:1000}); // NOSONAR - exact repository credential block only, never external input.
    assert.equal(reads, 1);
    return { result, legacyLoads, warnings };
}
(async () => {
    const empty = await run({sea:true});
    assert.equal(empty.result, null);
    assert.equal(empty.legacyLoads, 0);
    assert.deepEqual(empty.warnings, []);
    const native = {email:['native','value'].join('-'), password:['native','secret'].join('-')};
    const saved = await run({sea:true, saved:native});
    assert.equal(saved.result.email, native.email);
    assert.equal(saved.result.password, native.password);
    assert.equal(saved.result.source, 'the OS credential store');
    assert.equal(saved.legacyLoads, 0);
    assert.deepEqual(saved.warnings, []);
    const unavailable = await run({sea:true, failure:true});
    assert.equal(unavailable.result, null);
    assert.equal(unavailable.legacyLoads, 0);
    assert.equal(unavailable.warnings.length, 1);
    assert.match(unavailable.warnings[0], /Saved login unavailable \(EP_NATIVE_STORE\)/);
    const legacy = await run({sea:false});
    assert.equal(legacy.legacyLoads, 2);
    assert.equal(legacy.result.source, 'the OS keychain');
    assert.deepEqual(legacy.warnings, []);
    console.log('SEA empty/saved/unavailable native store preserves fallback without optional keytar; source legacy compatibility passed (inert).');
})().catch(error => { console.error(error); process.exitCode = 1; });
