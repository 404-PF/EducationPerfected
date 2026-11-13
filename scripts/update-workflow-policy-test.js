// Policy contracts for the update command's CI lane: native proof only, never publication.
const assert = require('node:assert/strict'), fs = require('node:fs');
const workflow = fs.readFileSync(__dirname + '/../.github/workflows/update-validation.yml', 'utf8');

// Read-only: no permission to create releases, tags or uploads, and no step does so.
assert.ok(workflow.includes('permissions:\n  contents: read'), 'read-only token');
for (const forbidden of ['contents: write', 'gh release', 'gh api', 'upload-release', 'softprops/', 'actions/upload-artifact', 'git tag', 'git push']) {
    assert.ok(!workflow.includes(forbidden), 'workflow must not contain: ' + forbidden);
}
// Manual dispatch plus post-merge proof on main only; no release/pr-triggered path can form.
assert.match(workflow, /workflow_dispatch/);
assert.ok(!/release:|workflow_run:|pull_request/.test(workflow), 'no release/PR triggers');
assert.ok(workflow.includes('push:\n    branches: [main]'), 'push trigger is main-only');
// Native proof needs the Windows runner (running-executable replacement semantics).
assert.ok(workflow.includes('windows-2025'), 'windows lane');
assert.ok(workflow.includes('ubuntu-22.04'), 'linux lane');
assert.ok(workflow.includes('macos-15'), 'macos lane');
assert.ok(workflow.includes('npm run test:update'), 'runs the update contract tests');
console.log('Update workflow policy: read-only manual lane, no release/tag/upload capability, native Windows/macOS/Linux proof steps present.');
