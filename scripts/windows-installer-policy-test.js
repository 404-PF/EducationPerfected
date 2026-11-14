// Fixed repository source only; no Inno compile or installer execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const iss=fs.readFileSync(path.join(__dirname,'../installer/windows-setup.iss'),'utf8');
for(const required of [
 'AppId={{5C0EDD47-9C42-5901-AF48-2393F39A36CD}','PrivilegesRequired=lowest',
 '{localappdata}\\Programs\\EducationPerfected','OutputBaseFilename=educationperfected-setup-windows-x64',
 'DestName: "educationperfected.exe"','Name: "addtopath"','{group}\\EducationPerfected',
 'CurUninstallStepChanged','RemoveAppFromPath','UninstallDisplayName=EducationPerfected',
 '[UninstallDelete]','[InstallDelete]','{app}\\educationperfected-windows-x64.exe.update-result','educationperfected.exe.backup','educationperfected.exe.update-result',
 'educationperfected.exe.update.lock','{app}\\.update-*',
 'MB_DEFBUTTON2','forget-credentials','DelTree','{%USERPROFILE}\\.educationperfected',
])assert.ok(iss.includes(required),required);
assert.equal((iss.match(/MB_DEFBUTTON2/g)||[]).length,2,'both uninstall prompts default to No');
assert.doesNotMatch(iss,/PrivilegesRequired=(admin|poweruser)/);
assert.ok(!iss.includes('ChangesUninstall'),'not a valid Inno directive; ISCC aborts on it');
assert.ok(!iss.includes('StringChange'),'PATH removal matches whole ;-delimited entries, never substrings');
assert.ok(iss.includes('WizardIsTaskSelected'),'task check uses the wizard-context function');
assert.ok(!iss.includes('RegWriteStringValue'),'PATH writes must preserve REG_EXPAND_SZ');
assert.ok(iss.includes('RegWriteExpandStringValue'),'PATH writes use RegWriteExpandStringValue');
const beta=fs.readFileSync(path.join(__dirname,'../.github/workflows/beta-preparation.yml'),'utf8');
for(const required of [
 'Inno Setup 6\\ISCC.exe',"require('./package.json').version",'/DAppVersion','/DSourceExe',
 'installer\\windows-setup.iss','educationperfected-setup-windows-x64.exe >> SHA256SUMS',
 "inputs.browser_mode == 'direct-download-validation' && runner.os == 'Windows'",
])assert.ok(beta.includes(required),required);
const isccStep=beta.split('      - name: Build the per-user Windows installer')[1].split('      - name:')[0];
assert.ok(isccStep.includes('Join-Path $root'),'ISCC receives absolute paths; Inno resolves relative Source/OutputDir against the script directory');
assert.doesNotMatch(isccStep,/\/DSourceExe=build\\/,'no repo-root-relative /DSourceExe');
const compileCheck=fs.readFileSync(path.join(__dirname,'../.github/workflows/installer-compile-check.yml'),'utf8');
for(const required of ['pull_request:','windows-2025','Inno Setup 6\\ISCC.exe','stub executable, compile proof only','Join-Path $root','contents: read'])assert.ok(compileCheck.includes(required),required);
assert.doesNotMatch(compileCheck,/upload-artifact|contents: write|pull_request_target/,'compile proof only, no artifacts or write access');
const bundles=beta.split('      - name: Upload explicitly requested downloadable candidate bundle')[1].split('      - name:')[0];
assert.match(bundles,/educationperfected\*/,'candidate upload picks up the installer via glob');
assert.ok(beta.indexOf('      - name: Stage explicitly requested Windows internal test package')<beta.indexOf('      - name: Checksum the Windows installer'),'test package stages before the installer line is appended to SHA256SUMS, keeping the manifest byte-equality assertion intact');
const staging=fs.readFileSync(path.join(__dirname,'../.github/workflows/release-bundle-staging.yml'),'utf8');
for(const required of ['windows-x64:educationperfected-setup-windows-x64.exe',' is not byte-identical to the validated candidate','21 payload files'])assert.ok(staging.includes(required),required);
assert.ok(require('../package.json').scripts['test:phase3'].includes('windows-installer-policy-test.js'),'wired into test:phase3');
console.log('Windows installer: per-user Inno Setup script, candidate lane builds and checksums it, staging bundles it byte-identical, raw exe asset names unchanged.');
