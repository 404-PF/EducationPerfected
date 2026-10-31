const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const {validate, sourceState} = require('./release-gate');
const criteria = require('../release/criteria.json');
const commit = 'a'.repeat(40), label = 'windows-x64/console-shutdown';
const record = () => ({status: criteria.acceptedStatus, sourceCommit: commit, evidence: 'https://example.invalid/fixture-report', reviewer: 'fixture-reviewer'});
const complete = () => {
    const evidence = {schemaVersion: criteria.schemaVersion, sourceCommit: commit, global: {}, targets: {}};
    for (const check of criteria.globalChecks) evidence.global[check] = record();
    for (const target of criteria.targets) { evidence.targets[target] = {}; for (const check of criteria.targetChecks) evidence.targets[target][check] = record(); }
    return evidence;
};
assert.ok(validate({}, commit).length);
assert.deepEqual(validate(complete(), commit), []);
for (const status of ['skipped', 'fixture-only', 'not-run', 'failed', 'pending']) {
    const evidence = complete(); evidence.targets['windows-x64']['console-shutdown'].status = status;
    assert.ok(validate(evidence, commit).includes(label + ': not passed (SKIP is not proof)'));
}
const stale = complete(); stale.targets['windows-x64']['console-shutdown'].sourceCommit = 'b'.repeat(40);
assert.deepEqual(validate(stale, commit), [label + ': source commit mismatch']);
assert.ok(validate(complete(), 'b'.repeat(40)).includes('Evidence schema/source commit mismatch'));
for (const value of [undefined, '', 'fixture-report', 'http://example.invalid/proof', 'https://user:password@example.invalid/proof', './absent-report']) {
    const evidence = complete(); evidence.targets['linux-arm64']['clean-machine-no-node'].evidence = value;
    assert.ok(validate(evidence, commit).some(x => x.startsWith('linux-arm64/clean-machine-no-node: missing evidence')));
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-release-gate-'));
const git = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';
const run = args => execFileSync(git, args, {cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
try {
    run(['init']); run(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']);
    const head = run(['rev-parse', 'HEAD']); assert.equal(sourceState(dir), head);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\nrelease/evidence.json\n');
    run(['add', '.gitignore']); run(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'ignore generated evidence']);
    fs.mkdirSync(path.join(dir, 'build')); fs.writeFileSync(path.join(dir, 'build/artifact'), 'fixture');
    fs.mkdirSync(path.join(dir, 'release')); fs.writeFileSync(path.join(dir, 'release/evidence.json'), '{}');
    const evidence = complete(); evidence.global['project-rights'].evidence = './build/artifact'; assert.deepEqual(validate(evidence, commit, dir), []);
    assert.equal(sourceState(dir), run(['rev-parse', 'HEAD']));
    fs.writeFileSync(path.join(dir, 'untracked-source'), 'dirty'); assert.throws(() => sourceState(dir), {code: 'DIRTY_WORKTREE'});
    fs.unlinkSync(path.join(dir, 'untracked-source'));
    fs.writeFileSync(path.join(dir, '.git/info/exclude'), 'hidden-source.js\n');
    fs.writeFileSync(path.join(dir, 'hidden-source.js'), 'source hidden by local excludes');
    assert.throws(() => sourceState(dir), {code: 'DIRTY_WORKTREE'}); fs.unlinkSync(path.join(dir, 'hidden-source.js'));
    const externalIgnore = path.join(os.tmpdir(), 'ep-release-ignore-' + process.pid);
    try {
        fs.writeFileSync(externalIgnore, 'global-hidden.js\n'); run(['config', 'core.excludesFile', externalIgnore]);
        fs.writeFileSync(path.join(dir, 'global-hidden.js'), 'source hidden by global excludes');
        assert.throws(() => sourceState(dir), {code: 'DIRTY_WORKTREE'}); fs.unlinkSync(path.join(dir, 'global-hidden.js'));
    } finally { fs.rmSync(externalIgnore, {force: true}); }
    fs.mkdirSync(path.join(dir, 'node_modules')); fs.writeFileSync(path.join(dir, 'node_modules/generated'), 'installed');
    assert.equal(sourceState(dir), run(['rev-parse', 'HEAD']));
    fs.appendFileSync(path.join(dir, '.gitignore'), '# dirty tracked\n'); assert.throws(() => sourceState(dir), {code: 'DIRTY_WORKTREE'});
    run(['add', '.gitignore']); assert.throws(() => sourceState(dir), {code: 'DIRTY_WORKTREE'});
} finally { fs.rmSync(dir, {recursive: true, force: true}); }
console.log('Release gate: schema, per-record freshness, status, evidence references and clean checkout controls passed (synthetic proof only).');
