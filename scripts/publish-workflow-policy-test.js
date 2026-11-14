// Fixed repository workflow source only; no YAML execution or external actions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/publish.yml'),'utf8');
for(const required of [
 'name: Publish','release:','types: [created]','if: github.event.release.draft == true',
 'contents: write','actions: read','release-bundle-v','release-bundle-staging.yml',
 'workflow_run.head_sha','sha256sum -c SHA256SUMS','21 payloads + SHA256SUMS','%{redirect_url}',
 'gh release upload "$TAG" --clobber','remains a draft',
])assert.ok(source.includes(required),required);
assert.ok(!source.includes('uses:'),'pure shell: no external actions to pin');
assert.doesNotMatch(source,/pull_request_target|git push|gh release create|gh release edit|gh release publish|gh release delete|softprops|ncipollo/);
assert.ok(require('../package.json').scripts['test:phase3'].includes('publish-workflow-policy-test.js'),'wired into test:phase3');
console.log('Publish workflow: draft-created releases only, staging bundle re-verified against SHA256SUMS, attach-only (never tags, edits or publishes).');
