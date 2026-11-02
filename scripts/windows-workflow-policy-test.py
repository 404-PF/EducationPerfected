#!/usr/bin/env python3
"""Source-only guard for native-command fail-fast in the fixed Windows workflow."""
import pathlib
workflow=pathlib.Path(__file__).resolve().parent.parent/'.github/workflows/phase3-windows-store-validation.yml'
text=workflow.read_text();lines=text.splitlines()
commands=0
for index,line in enumerate(lines):
    if line.startswith('          ') and line.strip().startswith(('git ','node ','python ','npm ','npx ','pwsh ','& ','.\\','$node = ','$env:EP_FIXTURE_PYTHON = ')):
        commands+=1
        if index+1>=len(lines) or lines[index+1].strip()!='if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }':
            raise RuntimeError('Missing immediate exit guard: '+line)
if commands<14:raise RuntimeError('Expected fixed native command inventory')
for name in ('run-controls-test.js','pending-launch-signal-test.js','native-store-test.js','credential-health-test.js','native-resolver-proof-test.js','sea-checksum-test.js','bootstrap-cleanup-test.js'):
    if 'node scripts/'+name not in text:raise RuntimeError('Missing browser-free test: '+name)
if 'run: npm run test:windows-inert' not in text:raise RuntimeError('Missing Windows inert contract entrypoint')
if 'node scripts/cli-test.js' in text or 'npm run test:phase3' in text:raise RuntimeError('Browserful suite in browser-free workflow')
print('Windows workflow source contract: each multiline native command has immediate fail-fast exit; browser-free inventory only. Not executed PowerShell/native proof.')
