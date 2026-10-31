const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const criteria = require('../release/criteria.json');
function validate(evidence, commit) {
    const failures = [];
    if (!/^[a-f0-9]{40}$/.test(commit || '')) failures.push('Expected exact source commit');
    if (evidence?.schemaVersion !== 1 || evidence?.sourceCommit !== commit) failures.push('Evidence schema/source commit mismatch');
    const inspect = (record, label) => {
        if (record?.status !== 'passed') failures.push(label + ': not passed (SKIP is not proof)');
        if (record?.sourceCommit !== commit) failures.push(label + ': source commit mismatch');
        if (typeof record?.evidence !== 'string' || !record.evidence.trim()) failures.push(label + ': missing evidence');
        if (typeof record?.reviewer !== 'string' || !record.reviewer.trim()) failures.push(label + ': missing reviewer');
    };
    for (const check of criteria.globalChecks) inspect(evidence?.global?.[check], 'global/' + check);
    for (const target of criteria.targets) for (const check of criteria.targetChecks) inspect(evidence?.targets?.[target]?.[check], target + '/' + check);
    return failures;
}
module.exports = { validate };
if (require.main === module) {
    const file = path.join(__dirname, '../release/evidence.json');
    if (!fs.existsSync(file)) { console.error('Release blocked: release/evidence.json is absent. Development builds are not releases.'); process.exitCode = 1; }
    else {
        try {
            const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
            const failures = validate(JSON.parse(fs.readFileSync(file, 'utf8')), commit);
            if (failures.length) { console.error('Release blocked:\n' + failures.join('\n')); process.exitCode = 1; }
            else console.log('Release evidence checks complete for this commit. Publication still requires authority; evidence authenticity needs review.');
        } catch { console.error('Release blocked: evidence could not be validated.'); process.exitCode = 1; }
    }
}
