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
    const parsed = require('../lib/cli-command').parseCommand(process.argv.slice(2));
    if (parsed.error) { console.error(parsed.error); process.exitCode=1; return; }
    if (parsed.command === 'help') { console.log(require('../lib/cli-command').helpText()); return; }
    if (parsed.command === 'version') { console.log(require('../package.json').version); return; }
    if (parsed.command === 'update') {
        await require('./update').updateCommand({executable:process.execPath});
        return;
    }
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
        if (parsed.command === 'uninstall') {
            handoffSignals();
            const result=await require('./uninstall').uninstallCommand({store:require('../lib/credential-store').createCredentialStore(),ownDirectory:dir,cleanupOwn:async()=>{
                if(windowsBinding?.hasLiveWorkers())throw new Error('Credential worker closure unconfirmed');
                runtime.remove(true);
            }});
            if(result.incomplete)process.exitCode ||= 1;
            return;
        }
        if (['setup','forget-credentials','check-credentials'].includes(parsed.command)) {
            handoffSignals();
            try {
                if (parsed.command === 'setup') {
                    await require('./download-browser').ensureBrowser();
                    console.log('Browser ready. Saving a login is optional; leave email empty to skip.');
                }
                await require('../bin/cli').credentialCommand('--'+parsed.command);
            } catch { console.error('Setup/credential command failed; no plaintext fallback.'); process.exitCode ||= 1; }
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
        await require('../bin/cli').runCli({onBrowserClosed:()=>{browserCleanupConfirmed=true;}});
        browserCleanupConfirmed = true;
    } finally { cleanup(); handoffSignals(); process.removeListener('exit', cleanup); }
}
main().catch(error => { console.error(error?.code === 'EP_BROWSER_CHECKSUM' ? 'EducationPerfected could not start. Browser payload integrity check failed (EP_BROWSER_CHECKSUM).' : 'EducationPerfected could not start. ' + require('../lib/diagnostics').diagnostic(error, 'Startup')); process.exitCode ||= 1; });
