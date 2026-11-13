// Policy contracts for the update command's CI lane: native proof only, never publication.
const assert = require('node:assert/strict'), fs = require('node:fs');
const workflow = fs.readFileSync(__dirname + '/../.github/workflows/update-validation.yml', 'utf8');

// Read-only: no permission to create releases, tags or uploads, and no step does so.
assert.match(workflow, /permissions:\s*\r?\n\s*contents:\s*read/);
for (const forbidden of ['contents: write', 'gh release', 'gh api', 'upload-release', 'softprops/', 'actions/upload-artifact', 'git tag', 'git push']) {
    assert.ok(!workflow.includes(forbidden), 'workflow must not contain: ' + forbidden);
}
// Manual trigger only; no automatic publication path can form.
assert.match(workflow, /workflow_dispatch/);
assert.ok(!/on:\s*\r?\n\s*(push|release|workflow_run):/.test(workflow), 'no push/release triggers');
// Native proof needs the Windows runner (running-executable replacement semantics).
assert.ok(workflow.includes('windows-2025'), 'windows lane');
assert.ok(workflow.includes('ubuntu-22.04'), 'linux lane');
assert.ok(workflow.includes('macos-15'), 'macos lane');
assert.ok(workflow.includes('npm run test:update'), 'runs the update contract tests');
console.log('Update workflow policy: read-only manual lane, no release/tag/upload capability, native Windows/macOS/Linux proof steps present.');
