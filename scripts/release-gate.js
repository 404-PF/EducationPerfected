const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const criteria = require('../release/criteria.json');
const root = path.join(__dirname, '..');
// Fail closed on nonstandard Git installations instead of searching inherited PATH.
const git = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';
function evidenceReference(value, base) {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) return false;
    if (value.startsWith('https://')) {
        try { const url = new URL(value); return !!url.hostname && !url.username && !url.password && !/\s/.test(value); }
        catch { return false; }
    }
    if (!path.isAbsolute(value) && !value.startsWith('./')) return false;
    try { return fs.statSync(path.resolve(base, value)).isFile(); } catch { return false; }
}
function validate(evidence, commit, base = root) {
    const failures = [];
    if (!/^[a-f0-9]{40}$/.test(commit || '')) failures.push('Expected exact source commit');
    if (evidence?.schemaVersion !== criteria.schemaVersion || evidence?.sourceCommit !== commit) failures.push('Evidence schema/source commit mismatch');
    const inspect = (record, label) => {
        if (record?.status !== criteria.acceptedStatus) failures.push(label + ': not passed (SKIP is not proof)');
        if (record?.sourceCommit !== commit) failures.push(label + ': source commit mismatch');
        if (!evidenceReference(record?.evidence, base)) failures.push(label + ': missing evidence or invalid evidence reference');
        if (typeof record?.reviewer !== 'string' || !record.reviewer.trim()) failures.push(label + ': missing reviewer');
    };
    for (const check of criteria.globalChecks) inspect(evidence?.global?.[check], 'global/' + check);
    for (const target of criteria.targets) for (const check of criteria.targetChecks) inspect(evidence?.targets?.[target]?.[check], target + '/' + check);
    return failures;
}
function sourceState(directory = root) {
    // Git environment overrides must not redirect the check to a different checkout.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
    const options = { cwd: directory, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    const commit = execFileSync(git, ['rev-parse', 'HEAD'], options).trim();
    const dirty = execFileSync(git, ['status', '--porcelain=v1', '--untracked-files=no'], options).trim();
    // Do not use --exclude-standard: local/global ignore rules must not hide source.
    // Only these generated paths are excluded, independent of user Git config.
    const untracked = execFileSync(git, ['ls-files', '--others', '-z', '--', '.', ':!:node_modules', ':!:build', ':!:release/evidence.json'], options);
    if (dirty || untracked) throw Object.assign(new Error('Source worktree is dirty'), { code: 'DIRTY_WORKTREE' });
    return commit;
}
module.exports = { validate, sourceState };
if (require.main === module) {
    const file = path.join(root, 'release/evidence.json');
    if (!fs.existsSync(file)) { console.error('Release blocked: release/evidence.json is absent. Development builds are not releases.'); process.exitCode = 1; }
    else {
        try {
            const commit = sourceState();
            const failures = validate(JSON.parse(fs.readFileSync(file, 'utf8')), commit);
            if (failures.length) { console.error('Release blocked:\n' + failures.join('\n')); process.exitCode = 1; }
            else console.log('Release evidence checks complete for this commit. Publication still requires authority; evidence authenticity needs review.');
        } catch (error) {
            // Avoid printing evidence, environment values or Git stderr in diagnostics.
            const category = error?.code === 'DIRTY_WORKTREE' ? 'source worktree is dirty' : error instanceof SyntaxError ? 'malformed evidence JSON' : error?.code === 'ENOENT' ? 'Git is unavailable at the fixed system path' : 'Git checkout or evidence could not be read';
            console.error('Release blocked: ' + category + '.'); process.exitCode = 1;
        }
    }
}
