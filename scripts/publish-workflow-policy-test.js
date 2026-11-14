// Fixed repository workflow source only; no YAML execution or external actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/publish.yml'),'utf8');
for(const required of [
 'name: Publish','workflow_dispatch:','tag:','types: [published]','contents: write','actions: read',
 'releases/tags/$TAG','.draft','.assets | length','.target_commitish','Not Found',
 'release-bundle-v','workflow_run.head_sha','.github/workflows/release-bundle-staging.yml','.conclusion',
 'sha256sum -c SHA256SUMS','21 payloads + SHA256SUMS','%{redirect_url}',
 'gh release upload "$TAG" -- *','Publication stays manual',
 'not a draft; refusing to modify a published release','already has $assets assets; remove them manually to re-attach',
 'gained $assets assets since the run started; refusing to attach','leaving it untouched',
])assert.ok(source.includes(required),required);
assert.ok(!source.includes('uses:'),'pure shell: no external actions to pin');
assert.ok(!source.includes('--clobber'),'never replaces assets');
assert.doesNotMatch(source,/pull_request_target|git push|gh release create|gh release edit|gh release publish|gh release delete|types: \[created|softprops|ncipollo/);
assert.ok(require('../package.json').scripts['test:phase3'].includes('publish-workflow-policy-test.js'),'wired into test:phase3');
console.log('Publish workflow: manual button attaches the verified bundle to an empty draft; automatic attach only after publish with zero assets; refuses to touch any release that has assets; never tags, edits or publishes.');
