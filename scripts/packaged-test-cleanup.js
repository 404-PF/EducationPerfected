const { cleanupTestProcess } = require('./test-process-cleanup');
async function boundedClose(closed, milliseconds, message) {
    let timer;
    try { return await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
    finally { clearTimeout(timer); }
}
async function stopChild(child, closed) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    try { await boundedClose(closed, 6000, 'Packaged child ignored SIGTERM'); }
    catch { try { cleanupTestProcess(child); } catch { child.kill('SIGKILL'); } await boundedClose(closed, 3000, 'Packaged child ignored forced cleanup'); }
}
module.exports = { boundedClose, stopChild };
