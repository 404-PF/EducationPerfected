// Packaged runtime files only. The browser download cache remains untouched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function realDirectory(directory) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Runtime directory must be a real directory');
    return fs.realpathSync(directory);
}
function ensureDirectory(directory) {
    try { fs.mkdirSync(directory, {mode:0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return realDirectory(directory);
}
function processState(pid, kill = process.kill) {
    try { kill(pid, 0); return 'alive'; }
    catch (error) { return error.code === 'ESRCH' ? 'dead' : 'unknown'; }
}
function readOwner(directory) {
    const file = path.join(directory, 'OWNER.json');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) return null;
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (owner.schema !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !['running','cleanup-ready'].includes(owner.state)) return null;
    return owner;
}
function sweep(tmp, kill) {
    for (const name of fs.readdirSync(tmp)) {
        if (!/^run-[A-Za-z0-9]{6}$/.test(name)) continue;
        const directory = path.join(tmp, name);
        try {
            realDirectory(directory);
            const owner = readOwner(directory);
            // A crashed owner may leave Chrome alive. A dead PID alone is not
            // clearance to delete its profile. Only retry a confirmed-safe exit.
            if (owner?.state === 'cleanup-ready' && processState(owner.pid, kill) === 'dead') fs.rmSync(directory, {recursive:true});
        } catch { /* Unrecognized or uncertain data remains untouched. */ }
    }
}
function createRuntimeDirectory({home = os.homedir(), pid = process.pid, kill = process.kill} = {}) {
    const canonicalHome = realDirectory(home);
    const root = ensureDirectory(path.join(canonicalHome, '.educationperfected'));
    const tmp = ensureDirectory(path.join(root, 'tmp'));
    sweep(tmp, kill);
    const directory = fs.mkdtempSync(path.join(tmp, 'run-'));
    fs.chmodSync(directory, 0o700);
    const owner = {schema:1, pid, state:'running'};
    const marker = path.join(directory, 'OWNER.json');
    fs.writeFileSync(marker, JSON.stringify(owner), {flag:'wx', mode:0o600});
    let removed = false;
    return {
        directory,
        remove(safe) {
            if (removed) return true;
            if (!safe) return false;
            if (realDirectory(directory) !== directory) throw new Error('Runtime ownership changed');
            const current = readOwner(directory);
            if (!current || current.pid !== pid) throw new Error('Runtime owner changed');
            const pending = path.join(directory, 'OWNER.next');
            fs.writeFileSync(pending, JSON.stringify({...owner, state:'cleanup-ready'}), {flag:'wx', mode:0o600});
            fs.renameSync(pending, marker);
            fs.rmSync(directory, {recursive:true});
            removed = true;
            return true;
        },
    };
}
module.exports = {createRuntimeDirectory, processState};
