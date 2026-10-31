const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { getAsset, getRawAsset } = require('node:sea');
const { Readable } = require('node:stream');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { unpackTar } = require('modern-tar/fs');
async function main() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'educationperfected-'));
    fs.chmodSync(dir, 0o700);
    let windowsBinding, cleanupPending = false;
    const cleanup = () => {
        if (windowsBinding?.hasLiveWorkers()) {
            cleanupPending = true;
            console.error('Native credential worker has not exited; owned extraction retained.');
            process.exitCode = 1;
            return;
        }
        cleanupPending = false;
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
    process.on('exit', cleanup);
    const onInt = () => process.exit(130), onTerm = () => process.exit(143), onHup = () => process.exit(129);
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
    const handoffSignals = () => { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGHUP', onHup); };
    try {
        const manifest = JSON.parse(getAsset('manifest', 'utf8'));
        const file = path.join(dir, 'keyring.node');
        fs.writeFileSync(file, Buffer.from(getAsset('native')), { mode: 0o600 });
        require('../lib/native-binding').setPackagedBinding(process.platform === 'win32'
            ? (windowsBinding = require('../lib/packaged-windows-binding').createWindowsBinding(file, { onIdle: () => { if (cleanupPending) cleanup(); } }))
            : createRequire(process.execPath)(file));
        const args = process.argv.slice(2);
        if (args.includes('--help') || args.includes('-h')) {
            console.log('EducationPerfected\nUsage: educationperfected [--setup | --forget-credentials]\nCommands: start, stop, status, mode auto, mode semi, refresh, quit');
            return;
        }
        if (args.includes('--setup') || args.includes('--forget-credentials')) {
            handoffSignals();
            await require('../bin/cli').credentialCommand(args.includes('--setup') ? '--setup' : '--forget-credentials');
            return;
        }
        // Read-only view over the embedded asset. Never write to this memory.
        const browserAsset = Buffer.from(getRawAsset('browser'));
        const browserStream = () => Readable.from((async function* () {
            for (let offset = 0; offset < browserAsset.length; offset += 65536) {
                yield browserAsset.subarray(offset, offset + 65536);
                // Keep startup signal handlers responsive during the full hash pass.
                await nextTurn();
            }
        })());
        if (browserAsset.length !== manifest.length) throw Error('Invalid browser payload size');
        const hash = createHash('sha256');
        for await (const chunk of browserStream()) hash.update(chunk);
        if (hash.digest('hex') !== manifest.sha256) throw Object.assign(new Error('Browser payload checksum mismatch'), {code:'EP_BROWSER_CHECKSUM'});
        await pipeline(browserStream(), createGunzip(), unpackTar(dir));
        process.env.PUPPETEER_EXECUTABLE_PATH = path.join(dir, manifest.executable);
        handoffSignals();
        await require('../bin/cli').runCli();
    } finally { cleanup(); handoffSignals(); process.removeListener('exit', cleanup); }
}
main().catch(error => { console.error(error?.code === 'EP_BROWSER_CHECKSUM' ? 'EducationPerfected could not start. Browser payload integrity check failed (EP_BROWSER_CHECKSUM).' : 'EducationPerfected could not start. ' + require('../lib/diagnostics').diagnostic(error, 'Startup')); process.exitCode = 1; });
