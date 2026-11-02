// Cross-platform inert contracts only. These scripts never open a native API.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const scripts = ['windows-conpty-test.py', 'windows-startup-leg-helper-test.py', 'windows-stage-transport-probe-test.py', 'windows-workflow-policy-test.py'];
const python = process.platform === 'win32' ? 'python' : 'python3';
for (const script of scripts) {
    const result = spawnSync(python, ['-B', path.join(__dirname, script)], { stdio: 'inherit', shell: false, timeout: 60000 });
    if (result.error || result.signal || result.status !== 0) {
        console.error('Windows inert contract failed: ' + script);
        process.exitCode = 1;
        break;
    }
}
