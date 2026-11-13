const fs = require('node:fs'), path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { getAsset, getRawAsset } = require('node:sea');
const { Readable } = require('node:stream');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { unpackTar } = require('modern-tar/fs');
function createCleanup(dir,getBinding,setPending,remove = () => fs.rmSync(dir, { recursive: true, force: true })){
 return ()=>{
        if (getBinding()?.hasLiveWorkers()) {
            setPending(true);
            console.error('Native credential worker has not exited; owned extraction retained.');
            process.exitCode ||= 1;
            return;
        }
        setPending(false);
        try { remove(); } catch {
            console.error('Owned extraction cleanup failed; temporary files may remain.');
            process.exitCode ||= 1;
        } };
}
async function prepareEmbeddedBrowser(dir,manifest){
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
    process.env.PUPPETEER_EXECUTABLE_PATH = process.platform === 'darwin'
        ? require('./macos-extracted-executable').macosExtractedExecutable(dir, manifest.executable)
        : path.join(dir, manifest.executable);
    if (process.env.EP_TEST_BOOT === '1' && process.env.EP_TEST_BROWSER_IDENTITY === '1') {
        require('../lib/test-browser-identity').emitBrowserIdentity(manifest);
    }
}
async function main() {
    const runtime = require('../lib/runtime-directory').createRuntimeDirectory();
    const dir = runtime.directory;
    // Puppeteer creates its per-launch profile beneath this owned run directory.
    process.env.PUPPETEER_TMP_DIR = dir;
    let browserCleanupConfirmed = true;
    let windowsBinding, cleanupPending = false;
    const cleanup=createCleanup(dir,()=>windowsBinding,value=>{cleanupPending=value;},()=>{
        if (!runtime.remove(browserCleanupConfirmed)) {
            console.error('Browser closure unconfirmed; owned runtime files retained.');
            process.exitCode ||= 1;
        }
    });
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
            console.log('EducationPerfected\nUsage: educationperfected [--setup | --forget-credentials | --check-credentials]\nCommands: start, stop, status, mode auto, mode semi, refresh, quit');
            return;
        }
        if (['--setup','--forget-credentials','--check-credentials'].some(command => args.includes(command))) {
            handoffSignals();
            const commands = ['--setup','--forget-credentials','--check-credentials'].filter(value => args.includes(value));
            if (commands.length > 1) { console.error('Choose only one credential command.'); process.exitCode ||= 1; return; }
            const command = commands[0];
            try { await require('../bin/cli').credentialCommand(command); }
            catch { console.error('Credential command failed. Unlock the OS credential store or run --setup to replace an invalid saved record; no plaintext fallback is used.'); process.exitCode ||= 1; }
            return;
        }
        if(manifest.browserMode==='direct-google-download') {
            if(manifest.browserVersion!==require('./browser-downloads.json').version)throw new Error('Browser download pin mismatch');
            process.env.PUPPETEER_BROWSER='chrome';
            process.env.PUPPETEER_EXECUTABLE_PATH=await require('./download-browser').ensureBrowser();
        } else {
            await prepareEmbeddedBrowser(dir,manifest);
        }
        handoffSignals();
        browserCleanupConfirmed = false;
        await require('../bin/cli').runCli();
        browserCleanupConfirmed = true;
    } finally { cleanup(); handoffSignals(); process.removeListener('exit', cleanup); }
}
main().catch(error => { console.error(error?.code === 'EP_BROWSER_CHECKSUM' ? 'EducationPerfected could not start. Browser payload integrity check failed (EP_BROWSER_CHECKSUM).' : 'EducationPerfected could not start. ' + require('../lib/diagnostics').diagnostic(error, 'Startup')); process.exitCode ||= 1; });
