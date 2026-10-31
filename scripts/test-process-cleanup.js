// Test harness cleanup only. Never search PATH for a Windows executable.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function windowsTaskkillPath(systemRoot) {
    if (typeof systemRoot !== 'string' || !/^[a-z]:[\\/]/i.test(systemRoot) || systemRoot.split(/[\\/]/).some(part => part === '..')) {
        throw new Error('An absolute Windows SystemRoot is required for test cleanup.');
    }
    return path.win32.join(systemRoot, 'System32', 'taskkill.exe');
}
function cleanupTestProcess(child) {
    if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return;
    if (process.platform === 'win32') {
        execFileSync(windowsTaskkillPath(process.env.SystemRoot), ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else process.kill(-child.pid, 'SIGKILL');
}
module.exports = { cleanupTestProcess, windowsTaskkillPath };
