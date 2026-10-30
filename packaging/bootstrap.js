const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { getAsset } = require('node:sea');
const { unpackTar } = require('modern-tar/fs');
async function main() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'educationperfected-'));
    fs.chmodSync(dir, 0o700);
    const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
    process.on('exit', cleanup);
    const onInt = () => process.exit(130), onTerm = () => process.exit(143), onHup = () => process.exit(129);
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
    const handoffSignals = () => { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGHUP', onHup); };
    try {
        const manifest = JSON.parse(getAsset('manifest', 'utf8'));
        const file = path.join(dir, 'keyring.node');
        fs.writeFileSync(file, Buffer.from(getAsset('native')), { mode: 0o600 });
        require('../lib/native-binding').setPackagedBinding(createRequire(process.execPath)(file));
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
        const fd = fs.openSync(process.execPath, 'r');
        let offset, length;
        try {
            const size = fs.fstatSync(fd).size, footer = Buffer.alloc(16);
            fs.readSync(fd, footer, 0, 16, size - 16);
            if (footer.subarray(8).toString() !== 'EPBNDL01') throw Error('Missing browser payload');
            const bytes = footer.readBigUInt64LE(0);
            if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Invalid browser payload size');
            length = Number(bytes); offset = size - 16 - length;
            if (offset < 0 || length !== manifest.length) throw Error('Invalid browser payload size');
        } finally { fs.closeSync(fd); }
        const hash = createHash('sha256');
        for await (const chunk of fs.createReadStream(process.execPath, { start: offset, end: offset + length - 1 })) hash.update(chunk);
        if (hash.digest('hex') !== manifest.sha256) throw Error('Browser payload checksum mismatch');
        await pipeline(fs.createReadStream(process.execPath, { start: offset, end: offset + length - 1 }), createGunzip(), unpackTar(dir));
        process.env.PUPPETEER_EXECUTABLE_PATH = path.join(dir, manifest.executable);
        handoffSignals();
        await require('../bin/cli').runCli();
    } finally { cleanup(); handoffSignals(); process.removeListener('exit', cleanup); }
}
main().catch(error => { console.error('EducationPerfected could not start. ' + require('../lib/diagnostics').diagnostic(error, 'Startup')); process.exitCode = 1; });
