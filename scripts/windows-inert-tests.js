// Cross-platform inert contracts only. These scripts never open a native API.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const scripts = ['windows-conpty-test.py', 'windows-owned-pipe-test.py', 'windows-owned-pipe-protocol-test.py', 'windows-owned-pipe-helper-test.py', 'windows-stage-transport-probe-test.py', 'windows-workflow-policy-test.py'];
function runInertTests(platform = process.platform, spawn = spawnSync, report = message => console.error(message)) {
    const python = platform === 'win32' ? 'python' : 'python3';
    for (const script of scripts) {
        const result = spawn(python, ['-B', path.join(__dirname, script)], { stdio: 'inherit', shell: false, timeout: 60000 });
        if (result.error || result.signal || result.status !== 0) {
            report('Windows inert contract failed: ' + script);
            return 1;
        }
    }
    return 0;
}
module.exports = { runInertTests };
if (require.main === module) process.exitCode = runInertTests();
