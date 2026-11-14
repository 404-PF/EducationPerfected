// Fixed repository workflow source only; no YAML execution or external actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/release-bundle-staging.yml'),'utf8');
for(const required of [
 'workflow_dispatch:','source_run_id:','release_version:','actions: read','contents: read',
 'persist-credentials: false','/actions/runs/$RUN_ID/artifacts','downloadable-candidate-',
 'sha256sum -c SHA256SUMS','sha256sum -- *','byte-identical','release-notes.md','THIRD-PARTY-NOTICES-$target.zip',
 'educationperfected-setup-windows-x64.exe','21 payload files',String.raw`sub(/^\*`,
 'name: release-bundle-v','retention-days: 90','if-no-files-found: error',
 '"\\(.id) \\(.name)"','%{redirect_url}','source_run_id must be numeric','release_version must be three numeric parts',
])assert.ok(source.includes(required),required);
assert.ok(!source.includes('curl -sfL -H "Authorization'),'token must never follow a redirect');
assert.doesNotMatch(source,/pull_request_target|contents: write|actions: write|packages: write|create-release|gh release|git push|softprops|ncipollo/);
for(const line of source.split('\n'))if(line.includes('uses:'))assert.match(line,/\/[a-z0-9-]+@[a-f0-9]{40}(?:\s|$)/,'pinned action: '+line);
assert.ok(fs.existsSync(path.join(__dirname,'../release/release-notes-2026.11.14.md')),'release notes source file exists');
assert.ok(require('../package.json').scripts['test:phase3'].includes('release-bundle-staging-test.js'),'wired into test:phase3');
console.log('Release bundle staging workflow: artifact-only, pinned actions, 90-day retention, checksum-verified assembly, no publication path.');
