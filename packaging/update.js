// Self-update for packaged EducationPerfected executables from this repository's
// GitHub Releases. Integrity model: the platform asset is verified against the
// SHA256SUMS file published in the SAME release. That detects download/storage
// corruption. It does NOT detect a compromised publisher: releases are unsigned
// and no independent signing trust anchor exists. Never tags, uploads or
// publishes anything; release publication stays a separate owner-approved act.
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RELEASES_API = 'https://api.github.com/repos/404-PF/EducationPerfected/releases?per_page=30';
const DOWNLOAD_PREFIX = '/404-PF/EducationPerfected/releases/download/';
const SUMS_NAME = 'SHA256SUMS';
const TARGETS = {
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
    'darwin-arm64': 'macos-arm64',
    'darwin-x64': 'macos-x64',
    'win32-x64': 'windows-x64',
};

function releaseAssetName(platform = process.platform, arch = process.arch) {
    const target = TARGETS[platform + '-' + arch];
    if (!target) throw new Error('Unsupported update target ' + platform + '-' + arch);
    return 'educationperfected-' + target + (platform === 'win32' ? '.exe' : '');
}

// Stable SemVer only: 2026.0.0 or v2026.11.30. Prerelease/build suffixes never parse.
function parseStableVersion(tag) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag || '').trim());
    if (!match) return null;
    return { version: match.slice(1).join('.'), parts: match.slice(1).map(Number) };
}

function compareVersions(a, b) {
    for (let index = 0; index < 3; index++) {
        if (a.parts[index] !== b.parts[index]) return a.parts[index] < b.parts[index] ? -1 : 1;
    }
    return 0;
}

// Strict sha256sum format: "<64hex>  <plain file name>" per line (binary " *" marker accepted).
function parseSha256Sums(text) {
    const sums = new Map();
    for (const line of String(text).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const match = /^([a-f0-9]{64}) [ *]([^\r\n]+)$/.exec(line);
        if (!match) throw new Error('Malformed SHA256SUMS line');
        const name = match[2];
        if (name !== path.basename(name) || name.startsWith('.') || name.includes('\\')) throw new Error('Unexpected name in SHA256SUMS');
        if (sums.has(name)) throw new Error('Duplicate name in SHA256SUMS');
        sums.set(name, match[1]);
    }
    if (!sums.size) throw new Error('Empty SHA256SUMS');
    return sums;
}

function checkAssetUrl(url, tag, name) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid release asset URL'); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.pathname !== DOWNLOAD_PREFIX + tag + '/' + name || parsed.search || parsed.hash) {
        throw new Error('Release asset URL outside this repository release');
    }
    return url;
}

function latestStableRelease(releases) {
    if (!Array.isArray(releases)) throw new Error('Unexpected release list response');
    let best = null;
    for (const release of releases) {
        if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue;
        const parsed = parseStableVersion(release.tag_name);
        if (parsed && (!best || compareVersions(parsed, best.parsed) > 0)) best = { parsed, release };
    }
    return best;
}

// Pick the newest stable release strictly newer than currentVersion.
function selectUpdatePlan(releases, currentVersion, assetName = releaseAssetName()) {
    const current = parseStableVersion(currentVersion);
    if (!current) throw new Error('Unrecognized current version ' + currentVersion);
    const best = latestStableRelease(releases);
    if (!best) return { newer: false, latest: null };
    if (compareVersions(best.parsed, current) <= 0) return { newer: false, latest: best.parsed.version };
    const tag = best.release.tag_name;
    const assets = Array.isArray(best.release.assets) ? best.release.assets : [];
    const find = name => assets.find(asset => asset && asset.name === name && typeof asset.browser_download_url === 'string');
    const asset = find(assetName), sums = find(SUMS_NAME);
    if (!asset) throw new Error('Release ' + tag + ' has no asset ' + assetName + ' for this platform');
    if (!sums) throw new Error('Release ' + tag + ' has no ' + SUMS_NAME);
    return {
        newer: true,
        version: best.parsed.version,
        tag,
        asset: { name: assetName, url: checkAssetUrl(asset.browser_download_url, tag, assetName), size: Number.isInteger(asset.size) && asset.size >= 0 ? asset.size : null },
        sums: { name: SUMS_NAME, url: checkAssetUrl(sums.browser_download_url, tag, SUMS_NAME) },
    };
}

async function fileHash(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function promptUpdate(plan, backup, { input = process.stdin, output = process.stdout } = {}) {
    if (!input.isTTY || !output.isTTY) {
        output.write('Update needs an interactive terminal. Open this executable in a terminal and retry.\n');
        throw new Error('Update needs an interactive terminal');
    }
    const size = plan.asset.size === null ? 'unknown size' : (plan.asset.size / 1048576).toFixed(1) + ' MB';
    output.write('EducationPerfected update available: ' + plan.currentVersion + ' -> ' + plan.version + ' (' + plan.asset.name + ', ' + size + ').\n');
    output.write('Integrity limit: the download is checked against the ' + SUMS_NAME + ' file published in the SAME GitHub release. This detects download corruption, not a compromised publisher. Releases are unsigned; there is no independent signing trust anchor.\n');
    output.write('The current executable is kept as ' + backup + ' and restored automatically if the new build fails its version check.\n');
    output.write('Type update to replace this executable, or anything else to cancel: ');
    const rl = require('node:readline').createInterface({ input, output });
    try { return await new Promise(resolve => { rl.once('line', line => resolve(line.trim() === 'update')); rl.once('close', () => resolve(false)); }); }
    finally { rl.close(); }
}

function defaultHealthcheck(executable, version, spawn = require('node:child_process').spawnSync) {
    const result = spawn(executable, ['version'], { encoding: 'utf8', timeout: 15000 });
    if (result.error || result.status !== 0) return false;
    return String(result.stdout || '').trim() === version;
}

// cmd.exe helper: a running Windows executable cannot replace itself, so a detached
// helper waits for this process to exit, swaps the verified staged build in, runs
// the version healthcheck, rolls back on failure and writes a one-line receipt.
// Paths containing % or ! are rejected: cmd would expand them inside the script.
function windowsHelperScript({ executable, staged, backup, version, receipt, staging }) {
    for (const value of [executable, staged, backup, receipt, staging]) {
        if (/[%!]/.test(value)) throw new Error('Update paths must not contain % or ! on Windows');
    }
    return [
        '@echo off',
        'setlocal',
        'set "EXE=' + executable + '"',
        'set "STAGED=' + staged + '"',
        'set "BACKUP=' + backup + '"',
        'set "WANT=' + version + '"',
        'set "RECEIPT=' + receipt + '"',
        'set tries=0',
        ':wait',
        'move /y "%EXE%" "%BACKUP%" >nul 2>&1',
        'if errorlevel 1 (',
        '  set /a tries+=1',
        '  if %tries% geq 180 goto locked',
        '  ping -n 2 127.0.0.1 >nul',
        '  goto wait',
        ')',
        'move /y "%STAGED%" "%EXE%" >nul 2>&1',
        'if errorlevel 1 goto restore',
        'set "GOT="',
        'for /f "usebackq delims=" %%v in (`"%EXE%" version`) do set "GOT=%%v"',
        'if not "%GOT%"=="%WANT%" goto restore',
        'echo ok %WANT%>"%RECEIPT%"',
        'goto cleanup',
        ':restore',
        'move /y "%BACKUP%" "%EXE%" >nul 2>&1',
        'echo rollback version-check-failed>"%RECEIPT%"',
        'goto cleanup',
        ':locked',
        'echo rollback still-running>"%RECEIPT%"',
        ':cleanup',
        'rmdir /s /q "' + staging + '" >nul 2>&1',
        '(goto) 2>nul & del "%~f0" >nul 2>&1',
        '',
    ].join('\r\n');
}

function defaultPackaged() {
    try { return require('node:sea').isSea(); } catch { return false; }
}

function defaultVersion() {
    try { return require('../package.json').version; } catch { throw new Error('Current version unavailable'); }
}

function preflightExecutable(executable) {
    if (!path.isAbsolute(executable)) throw new Error('Update needs the absolute packaged executable path');
    const stat = fs.lstatSync(executable);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Packaged executable path is not a regular file');
    const directory = path.dirname(executable);
    fs.accessSync(directory, fs.constants.W_OK);
    return directory;
}

// A previous Windows helper run reports through its receipt; an earlier backup
// means the last update was never confirmed working by the user, so refuse.
function checkPreviousRun(executable, backup, receipt, write) {
    if (fs.existsSync(receipt)) {
        write('Previous update result: ' + fs.readFileSync(receipt, 'utf8').trim());
        fs.rmSync(receipt, { force: true });
    }
    if (fs.existsSync(backup)) {
        throw new Error('An earlier update backup still exists: ' + backup + '. The current executable already passed its version check, so verify it works, delete that backup file, then retry.');
    }
}

function acquireLock(lock, directory) {
    try {
        return fs.openSync(lock, 'wx', 0o600);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        throw new Error('Another update is active or was interrupted. Lock: ' + lock + '. Close all EducationPerfected processes, remove that lock and orphaned .update-* directories in ' + directory + ', then retry.');
    }
}

// Download SHA256SUMS and the platform asset from the same release into staging
// and verify the asset BEFORE anything is replaced or the process exits.
async function stageVerifiedAsset(plan, staging, fetchImpl, headers, write) {
    const sumsResponse = await fetchImpl(plan.sums.url, { headers, signal: AbortSignal.timeout(60000) });
    if (!sumsResponse.ok) throw new Error(SUMS_NAME + ' download failed (HTTP ' + sumsResponse.status + ')');
    const expected = parseSha256Sums(await sumsResponse.text()).get(plan.asset.name);
    if (!expected) throw new Error(SUMS_NAME + ' has no entry for ' + plan.asset.name);
    const staged = path.join(staging, plan.asset.name);
    const assetResponse = await fetchImpl(plan.asset.url, { headers, signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!assetResponse.ok) throw new Error('Update download failed (HTTP ' + assetResponse.status + ')');
    await pipeline(Readable.fromWeb(assetResponse.body), fs.createWriteStream(staged, { mode: 0o700 }));
    if (await fileHash(staged) !== expected) throw new Error('Update checksum mismatch; downloaded file discarded, nothing replaced');
    write('Checksum verified against the release ' + SUMS_NAME + '.');
    return staged;
}

// POSIX: swap the verified build in, healthcheck it, restore the backup on failure.
async function applyPosixUpdate({ executable, staged, backup, version, healthcheck, spawn, write }) {
    fs.renameSync(executable, backup);
    try {
        fs.renameSync(staged, executable);
        fs.chmodSync(executable, 0o700);
        const ok = healthcheck ? await healthcheck(executable, version) : defaultHealthcheck(executable, version, spawn);
        if (!ok) throw new Error('version check failed');
    } catch (error) {
        let restoreError = null;
        try {
            fs.rmSync(executable, { force: true });
            fs.renameSync(backup, executable);
        } catch (error_) { restoreError = error_; }
        if (restoreError) throw new Error('Update failed (' + error.message + ') AND rollback failed (' + restoreError.message + '). Previous build is kept as ' + backup + '; rename it back over ' + executable + ' manually.');
        write('New build failed its version check; the previous build was restored automatically. Nothing else changed.');
        throw new Error('Update rolled back: ' + error.message);
    }
    write('Updated to ' + version + '; version check passed.');
    write('Previous build kept as ' + backup + '. To roll back manually, replace the executable with that file. Verify this build works and remove the backup before the next update.');
    return { status: 'updated', version };
}

// Windows: the helper lives OUTSIDE the staging directory it removes, because cmd
// reads batch files lazily and a script cannot reliably delete its own folder.
function startWindowsHelper({ executable, staging, staged, backup, receipt, version, spawnDetached, write }) {
    const helper = staging + '.cmd';
    fs.writeFileSync(helper, windowsHelperScript({ executable, staged, backup, version, receipt, staging }), { mode: 0o700 });
    spawnDetached(process.env.ComSpec || 'cmd.exe', ['/c', helper]);
    write('Windows cannot replace a running executable, so a detached helper finishes this update after the program exits: it swaps in ' + version + ', runs its version check, and restores the previous build on failure.');
    write('Result receipt: ' + receipt + ' (shown again on the next update run). Previous build will be kept as ' + backup + '.');
    return { status: 'helper-started', version };
}

async function updateCommand({
    executable = process.execPath,
    currentVersion = defaultVersion(),
    packaged = defaultPackaged(),
    platform = process.platform,
    arch = process.arch,
    input = process.stdin,
    output = process.stdout,
    fetchImpl = globalThis.fetch,
    confirm = promptUpdate,
    spawn = require('node:child_process').spawnSync,
    spawnDetached = (command, args) => require('node:child_process').spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref(),
    healthcheck,
} = {}) {
    const write = line => output.write(line + '\n');
    if (!packaged) {
        write('This is a source checkout; update it with a fresh download of main (or git pull). The update command only replaces a packaged executable. Nothing changed.');
        return { status: 'source-checkout' };
    }
    if (typeof fetchImpl !== 'function') throw new Error('Network fetch unavailable in this Node runtime');
    const directory = preflightExecutable(executable);
    const assetName = releaseAssetName(platform, arch);
    const backup = executable + '.backup';
    const receipt = executable + '.update-result';
    checkPreviousRun(executable, backup, receipt, write);
    const headers = { 'User-Agent': 'educationperfected-update', 'Accept': 'application/vnd.github+json' };
    const response = await fetchImpl(RELEASES_API, { headers, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Release check failed (HTTP ' + response.status + ')');
    const plan = selectUpdatePlan(await response.json(), currentVersion, assetName);
    if (!plan.newer) {
        write(plan.latest ? 'Already up to date (version ' + currentVersion + ').' : 'No stable release found; nothing to update to.');
        return { status: 'up-to-date' };
    }
    plan.currentVersion = currentVersion;
    const lock = executable + '.update.lock';
    const lockFd = acquireLock(lock, directory);
    let staging = null, helperOwned = false;
    const cleanup = () => {
        if (staging && !helperOwned) {
            fs.rmSync(staging, { recursive: true, force: true });
            fs.rmSync(staging + '.cmd', { force: true });
        }
        fs.closeSync(lockFd);
        fs.rmSync(lock, { force: true });
    };
    try {
        if (!await confirm(plan, backup, { input, output })) {
            write('Update cancelled; nothing changed.');
            return { status: 'cancelled' };
        }
        staging = fs.mkdtempSync(path.join(directory, '.update-'));
        fs.chmodSync(staging, 0o700);
        const staged = await stageVerifiedAsset(plan, staging, fetchImpl, headers, write);
        if (platform === 'win32') {
            const result = startWindowsHelper({ executable, staging, staged, backup, receipt, version: plan.version, spawnDetached, write });
            helperOwned = true; // staging and the helper script belong to the helper now
            return result;
        }
        return await applyPosixUpdate({ executable, staged, backup, version: plan.version, healthcheck, spawn, write });
    } finally {
        cleanup();
    }
}

module.exports = { updateCommand, releaseAssetName, parseStableVersion, compareVersions, parseSha256Sums, selectUpdatePlan, promptUpdate, defaultHealthcheck, windowsHelperScript, RELEASES_API, SUMS_NAME };
