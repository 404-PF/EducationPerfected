#!/usr/bin/env python3
"""Source-only guard for native-command fail-fast in the fixed Windows workflow."""
import pathlib
workflow=pathlib.Path(__file__).resolve().parent.parent/'.github/workflows/phase3-windows-store-validation.yml'
text=workflow.read_text();lines=text.splitlines()
commands=0
for index,line in enumerate(lines):
    if line.startswith('          ') and line.strip().startswith(('git ','node ','python ','npm ','npx ','pwsh ','.\\','$node = ','$env:EP_FIXTURE_PYTHON = ')):
        commands+=1
        assert lines[index+1].strip()=='if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',line
assert commands>=14
for name in ('run-controls-test.js','pending-launch-signal-test.js','native-store-test.js','credential-health-test.js','native-resolver-proof-test.js','sea-checksum-test.js','bootstrap-cleanup-test.js'):
    assert 'node scripts/'+name in text
assert 'node scripts/cli-test.js' not in text and 'npm run test:phase3' not in text
print('Windows workflow source contract: each multiline native command has immediate fail-fast exit; browser-free inventory only. Not executed PowerShell/native proof.')
