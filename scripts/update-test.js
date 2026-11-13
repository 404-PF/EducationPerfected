// Offline contracts for packaging/update.js. Fixture releases and executables only:
// no real GitHub release, tag, upload or network request is ever created.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
const { PassThrough } = require('node:stream');
const update = require('../packaging/update');

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const webStream = buffer => new ReadableStream({ start(controller) { controller.enqueue(buffer); controller.close(); } });

function fixtureExecutable(file, version) {
    fs.writeFileSync(file, '#!/bin/sh\nif [ "$1" = "version" ]; then echo ' + version + '; exit 0; fi\nexit 1\n', { mode: 0o755 });
}

function releaseList(tag, assets, flags = {}) {
    return [{
        tag_name: tag, draft: Boolean(flags.draft), prerelease: Boolean(flags.prerelease),
        assets: assets.map(([name, bytes]) => ({ name, size: bytes.length, browser_download_url: 'https://github.com/404-PF/EducationPerfected/releases/download/' + tag + '/' + name, _bytes: bytes })),
    }];
}

function fakeFetch(releases) {
    const calls = [];
    const sumsEntry = releases.flatMap(r => r.assets).find(a => a.name === update.SUMS_NAME);
    return { calls, fetch: async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        if (url === update.RELEASES_API) return { ok: true, status: 200, json: async () => releases.map(({ assets, ...rest }) => ({ ...rest, assets: assets.map(({ _bytes, ...asset }) => asset) })) };
        const asset = releases.flatMap(r => r.assets.map(a => ({ ...a, tag: r.tag_name }))).find(a => a.browser_download_url === url);
        assert.ok(asset, 'unexpected download URL ' + url);
        if (asset.name === update.SUMS_NAME) return { ok: true, status: 200, text: async () => asset._bytes.toString() };
        return { ok: true, status: 200, body: webStream(asset._bytes) };
    } };
}

const ttyPair = answer => {
    const input = new PassThrough(); input.isTTY = true;
    const output = new PassThrough(); output.isTTY = true;
    let text = ''; output.on('data', chunk => { text += chunk; });
    return { input, output, text: () => text, answer: () => input.write(answer + '\n') };
};

(async () => {
    // Version parsing and comparison: stable SemVer only.
    assert.equal(update.parseStableVersion('2026.0.0').version, '2026.0.0');
    assert.equal(update.parseStableVersion('v2026.11.30').version, '2026.11.30');
    for (const tag of ['2026.0.0-beta.1', 'v2', '2026.11', 'x2026.0.0', '2026.0.0+build', '', null, '2026.13.99.1']) assert.equal(update.parseStableVersion(tag), null, tag);
    assert.equal(update.compareVersions(update.parseStableVersion('2026.0.0'), update.parseStableVersion('2026.0.0')), 0);
    assert.equal(update.compareVersions(update.parseStableVersion('2026.0.0'), update.parseStableVersion('2026.0.1')), -1);
    assert.equal(update.compareVersions(update.parseStableVersion('2027.0.0'), update.parseStableVersion('2026.11.30')), 1);

    // Fixed platform asset names; unsupported targets refuse.
    assert.equal(update.releaseAssetName('linux', 'x64'), 'educationperfected-linux-x64');
    assert.equal(update.releaseAssetName('linux', 'arm64'), 'educationperfected-linux-arm64');
    assert.equal(update.releaseAssetName('darwin', 'arm64'), 'educationperfected-macos-arm64');
    assert.equal(update.releaseAssetName('darwin', 'x64'), 'educationperfected-macos-x64');
    assert.equal(update.releaseAssetName('win32', 'x64'), 'educationperfected-windows-x64.exe');
    assert.throws(() => update.releaseAssetName('win32', 'arm64'), /Unsupported/);
    assert.throws(() => update.releaseAssetName('linux', 'ia32'), /Unsupported/);

    // Strict SHA256SUMS parsing.
    const good = sha256(Buffer.from('a')) + '  educationperfected-linux-x64\n' + sha256(Buffer.from('b')) + ' *educationperfected-windows-x64.exe\n';
    assert.equal(update.parseSha256Sums(good).get('educationperfected-windows-x64.exe'), sha256(Buffer.from('b')));
    for (const bad of ['', 'zzz  x\n', sha256(Buffer.from('a')) + ' ../escape\n', sha256(Buffer.from('a')) + '  a\n' + sha256(Buffer.from('b')) + '  a\n', 'not-a-sum-line\n']) assert.throws(() => update.parseSha256Sums(bad), undefined, JSON.stringify(bad));

    // Release selection: stable-only, drafts/prereleases/non-SemVer skipped, assets + URLs validated.
    // The new fixture build is itself runnable so the default healthcheck (`<exe> version`) passes with it.
    const newBytes = Buffer.from('#!/bin/sh\necho 2026.1.5\n');
    const sumsBytes = Buffer.from(sha256(newBytes) + '  educationperfected-linux-x64\n');
    const releases = releaseList('v2026.1.5', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, sumsBytes]]);
    assert.equal(update.selectUpdatePlan(releases, '2026.0.0', 'educationperfected-linux-x64').version, '2026.1.5');
    assert.equal(update.selectUpdatePlan(releases, '2026.1.5', 'educationperfected-linux-x64').newer, false);
    assert.equal(update.selectUpdatePlan(releases, '2026.2.0', 'educationperfected-linux-x64').newer, false);
    assert.equal(update.selectUpdatePlan(releaseList('v2026.2.0', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, sumsBytes]], { prerelease: true }), '2026.0.0', 'educationperfected-linux-x64').newer, false);
    assert.equal(update.selectUpdatePlan(releaseList('v2026.2.0', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, sumsBytes]], { draft: true }), '2026.0.0', 'educationperfected-linux-x64').newer, false);
    assert.equal(update.selectUpdatePlan(releaseList('v2026.2.0-beta.1', []), '2026.0.0', 'educationperfected-linux-x64').newer, false);
    assert.equal(update.selectUpdatePlan([], '2026.0.0', 'educationperfected-linux-x64').newer, false);
    assert.throws(() => update.selectUpdatePlan(releaseList('v2026.1.5', [[update.SUMS_NAME, sumsBytes]]), '2026.0.0', 'educationperfected-linux-x64'), /no asset/);
    assert.throws(() => update.selectUpdatePlan(releaseList('v2026.1.5', [['educationperfected-linux-x64', newBytes]]), '2026.0.0', 'educationperfected-linux-x64'), /no SHA256SUMS/);
    const evil = releaseList('v2026.1.5', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, sumsBytes]]);
    evil[0].assets[0].browser_download_url = 'https://evil.example.com/educationperfected-linux-x64';
    assert.throws(() => update.selectUpdatePlan(evil, '2026.0.0', 'educationperfected-linux-x64'), /outside|Invalid/);
    evil[0].assets[0].browser_download_url = 'https://github.com/404-PF/EducationPerfected/releases/download/v2026.1.5/educationperfected-linux-x64?inject=1';
    assert.throws(() => update.selectUpdatePlan(evil, '2026.0.0', 'educationperfected-linux-x64'), /outside|Invalid/);
    assert.throws(() => update.selectUpdatePlan(releases, 'not-a-version', 'educationperfected-linux-x64'), /Unrecognized/);

    const base = { packaged: true, platform: 'linux', arch: 'x64', currentVersion: '2026.0.0' };
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-update-contract-'));
    const exe = path.join(home, 'educationperfected');
    fixtureExecutable(exe, '2026.0.0');
    try {
        // Source checkouts are never touched.
        assert.equal((await update.updateCommand({ ...base, packaged: false, executable: exe, fetchImpl: () => { throw new Error('no network for source checkouts'); }, output: { write() {} } })).status, 'source-checkout');

        // Already up to date: no prompt, no writes.
        {
            const { fetch } = fakeFetch(releases);
            const result = await update.updateCommand({ ...base, executable: exe, currentVersion: '2026.1.5', fetchImpl: fetch, confirm: () => { throw new Error('must not prompt'); }, output: { write() {} } });
            assert.equal(result.status, 'up-to-date');
        }

        // Non-interactive terminal fails closed before any download.
        {
            const { fetch, calls } = fakeFetch(releases);
            await assert.rejects(update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: { isTTY: false }, output: { isTTY: false, write() {} } }), /interactive/);
            assert.equal(calls.length, 1); // release list only; no asset downloads
            assert.equal(fs.readFileSync(exe, 'utf8').includes('2026.0.0'), true);
        }

        // Declining the confirmation downloads nothing.
        {
            const { fetch, calls } = fakeFetch(releases);
            const tty = ttyPair('no'); const pending = update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: tty.input, output: tty.output });
            tty.answer();
            assert.equal((await pending).status, 'cancelled');
            assert.equal(calls.length, 1);
            assert.match(tty.text(), /not a compromised publisher/);
        }

        // Successful POSIX update: verified bytes swapped in, healthcheck run, old bytes kept as backup.
        {
            const { fetch, calls } = fakeFetch(releases);
            const tty = ttyPair('update'); const pending = update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: tty.input, output: tty.output });
            tty.answer();
            const result = await pending;
            assert.equal(result.status, 'updated'); assert.equal(result.version, '2026.1.5');
            assert.ok(calls.every(call => call.method === 'GET')); // read-only against GitHub
            assert.equal(fs.readFileSync(exe, 'utf8'), newBytes.toString());
            assert.equal(fs.readFileSync(exe + '.backup', 'utf8').includes('2026.0.0'), true);
            assert.deepEqual(fs.readdirSync(home).filter(name => name.startsWith('.update')), []);
            assert.match(tty.text(), /version check passed/);
            // The replaced fixture really answers the healthcheck contract.
            const { spawnSync } = require('node:child_process');
            assert.equal(spawnSync(exe, ['version'], { encoding: 'utf8' }).stdout.trim(), '2026.1.5');
            fs.rmSync(exe + '.backup');
        }

        // An existing backup refuses the update before anything changes.
        {
            fs.writeFileSync(exe + '.backup', 'kept');
            const { fetch } = fakeFetch(releases);
            await assert.rejects(update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, confirm: () => { throw new Error('must not prompt'); }, output: { write() {} } }), /backup/);
            assert.equal(fs.readFileSync(exe + '.backup', 'utf8'), 'kept');
            fs.rmSync(exe + '.backup');
        }

        // Checksum mismatch: staged bytes discarded, executable untouched.
        {
            const badSums = Buffer.from(sha256(Buffer.from('other')) + '  educationperfected-linux-x64\n');
            const { fetch } = fakeFetch(releaseList('v2026.1.5', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, badSums]]));
            const tty = ttyPair('update'); const pending = update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: tty.input, output: tty.output });
            tty.answer();
            await assert.rejects(pending, /checksum mismatch/);
            assert.equal(fs.readFileSync(exe, 'utf8'), newBytes.toString());
            assert.deepEqual(fs.readdirSync(home).filter(name => name.startsWith('.update')), []);
        }

        // Healthcheck failure: automatic rollback to the previous bytes.
        {
            const { fetch } = fakeFetch(releases);
            const tty = ttyPair('update');
            const pending = update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: tty.input, output: tty.output, healthcheck: async () => false });
            tty.answer();
            await assert.rejects(pending, /rolled back/);
            assert.match(tty.text(), /restored automatically/);
            const { spawnSync } = require('node:child_process');
            assert.equal(spawnSync(exe, ['version'], { encoding: 'utf8' }).stdout.trim(), '2026.1.5'); // exe content is still the previous build
            assert.equal(fs.existsSync(exe + '.backup'), false);
            assert.deepEqual(fs.readdirSync(home).filter(name => name.startsWith('.update')), []);
        }

        // Missing SHA256SUMS entry refuses after verification, before replacement.
        {
            const otherSums = Buffer.from(sha256(newBytes) + '  educationperfected-macos-x64\n');
            const { fetch } = fakeFetch(releaseList('v2026.1.5', [['educationperfected-linux-x64', newBytes], [update.SUMS_NAME, otherSums]]));
            const tty = ttyPair('update'); const pending = update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, input: tty.input, output: tty.output });
            tty.answer();
            await assert.rejects(pending, /no entry/);
            assert.equal(fs.readFileSync(exe, 'utf8'), newBytes.toString());
        }

        // HTTP failures fail closed.
        await assert.rejects(update.updateCommand({ ...base, executable: exe, fetchImpl: async () => ({ ok: false, status: 403 }), output: { write() {} } }), /HTTP 403/);

        // A leftover lock refuses with its exact path, before any prompt.
        {
            fs.writeFileSync(exe + '.update.lock', '');
            const { fetch } = fakeFetch(releases);
            await assert.rejects(update.updateCommand({ ...base, executable: exe, fetchImpl: fetch, confirm: () => { throw new Error('must lock before prompting'); }, output: { write() {} } }), /Another update is active or was interrupted.*ep-update-contract/s);
            fs.rmSync(exe + '.update.lock');
        }

        console.log('Update command: version/asset/SHA256SUMS parsing, stable-only selection, URL containment, source-checkout refusal, interactive confirmation, verified staged swap, backup refusal, checksum-mismatch discard, healthcheck rollback, lock and HTTP failure contracts passed (offline fixtures only; no real release, tag or upload).');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
