const assert = require('node:assert/strict');
const { createCredentialStore } = require('../lib/credential-store');
const { credentialCommand } = require('../bin/cli');
(async () => {
    let value = null, options, saved = 0;
    class FixtureEntry {
        constructor(service, account, opts) { assert.equal(service, 'EducationPerfected'); assert.equal(account, 'login-v1'); options = opts; }
        async getPassword() { return value; }
        async setPassword(record) { value = record; saved++; }
        async deletePassword() { const existed = value !== null; value = null; return existed; }
    }
    const store = createCredentialStore({ Entry: FixtureEntry });
    assert.equal(await store.read(), null);
    const fixture = { email: 'fixture@example.test', password: 'fixture-only- secret ' };
    await store.save(fixture); assert.equal(saved, 1); assert.deepEqual(await store.read(), fixture);
    assert.deepEqual(options, { linux: { store: 'secret-service' } });
    value = '{broken'; await assert.rejects(() => store.read(), /invalid/);
    value = JSON.stringify({ version: 1, email: fixture.email }); await assert.rejects(() => store.read(), /invalid/);
    await assert.rejects(() => store.save({}), /required/);
    let text = ''; const output = { write: line => { text += line; } };
    await credentialCommand('--setup', { store, output, prompt: async () => fixture });
    assert.ok(text.includes('Login saved')); assert.ok(!text.includes(fixture.password));
    const old = value;
    await credentialCommand('--setup', { store, output, prompt: async () => null }); assert.equal(value, old);
    await credentialCommand('--forget-credentials', { store, output }); assert.equal(await store.read(), null);
    for (const [raw,expected] of [[null,'No saved login was found.\n'],[JSON.stringify({version:1,...fixture}),'Saved login is available and its record is valid.\n']]) {
        value=raw; const before=saved; let outputText='';
        await credentialCommand('--check-credentials',{store,output:{write:line=>{outputText+=line;}},prompt:async()=>{throw Error('Health check must not prompt');}});
        assert.equal(outputText,expected);assert.equal(value,raw);assert.equal(saved,before);
        assert.ok(!outputText.includes(fixture.email) && !outputText.includes(fixture.password));
    }
    for (const raw of ['{broken',JSON.stringify({version:1,email:fixture.email})]) {
        value=raw;await assert.rejects(()=>credentialCommand('--check-credentials',{store,output}),/invalid/);assert.equal(value,raw);
    }
    await assert.rejects(()=>credentialCommand('--check-credentials',{store:{read:async()=>{throw Error('unavailable');},save:async()=>{throw Error('must not write');},remove:async()=>{throw Error('must not remove');}},output}),/unavailable/);
    class BrokenEntry { constructor() { throw new Error('unavailable'); } }
    await assert.rejects(() => createCredentialStore({ Entry: BrokenEntry }).save(fixture), /unavailable/);
    console.log('Native-store contract: versioned atomic record, persistent Linux selection, malformed/empty/unavailable errors, setup/cancel/delete and no secret output passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
