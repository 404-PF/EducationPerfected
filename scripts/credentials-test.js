// Guards the credential handling from issues #6 and #27: credentials live at runtime
// only, and a manual browser login outraces (and cancels) the terminal prompt.
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

// The bare field name (email, password, apiKey ...) and the same name behind the
// repository's environment-variable prefix (EP_EMAIL, EP_PASSWORD). Without the prefix
// form, `const EP_PASSWORD = 'actual-secret'` — the very spelling this project uses —
// would pass the scan. The prefix is limited to `EP_` on purpose: a general
// `[A-Z]+_` prefix would flag unrelated selectors such as `button_password`.
// The whole name stays anchored, so derived identifiers (`tokenCount`, `password_css`)
// still do not count.
const SECRET_NAME = /^(?:(?:EP_)?(?:e-?mail|user(?:name)?|login|pass(?:word|wd)?|(?:api[_-]?)?(?:key|token|secret|credential)s?))$/i;
// Values a documentation page uses to show *how* to set a variable, never a real secret.
// The accepted words are a closed list, so `your-SecretKey123` is still reported: only a
// value that reads as an instruction ("your-password") is exempt, and only in docs.
const PLACEHOLDER_VALUE = new RegExp(
    '^(?:'
    + 'your[- _](?:password|passwd|email|username|user|login|token|api[- _]?key|secret|credentials?)'
    + '|<[^>]*>'
    + '|\\.\\.\\.'
    + '|x{3,}|\\*{3,}'
    + '|you@example\\.com'
    + '|[^@\\s]*@example\\.(?:com|test)'
    + ')$', 'i');

/**
 * Decodes a file for scanning, honouring UTF-16 byte-order marks (which contain NUL
 * bytes and would otherwise look binary) and falling back to strict UTF-8.
 * @param {Buffer} buffer
 * @returns {{text: string, utf16: boolean}}
 */
function decodeFile(buffer) {
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return { text: buffer.subarray(2).toString('utf16le'), utf16: true };
    }
    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        // Big-endian UTF-16: swap to little-endian. swap16() throws on an odd length, so
        // drop a stray trailing byte first (a truncated file must not crash the scan).
        const body = buffer.subarray(2);
        const swapped = Buffer.from(body.subarray(0, body.length - (body.length % 2)));
        swapped.swap16();
        return { text: swapped.toString('utf16le'), utf16: true };
    }
    return { text: buffer.toString('utf8'), utf16: false };
}

/**
 * Classifies a file as text or binary from its first bytes.
 * UTF-16 (NUL-heavy) text is recognised by its BOM before the binary heuristic runs.
 * @param {string} filePath
 * @returns {'text'|'binary'|'unreadable'}
 */
function fileKind(filePath) {
    let buffer;
    try {
        const fd = fs.openSync(filePath, 'r');
        const sample = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, sample, 0, sample.length, 0);
        fs.closeSync(fd);
        buffer = sample.subarray(0, bytesRead);
    } catch {
        return 'unreadable';
    }
    if (buffer.length === 0) return 'text';
    // A BOM means text even though UTF-16 is full of NUL bytes.
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'text';
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'text';
    if (buffer.includes(0)) return 'binary';
    let nonPrintable = 0;
    for (const byte of buffer) {
        // Allow printable ASCII, newline, tab, carriage return and UTF-8 continuation bytes
        const printable = (byte >= 32 && byte !== 127) || byte === 9 || byte === 10 || byte === 13 || byte >= 128;
        if (!printable) nonPrintable++;
    }
    return nonPrintable / buffer.length < 0.3 ? 'text' : 'binary';
}

/**
 * Finds every quoted string literal in a line, skipping quoted spans so that a `//`
 * inside a value (a URL, a password) is not mistaken for a comment.
 * @param {string} line
 * @returns {Array<{index: number, quote: string, value: string, end: number}>}
 */
function quotedLiterals(line) {
    const literals = [];
    for (let i = 0; i < line.length; i++) {
        const quote = line[i];
        if (quote !== '"' && quote !== "'" && quote !== '`') continue;
        let j = i + 1;
        let value = '';
        for (; j < line.length; j++) {
            if (line[j] === '\\') { value += line[j + 1] ?? ''; j++; continue; }
            if (line[j] === quote) break;
            value += line[j];
        }
        if (j >= line.length) break; // unterminated on this line: nothing safe to report
        literals.push({ index: i, quote, value, end: j });
        i = j;
    }
    return literals;
}

/**
 * Removes comments from a line without touching text inside quoted literals.
 * @param {string} line
 * @returns {string}
 */
function stripComments(line) {
    const literals = quotedLiterals(line);
    const inLiteral = index => literals.some(l => index > l.index && index <= l.end);
    for (let i = 0; i < line.length - 1; i++) {
        if (line[i] === '/' && line[i + 1] === '/') {
            if (!inLiteral(i)) return line.slice(0, i);
            i++;
        }
    }
    return line;
}

/**
 * Replaces every quoted run in a snippet with a placeholder, leaving the field name so a
 * finding still says which field was flagged. Redacting each literal rather than only
 * the matched one means no suffix of a secret can survive into the log.
 * @param {string} snippet
 * @param {string} name
 * @returns {string}
 */
function redactLiterals(snippet, name) {
    const redacted = snippet.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g, '"[REDACTED]"');
    // Restore the field name for the value's own placeholder (the first one is the key).
    return redacted.replace(/"[^"]*"\s*[:=]/, `"${name}":`);
}

/**
 * Scans a file's text for credential-like literal assignments.
 * Matches `name = "literal"` and `name: "literal"`, including quoted keys (JSON) and
 * nested assignments inside object literals. A value runs to its own closing delimiter,
 * honouring backslash escapes, so a value containing the other quote characters (or an
 * escaped delimiter) is read whole rather than truncated mid-secret.
 * @param {string} text
 * @param {boolean} [isDoc] - true for prose docs, where sample placeholder values are expected
 * @returns {Array<{line: number, name: string, redacted: string}>}
 */
function scanTextForSecrets(text, isDoc = false) {
    const findings = [];
    text.split(/\r?\n/).forEach((rawLine, i) => {
        const line = stripComments(rawLine);
        // A quoted or bare field name, followed by : or =, then a quoted literal.
        //   key  : "..." | '...' | `...` (the non-active delimiters are plain characters)
        //   value: \\ . | [^ <delimiter> \\] repeated, so only the active delimiter ends it
        const assignment = /(?:(?<qkey>"[^"]*"|'[^']*')|(?<key>[A-Za-z_$][\w$]*))\s*[:=]\s*(?<q>["'`])(?<val>(?:\\[\s\S]|(?!\k<q>)[^\\])*)\k<q>/g;
        let match;
        while ((match = assignment.exec(line)) !== null) {
            const name = (match.groups.qkey || match.groups.key || '').replace(/^["']|["']$/g, '');
            // The anchored SECRET_NAME already excludes derived identifiers such as
            // `tokenCount` or `password_css`: only the bare field name counts as a value.
            if (!SECRET_NAME.test(name)) continue;
            const value = match.groups.val;
            // Empty values, interpolation and env reads are not literals to report.
            if (value.trim() === '' || /\$\{|\bprocess\.env\b/.test(value)) continue;
            // Documentation hands users placeholders (`set EP_PASSWORD=your-password`,
            // `$env:EP_EMAIL='you@example.com'`). Those are instructions, not secrets, so
            // a markdown file may use a clearly-placeholder value; anything that does not
            // look like one is still reported, including in docs.
            if (isDoc && PLACEHOLDER_VALUE.test(value)) continue;
            findings.push({
                line: i + 1,
                name,
                // Report the whole matched assignment with every quoted run replaced, so
                // neither the secret nor a suffix of it can survive into the log.
                redacted: redactLiterals(line.slice(match.index, match.index + match[0].length), name),
            });
        }
    });
    return findings;
}

let scannedCount = 0;
const skipped = [];
for (const file of committable) {
    // Skip the test file itself (it contains fake credentials for testing)
    if (file === 'scripts/credentials-test.js') continue;
    const fullPath = path.join(ROOT, file);
    // Scan every committable file by content, not by an extension allowlist
    const kind = fileKind(fullPath);
    if (kind === 'binary') continue;
    if (kind === 'unreadable') {
        skipped.push(file);
        continue;
    }
    const { text } = decodeFile(fs.readFileSync(fullPath));
    scannedCount++;
    const isDoc = /\.(?:md|markdown|rst|txt)$/i.test(file);
    for (const finding of scanTextForSecrets(text, isDoc)) {
        assert.fail(`${file}:${finding.line} assigns a literal to "${finding.name}": ${finding.redacted}`);
    }
}
// An unreadable file cannot be proven clean, so say so rather than passing silently.
if (skipped.length > 0) console.warn(`  note: ${skipped.length} unreadable file(s) not scanned: ${skipped.join(', ')}`);
check(`no commit-able file assigns a literal credential (${scannedCount} text files scanned)`);

const indexSource = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
assert.ok(!tracked.some(f => /(^|\/)\.env/.test(f)), '.env files are not tracked');
// A dotenv-style loader would make a committed .env meaningful again.
assert.ok(!/require\(['"]dotenv['"]\)|from ['"]dotenv['"]/.test(indexSource), 'index.js does not load a .env file');
check('no .env is tracked and index.js does not read one');

// The scanner is a safety net, so the net itself is checked: values containing the other
// quote character or an escaped delimiter must still match, and a finding must never
// carry the value into the log.
{
    const q = String.fromCharCode(39);   // '
    const cases = [
        ['{"password": "it' + q + 's-secret", "email": "x@y.z"}', 2, 'quoted JSON keys'],
        ['const password = ' + q + 'say "hi" now' + q, 1, 'apostrophes around double quotes'],
        ['{"password": "a\\"b\\"c"}', 1, 'escaped delimiter inside the value'],
        ['const EP_PASSWORD = ' + q + 'actual-secret' + q, 1, 'EP_-prefixed env names'],
        ['{"EP_EMAIL": ' + q + 'a@b.co' + q + '}', 1, 'EP_-prefixed quoted key'],
        ['const password_css = ' + q + '#password' + q, 0, 'selectors are not secrets'],
        ['const tokenCount = ' + q + 'not-a-secret' + q, 0, 'derived names are not secrets'],
        ['const USERNAME_FIELD = ' + q + '#loginId' + q, 0, 'selector constants are not secrets'],
        ['button_password = ' + q + '#password' + q, 0, 'only the EP_ prefix is a credential name'],
        ['foo_token = ' + q + 'not-a-secret' + q, 0, 'unrelated prefixes are not credential names'],
    ];
    for (const [line, expected, label] of cases) {
        assert.equal(scanTextForSecrets(line).length, expected, label);
    }
    // Documentation placeholders are exempt; a value that merely starts with "your-" is not.
    assert.equal(scanTextForSecrets('EP_PASSWORD=' + q + 'your-password' + q, true).length, 0,
        'documented placeholder values are not reported');
    assert.equal(scanTextForSecrets('EP_PASSWORD=' + q + 'your-SecretKey123' + q, true).length, 1,
        'a real-looking value in docs is still reported');
    const finding = scanTextForSecrets('{"password": "supersecretvalue"}')[0];
    assert.ok(finding && !finding.redacted.includes('supersecretvalue'),
        'a finding never echoes the value it caught');
    check('credential scan matches quoted/escaped values and redacts what it finds');

    // A truncated big-endian file must not crash the scan (swap16 needs even length).
    const odd = Buffer.concat([
        Buffer.from([0xFE, 0xFF]),
        Buffer.from('pass', 'utf16le').swap16(),
        Buffer.from([0x41]),
    ]);
    assert.equal(decodeFile(odd).utf16, true);
    check('a big-endian UTF-16 file with a trailing byte still decodes');
}

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

// index.js cannot be `require`d (it launches a browser), and a bare `new Function()`
// only compiles — it does not resolve identifiers — so neither catches a constant whose
// declaration was dropped while its comment was edited. An undeclared identifier leaves
// no other trace in a lint-free repo, so check the code (comments and string literals
// stripped) for SCREAMING_CASE names that are used but never declared.
// Comments first: an apostrophe in prose ("EP's") would otherwise open a bogus string
// literal below and swallow the code that follows it.
// Templates keep their text: the backticks and the literal prose go, but `${...}`
// expressions are code and must stay visible, or an undeclared constant used only
// inside an interpolation would be invisible to this check.
const codeOnly = indexSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')                  // block comments
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')               // line comments (not "https://")
    .replace(/`(\\.|[^`\\])*`/g, template => {          // template literals
        const expressions = [...template.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]);
        return expressions.length ? ` ${expressions.join(' ; ')} ` : '""';
    })
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")              // single-quoted strings
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');             // double-quoted strings
const declared = new Set(
    [...codeOnly.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
// Property reads (`process.env.EP_EMAIL`) and globals are not constants of this file:
// only identifiers in a naked position count, so skip anything preceded by a dot.
const identifiers = [...codeOnly.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,})\b/g)]
    .map(m => m[2]);
const GLOBALS = new Set(['URL', 'JSON', 'NaN', 'Infinity']);
const undeclared = [...new Set(identifiers)]
    .filter(name => !declared.has(name) && !GLOBALS.has(name));
assert.deepEqual(undeclared, [],
    `index.js uses upper-case constants it never declares: ${undeclared.join(', ')}`);
check('every SCREAMING_CASE constant used in index.js is declared');

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
 * @param {string} [source] - the block to write instead of index.js's credential block
 * @returns {Record<string, Function>}
 */
function loadBlock(dir, name, exports, entries, source = block) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `${source}\nmodule.exports = { ${exports.join(', ')} };\n`);
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

    // Both fixture roots are removed however the run ends (a failed check included):
    // the credential block's, and the one the watcher helper is loaded from below.
    const watcherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-watcher-'));
    try {
        await withCredentialsFixtures(watcherDir, suffix, fake);
    } finally {
        fs.rmSync(watcherDir, { recursive: true, force: true });
    }
}

/**
 * Runs the runtime checks with isolated environment and temp directories.
 * @param {string} watcherDir - Fixture directory for the watcher helper (owned by the caller)
 * @param {string} suffix - The fake domain suffix the fixture values are built from
 * @param {{keychain: {user: string, secret: string}, env: {user: string, secret: string}}} fake
 * @returns {Promise<void>}
 */
async function withCredentialsFixtures(watcherDir, suffix, fake) {
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
        stdin.setRawMode = m => { stdin.raw = m; stdin.emit('raw'); };
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        // Pushes must wait until the prompt has attached its data listener: a chunk
        // pushed earlier is dropped (push() forgets chunks with no listener attached),
        // and waiting on a 'data' listener of our own would consume the chunk before
        // promptSecret's handler and hang it. Neither promptsOn nor released() listens
        // on stdin - both only count listeners - so they cannot take input either.
        // The first prompt opens some time after the call: immediately when the login
        // watcher is absent, but after the caller's watcher has settled when one is
        // given (up to 50ms here) - so neither one immediate nor raw mode (which also
        // fires when an already-detected session cancels the prompt) marks the prompt
        // opening. Poll for its data listener instead, which nothing else attaches.
        const promptListeners = () => stdin.listenerCount('data');
        const promptsOn = async () => {
            for (let i = 0; i < 1000 && promptListeners() === 0; i++) await new Promise(r => setTimeout(r, 5));
            assert.equal(promptListeners(), 1, 'the prompt has attached its data listener');
        };
        // Waits until the previous prompt has let go of stdin (its data listener is
        // gone), which is also when its promise settles.
        const released = async () => {
            while (promptListeners() !== 0) await new Promise(r => setTimeout(r, 5));
        };

        // fresh block without any keychain entries
        const prompt = loadBlock(dir, 'prompt.js', ['resolveCredentials'], {});
        const p = prompt.resolveCredentials();
        await promptsOn();
        assert.equal(stdin.raw, true, 'raw mode was enabled for hidden input');
        stdin.push('typed@example.test\r');
        await released();   // the email is in; the password prompt takes over stdin
        stdin.push('s3cr3t\r');
        const r = await p;
        assert.deepEqual(r, { email: 'typed@example.test', password: 's3cr3t', source: 'the terminal prompt' });
        check('interactive TTY prompt resolves credentials with hidden input and asserts raw mode');

        // Control sequences must be swallowed whole. `[` is itself a CSI final byte, so a
        // parser that ends there appends "A" from an arrow key or "200~"/"201~" from a
        // bracketed paste to the secret. The password here types past both. promptSecret
        // returns { promise, cancel }: the promise resolves the submitted value.
        const escaped = loadBlock(dir, 'escaped.js', ['promptSecret'], null);
        stdin.raw = false;
        const escapedPrompt = escaped.promptSecret('', v => v);
        await promptsOn();
        stdin.push(Buffer.from('typed\x1b[A\x1b[200~\x1b[201~pass\r', 'binary'));
        assert.equal(await escapedPrompt.promise, 'typedpass');
        check('arrow keys and bracketed paste markers never enter the secret');

        // Cancelling an open prompt from outside (a completed manual login won the race,
        // issue #27) must leave the terminal as it was and resolve null: the same
        // cleanup path Ctrl+C takes, minus process.exit.
        const cancellable = loadBlock(dir, 'cancel.js', ['promptSecret'], null);
        stdin.raw = false;
        const cancelled = cancellable.promptSecret('', v => v);
        await promptsOn();
        cancelled.cancel();
        cancelled.cancel();   // a second cancel must be a no-op, not a second newline/restore
        assert.equal(await cancelled.promise, null);
        assert.equal(stdin.raw, false, 'raw mode is restored after a cancel');
        assert.equal(stdin.listenerCount('data'), 0, 'the prompt data listener is dropped after a cancel');
        check('a cancelled prompt resolves null and restores the terminal (raw off, listener dropped)');

        // The prompt raced against the login watcher (issue #27): when the watcher sees
        // the session first, the prompt is cancelled invisibly and resolveCredentials
        // reports the session as detected; when the prompt is answered first, nothing
        // changes.
        const raced = loadBlock(dir, 'raced.js', ['resolveCredentials'], null);
        stdin.raw = false;
        const lost = raced.resolveCredentials(async () => {   // the login completes first
            await new Promise(r => setTimeout(r, 50));
            return true;
        });
        await promptsOn();
        assert.deepEqual(await lost, { sessionDetected: true });
        assert.equal(stdin.raw, false, 'raw mode is restored when the prompt loses the race');
        assert.equal(stdin.listenerCount('data'), 0, 'the prompt data listener is dropped when the race is lost');
        check('a manual login completing first cancels the prompt and reports the session as detected');

        // The same watcher, but no session ever arrives: the prompt is answered first.
        stdin.raw = false;
        const won = raced.resolveCredentials(() => new Promise(() => { }));   // no session ever arrives
        await promptsOn();
        const racedSecret = ['raced', 'value'].join('-');   // not credential-shaped, same as `fake`
        stdin.push(`raced@${suffix}\r`);
        await released();   // the email is in; the password prompt takes over stdin
        stdin.push(`${racedSecret}\r`);
        assert.deepEqual(await won, { email: `raced@${suffix}`, password: racedSecret, source: 'the terminal prompt' });
        check('a prompt answered first is unaffected by the login watcher');

        // The watcher the prompt is raced against: sessionAppeared, the body of the
        // startup flow's watchForSession. It sits in the program block, which launches a
        // browser if loaded, so it is sliced out and loaded as a fresh block against a
        // fake page (loadBlock, like the credential block above - nothing is eval'd).
        const programStart = indexSource.indexOf('// ===== Program ===== //');
        const helperStart = indexSource.indexOf('async function sessionAppeared(', programStart);
        assert.ok(helperStart > programStart, 'sessionAppeared is declared in the program block');
        const helperSource = indexSource.slice(helperStart);
        const helperEnd = helperSource.indexOf('\n            }') + '\n            }'.length;
        const watcher = loadBlock(watcherDir, 'watcher.js',
            ['sessionAppeared'], null, `const DIR = { home_css: '#home' };\n${helperSource.slice(0, helperEnd)}`);
        const goneError = message => new Error(message);

        /**
         * A fake page whose successive waits fail, then resolve, as scripted.
         * @param {Array<string|'seen'>} outcomes - an error message per wait, or 'seen'
         * @returns {{page: {waitForSelector: Function, calls: number}}}
         */
        const fakePage = outcomes => {
            const page = {
                calls: 0,
                waitForSelector: () => {
                    const next = outcomes[Math.min(page.calls++, outcomes.length - 1)];
                    return next === 'seen' ? Promise.resolve({}) : Promise.reject(goneError(next));
                },
            };
            return page;
        };
        const isGone = e => e.message === 'detached Frame';   // stands in for isPageGoneError

        const navigated = fakePage(['Execution context was destroyed, most likely because of a navigation', 'seen']);
        const rearmed = watcher.sessionAppeared(navigated, undefined, isGone, 1);   // DIR.home_css by default
        assert.ok(rearmed instanceof Promise, 'the watcher returns a promise');
        assert.equal(await rearmed, true);
        assert.equal(navigated.calls, 2, 'a navigation re-arms the watch instead of ending it');
        check('the login watcher re-arms after a navigation and reports the session');

        // The regression this guards: returning undefined (no value) from one path made
        // resolveCredentials await an undefined watcher and fail the whole startup.
        const gone = fakePage(['detached Frame']);
        const ended = watcher.sessionAppeared(gone, undefined, isGone, 1);
        assert.ok(ended instanceof Promise, 'the watcher returns a promise even when the page is gone');
        assert.equal(await ended, false, 'a page that is gone resolves false, never undefined');
        check('the login watcher ends with false (a promise) once the page is gone');
    });
}

runtime().then(() => {
    console.log(`\nAll ${CHECKS.length} checks passed.`);
}).catch(e => {
    console.error(`\nCredential test FAILED: ${e && e.stack || e}`);
    process.exitCode = 1;
});