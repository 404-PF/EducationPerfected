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
// Resolve git binary to an absolute, fixed path (no PATH lookup).
// GIT_EXEC_PATH is a directory; append the binary name.
const GIT = (() => {
    if (process.platform === 'win32') return 'git.exe';
    const gitExecPath = process.env.GIT_EXEC_PATH;
    const candidates = [
        gitExecPath ? path.join(gitExecPath, 'git') : null,
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/opt/homebrew/bin/git',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return 'git'; // fallback (CI has git in fixed locations)
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

/**
 * Checks if a file is likely text (non-binary) by reading a small sample.
 * @param {string} filePath
 * @returns {boolean}
 */
function isTextFile(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
        if (bytesRead === 0) return true; // empty file is text
        // Heuristic: binary if contains null byte or high ratio of non-printable chars
        const sample = buffer.subarray(0, bytesRead);
        if (sample.includes(0)) return false;
        let nonPrintable = 0;
        for (const byte of sample) {
            // Allow printable ASCII (32-126), newline, tab, carriage return
            if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) nonPrintable++;
        }
        return nonPrintable / bytesRead < 0.3;
    } catch {
        return false;
    }
}

/**
 * Redacts the RHS of an assignment for safe logging.
 * @param {string} line
 * @returns {string}
 */
function redactLine(line) {
    return line.replace(/(=|:)\s*(["'`])([^"'`\n]*?)\2/, '$1 $2[REDACTED]$2');
}

/**
 * Scans a file for credential-like literal assignments using token-aware matching.
 * Catches both top-level and nested assignments (e.g., `const cfg = { password: 'x' }`).
 * @param {string} filePath
 * @returns {Array<{line: number, name: string, redactedLine: string}>}
 */
function scanFileForSecrets(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        // Strip single-line comments
        const line = rawLine.replace(/\/\/.*$/, '');

        // Match assignments: name = 'literal' or name: 'literal' (including nested in objects)
        // This regex finds all occurrences in the line, not just at the start
        const assignmentRegex = /([A-Za-z_$][\w$]*)\s*[:=]\s*(["'`])([^"'`\n]{3,})\2/g;
        let match;
        while ((match = assignmentRegex.exec(line)) !== null) {
            const name = match[1];
            const quote = match[2];
            const value = match[3];

            // Skip if name is a selector/css reference
            if (/css|selector/i.test(name)) continue;

            // Check if name looks like a secret field
            if (!/^(?:e-?mail|user(?:name)?|login|pass(?:word|wd)?|(?:api[_-]?)?(?:key|token|secret|credential)s?)$/i.test(name)) {
                continue;
            }

            // Skip if value looks like a variable reference or function call (no quotes inside)
            // The regex already ensures it's a quoted literal

            findings.push({
                line: i + 1,
                name,
                redactedLine: redactLine(rawLine),
            });
        }
    }
    return findings;
}

let scannedCount = 0;
for (const file of committable) {
    // Skip the test file itself (it contains fake credentials for testing)
    if (file === 'scripts/credentials-test.js') continue;
    const fullPath = path.join(ROOT, file);
    // Scan all non-binary committable files, not just an extension allowlist
    if (isTextFile(fullPath)) {
        scannedCount++;
        const findings = scanFileForSecrets(fullPath);
        for (const finding of findings) {
            assert.fail(`${file}:${finding.line} assigns a literal to "${finding.name}": ${finding.redactedLine}`);
        }
    }
}
check(`no commit-able file assigns a literal credential (${scannedCount} text files scanned)`);

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

/**
 * Runs a test with isolated environment and temp directory.
 * @param {string} dir
 * @param {Function} run
 */
async function withFixtures(dir, run) {
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
/**
 * @param {string} dir
 * @param {string} name
 * @param {string[]} exports
 * @param {Record<string, string>|null} entries
 * @returns {Record<string, Function>}
 */
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
    // eslint-disable-next-line no-eval -- controlled test fixture, not user input
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

    await withFixtures(fs.mkdtempSync(path.join(os.tmpdir(), 'ep-credentials-')), async dir => {
        const { cleanCredential, cleanEmail, cleanPassword } = loadBlock(dir, 'clean.js', ['cleanCredential', 'cleanEmail', 'cleanPassword']);

        // cleanCredential (legacy) - strips quoting/whitespace and rejects empty
        assert.equal(cleanCredential(`  '${fake.env.user}'\n`), fake.env.user);
        assert.equal(cleanCredential(`  ${fake.env.secret}  `), fake.env.secret);
        assert.equal(cleanCredential('   '), null);
        assert.equal(cleanCredential(''), null);
        assert.equal(cleanCredential(undefined), null);
        check('cleanCredential strips quoting/whitespace and rejects empty values');

        // cleanEmail - normalizes email (trims whitespace)
        assert.equal(cleanEmail(`  ${fake.env.user}  `), fake.env.user);
        assert.equal(cleanEmail(`  '${fake.env.user}'\n`), fake.env.user);
        check('cleanEmail trims whitespace and strips quotes');

        // cleanPassword - preserves leading/trailing whitespace, strips only quotes
        assert.equal(cleanPassword(`  ${fake.env.secret}  `), `  ${fake.env.secret}  `);
        assert.equal(cleanPassword(`'${fake.env.secret}'`), fake.env.secret);
        assert.equal(cleanPassword('""'), null);
        assert.equal(cleanPassword('   '), '   '); // spaces preserved
        check('cleanPassword preserves whitespace, strips only quotes');

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
        stdin.isTTY = true;
        stdin.raw = false;
        stdin.setRawMode = m => { stdin.raw = m; };
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        // fresh block without any keychain entries
        const prompt = loadBlock(dir, 'prompt.js', ['resolveCredentials'], {});
        const p = prompt.resolveCredentials();
        // Wait for raw mode to be enabled, then assert it
        for (let i = 0; i < 100 && stdin.raw !== true; i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(stdin.raw === true, 'stdin raw mode was enabled for hidden input');
        stdin.push('typed@example.test\r');
        await new Promise(r => setTimeout(r, 50));
        stdin.push('s3cr3t\r');
        const r = await p;
        assert.deepEqual(r, { email: 'typed@example.test', password: 's3cr3t', source: 'the terminal prompt' });
        check('interactive TTY prompt resolves credentials with hidden input and asserts raw mode');
    });
}

runtime().then(() => {
    console.log(`\nAll ${CHECKS.length} checks passed.`);
}).catch(e => {
    console.error(`\nCredential test FAILED: ${e && e.stack || e}`);
    process.exitCode = 1;
});