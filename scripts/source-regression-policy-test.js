// Fixed repository workflow source only; no YAML execution or external actions.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../.github/workflows/source-regression.yml'),'utf8');
for(const required of ['pull_request:', 'push:', 'branches: [main]', 'contents: read', 'persist-credentials: false', 'npm ci --ignore-scripts', 'node-version: 22.23.4', 'browsers install chrome-headless-shell', 'npm run test:phase3'])assert.ok(source.includes(required),required);
assert.doesNotMatch(source,/pull_request_target|secrets\.|contents: write|upload-artifact|create-release|git push|--no-sandbox/);
const scripts=require('../package.json').scripts;
for(const name of ['test:startup','test:cli'])assert.ok(scripts['test:phase3'].includes(name));
for(const file of ['legacy-drain-signal-test.js','legacy-drain-signal-test.js --force'])assert.ok(scripts['test:startup'].includes(file));
assert.ok(scripts['test:cli'].includes('cli-test.js'));
console.log('Ordinary PR/main source regression workflow covers startup/drain/CLI with pinned read-only actions and no publication (source policy only).');
