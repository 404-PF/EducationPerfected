// Guards the credential handling from issue #6: credentials live at runtime only.
//
//   node scripts/credentials-test.js
//
// Two halves:
//   1. a static scan of every path `git add -A` would commit (index.js included) for
//      `name = 'literal'` assignments that look like credentials, plus the rules that
//      keep local secret files out of commits (no .env source, dotfiles ignored);
//   2. the runtime resolution order of index.js's credential block
//      (env vars > OS keychain > terminal prompt, with nothing written to disk), run
//      from an isolated copy of that block against a stub `keytar`, so the real
//      program is never launched and no repository file is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
// SonarCloud: resolve git binary to an absolute, fixed path (no PATH lookup)
const GIT = (() => {
    if (process.platform === 'win32') return 'git.exe';
    const candidates = [
        process.env.GIT_EXEC_PATH,
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/opt/homebrew/bin/git',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return 'git'; // fallback (SonarCloud will warn, but CI has git in fixed locations)
})();
const CHECKS = [];
function check(name) {
    CHECKS.push(name);
    console.log(`  ok  ${name}`);
}

function git(...args) {
    return execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' });
}

// --- 1. nothing commit-able holds a credential -------------------------------------

const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
// Untracked-but-not-ignored files are what `git add -A` would commit next.
const untracked = git('ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean);
const committable = [...new Set([...tracked, ...untracked])]
    .filter(f => fs.existsSync(path.join(ROOT, f))); // skip tracked-but-deleted files
assert.ok(committable.includes('index.js'), 'index.js is part of the scanned set');

const TEXT = /\.(js|mjs|cjs|json|md|cmd|sh|txt|yml|yaml)$/i;
// `name = 'literal'` / `name: "literal"` where the name IS a secret-ish field
// (email, password, token, apiKey ...). Reads of process.env, function calls and
// variables are not literals and are fine; names that merely contain such a word
// (CREDENTIAL_SERVICE, secretPrompt) name a service or a helper, not a value.
const SECRET_NAME = /^(?:e-?mail|user(?:name)?|login|pass(?:word|wd)?|(?:api[_-]?)?(?:key|token|secret|credential)s?)$/i;
const LITERAL = /["'`]([^"'`\s]{3,})["'`]/;

for (const file of committable.filter(f => TEXT.test(f))) {
    fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
        const assignment = line.replace(/\/\/.*$/, '').match(/^\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(.+)$/);
        if (!assignment || !SECRET_NAME.test(assignment[1])) return;
        // selectors are not secrets (password_css: '#password')
        if (/css|selector/i.test(assignment[1])) return;
        if (!LITERAL.test(assignment[2])) return;
        assert.fail(`${file}:${i + 1} assigns a literal to "${assignment[1]}": ${line.trim()}`);
    });
}
check(`no commit-able file assigns a literal credential (${committable.filter(f => TEXT.test(f)).length} files scanned)`);

const indexSource = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
assert.ok(!tracked.some(f => /(^|\/)\.env/.test(f)), '.env files are not tracked');
// A dotenv-style loader would make a committed .env meaningful again.
assert.ok(!/require\(['"]dotenv['"]\)|from ['"]dotenv['"]/.test(indexSource), 'index.js does not load a .env file');
check('no .env is tracked and index.js does not read one');

// A local secret file dropped in the working tree must stay out of commits, even if
// someone runs `git add -A` or `git commit -a`.
for (const local of ['.env', '.env.local', 'credentials.json']) {
    let ignored = false;
    try {
        execFileSync(GIT, ['check-ignore', '-q', '--no-index', local], { cwd: ROOT });
        ignored = true;
    } catch { /* not ignored */ }
    assert.ok(ignored, `${local} is not git-ignored`);
}
check('.env, .env.local and credentials.json are git-ignored');

// --- 2. runtime resolution order ----------------------------------------------------

const start = indexSource.indexOf('// ===== Credentials ===== //');
const end = indexSource.indexOf('// ===== Program ===== //');
assert.ok(start >= 0 && end > start, 'the credential block is delimited in index.js');
// Only the block is loaded: importing all of index.js would launch a browser.
const block = indexSource.slice(start, end);

async function withFixtures(run) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-credentials-'));
    const saved = { ...process.env };
    const savedTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    try {
        await run(dir);
    } finally {
        // never leak the fake credentials into later checks (or a parent shell)
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
        if (savedTTY) Object.defineProperty(process.stdin, 'isTTY', savedTTY);
        else delete process.stdin.isTTY;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Writes the credential block plus the given exports into `dir/name`, with an optional
// stub `keytar` next to it whose getPassword(service, account) answers from `entries`.
function loadBlock(dir, name, exports, entries) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `${block}\nmodule.exports = { ${exports.join(', ')} };\n`);
    if (entries) {
        const pkg = path.join(dir, 'node_modules', 'keytar');
        fs.mkdirSync(pkg, { recursive: true });
        fs.writeFileSync(path.join(pkg, 'index.js'), `const entries = ${JSON.stringify(entries)};
module.exports = { getPassword: (service, account) => Promise.resolve(entries[service + '/' + account] || null) };
`);
    } else {
        // remove keytar stub if present
        const pkg = path.join(dir, 'node_modules', 'keytar');
        if (fs.existsSync(pkg)) fs.rmSync(pkg, { recursive: true, force: true });
    }
    // clear require cache for this file and keytar so each load is fresh
    delete require.cache[require.resolve(file)];
    const keytarPath = path.join(dir, 'node_modules', 'keytar', 'index.js');
    if (fs.existsSync(keytarPath)) delete require.cache[require.resolve(keytarPath)];
    return require(file);
}

async function runtime() {
    // Built from pieces so this file never contains a credential-shaped literal for
    // the static scan above to flag. None of these values are real.
    const suffix = ['example', 'test'].join('.');
    const fake = {
        keychain: { user: ['keychain', suffix].join('@'), secret: ['keychain', 'value'].join('-') },
        env: { user: ['env', suffix].join('@'), secret: ['env', 'value'].join('-') },
    };

    await withFixtures(async dir => {
        const { cleanCredential } = loadBlock(dir, 'clean.js', ['cleanCredential']);

        assert.equal(cleanCredential(`  '${fake.env.user}'\n`), fake.env.user);
        assert.equal(cleanCredential(`  ${fake.env.secret}  `), fake.env.secret);
        assert.equal(cleanCredential('   '), null);
        assert.equal(cleanCredential(''), null);
        assert.equal(cleanCredential(undefined), null);
        check('cleanCredential strips quoting/whitespace and rejects empty values');

        delete process.env.EP_EMAIL;
        delete process.env.EP_PASSWORD;
        delete process.stdin.isTTY;  // no terminal: the prompt is skipped, nothing hangs
        const bare = loadBlock(dir, 'bare.js', ['resolveCredentials'], null);
        assert.equal(await bare.resolveCredentials(), null);
        check('no env, no keychain, no TTY: resolves null (manual login) instead of prompting');

        const keychain = loadBlock(dir, 'keychain.js', ['resolveCredentials'], {
            'EducationPerfected/EP_EMAIL': fake.keychain.user,
            'EducationPerfected/EP_PASSWORD': fake.keychain.secret,
        });
        assert.deepEqual(await keychain.resolveCredentials(), {
            email: fake.keychain.user,
            password: fake.keychain.secret,
            source: 'the OS keychain',
        });
        check('credentials resolve from the OS keychain when the env vars are unset');

        process.env.EP_EMAIL = fake.env.user;
        process.env.EP_PASSWORD = fake.env.secret;
        assert.deepEqual(await keychain.resolveCredentials(), {
            email: fake.env.user,
            password: fake.env.secret,
            source: 'EP_EMAIL/EP_PASSWORD',
        });
        check('environment variables take precedence over the keychain');

        delete process.env.EP_PASSWORD;
        assert.deepEqual(await keychain.resolveCredentials(), {
            email: fake.keychain.user,
            password: fake.keychain.secret,
            source: 'the OS keychain',
        });
        check('a half-set env pair is not half-used; the keychain still answers');

        // what PowerShell users end up with when they quote a missing value
        process.env.EP_EMAIL = "''";
        process.env.EP_PASSWORD = "''";
        assert.equal((await keychain.resolveCredentials()).source, 'the OS keychain');
        check('quoted-empty env values do not count as credentials');

        // Simulated TTY check for the terminal prompt branch
        delete process.env.EP_EMAIL;
        delete process.env.EP_PASSWORD;
        const { PassThrough } = require('stream');
        const stdin = new PassThrough();
        stdin.isTTY = true; stdin.raw = false;
        stdin.setRawMode = m => { stdin.raw = m; };
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        // fresh block without any keychain entries
        const prompt = loadBlock(dir, 'prompt.js', ['resolveCredentials'], {});
        const p = prompt.resolveCredentials();
        for (let i = 0; i < 100 && stdin.raw !== true; i++) await new Promise(r => setTimeout(r, 10));
        stdin.push('typed@example.test\r');
        await new Promise(r => setTimeout(r, 50));
        stdin.push('s3cr3t\r');
        const r = await p;
        assert.deepEqual(r, { email: 'typed@example.test', password: 's3cr3t', source: 'the terminal prompt' });
        check('interactive TTY prompt resolves credentials with hidden input');
    });
}

runtime().then(() => {
    console.log(`\nAll ${CHECKS.length} checks passed.`);
}).catch(e => {
    console.error(`\nCredential test FAILED: ${e && e.stack || e}`);
    process.exitCode = 1;
});
