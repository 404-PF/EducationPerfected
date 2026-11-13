const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const {validationLabel,inventory,targets}=require('./beta-candidate');
(async()=>{
    assert.equal(validationLabel('2026.11.12-validation.1'),'2026.11.12-validation.1');
    assert.equal(validationLabel('2026.2.28-validation.25'),'2026.2.28-validation.25');
    assert.throws(()=>validationLabel('2026.11.12-beta.1'),/Expected internal validation label/,'Public beta labels must not be consumed by validation runs');
    for(const bad of ['2026.02.28-validation.1','2026.2.29-validation.1','2026.4.31-validation.1','2026.0.1-validation.1','2026.13.1-validation.1','2026.1.0-validation.1','2026.11.12','2026.11.12-validation.0','2026.11.12-validation.01','2026.11.12-validation.1;echo unsafe','2027.1.1-validation.1'])assert.throws(()=>validationLabel(bad));
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-beta-contract-'));
    try{
        fs.mkdirSync(path.join(root,'THIRD-PARTY-NOTICES'));
        fs.writeFileSync(path.join(root,'educationperfected'),'synthetic executable, not native proof');
        fs.writeFileSync(path.join(root,'THIRD-PARTY-NOTICES','NOTICE.txt'),'synthetic notice');
        const options={directory:root,target:'linux-x64',version:'2026.11.12-validation.1',sourceCommit:'a'.repeat(40),sourceVersion:'2026.0.0',expectedBrowserVersion:'synthetic-pin'};
        const first=await inventory(options),second=await inventory(options);
        assert.deepEqual(first,second,'inventory is deterministic for exact bytes');
        assert.equal(first.files.length,2);assert.equal(first.publicationAuthorized,false);assert.equal(first.status,'build-only-not-for-distribution');
        assert.equal(first.files[0].sha256,createHash('sha256').update('synthetic executable, not native proof').digest('hex'));
        assert.deepEqual(Object.keys(targets).sort((a,b)=>a.localeCompare(b,'en')),['linux-arm64','linux-x64','macos-arm64','macos-x64','windows-x64']);
        fs.appendFileSync(path.join(root,'educationperfected'),'changed');
        assert.notEqual((await inventory(options)).files[0].sha256,first.files[0].sha256);
        await assert.rejects(inventory({...options,sourceCommit:'main'}));
        await assert.rejects(inventory({...options,target:'../foreign'}));
        const linked=root+'-link';
        try{
            fs.symlinkSync(root,linked,process.platform==='win32'?'junction':'dir');
            await assert.rejects(inventory({...options,directory:linked}),/real directories/);
        }finally{fs.rmSync(linked,{force:true});}
        const notices=path.join(root,'THIRD-PARTY-NOTICES'),saved=path.join(root,'saved-notices');
        fs.renameSync(notices,saved);
        try{
            fs.symlinkSync(saved,notices,process.platform==='win32'?'junction':'dir');
            await assert.rejects(inventory(options),/real directories/);
        }finally{fs.rmSync(notices,{force:true});fs.renameSync(saved,notices);}
        fs.rmSync(path.join(root,'educationperfected'));
        await assert.rejects(inventory(options));
    }finally{fs.rmSync(root,{recursive:true,force:true});}
    // Exercise the actual CLI on an isolated clean source commit. No build,
    // browser, credentials or publication process runs in this fixture.
    const checkout=fs.mkdtempSync(path.join(os.tmpdir(),'ep-beta-cli-'));
    try{
        for(const directory of ['scripts','release','packaging'])fs.mkdirSync(path.join(checkout,directory));
        for(const file of ['scripts/beta-candidate.js','scripts/release-gate.js','release/criteria.json','package.json'])fs.copyFileSync(path.resolve(__dirname,'..',file),path.join(checkout,file));
        const target=Object.keys(targets).find(key=>targets[key].platform===process.platform&&targets[key].arch===process.arch);
        assert.ok(target,'test host must be a supported native target');
        fs.writeFileSync(path.join(checkout,'packaging',targets[target].builder),String.raw`
const fs=require('node:fs'),path=require('node:path');
const out=path.join(process.cwd(),'build',${JSON.stringify(target)});
if(fs.existsSync(out))throw Error('Stale build directory was not removed');
if(process.env.EP_FIXTURE_FAIL==='1')process.exit(1);
fs.mkdirSync(path.join(out,'THIRD-PARTY-NOTICES'),{recursive:true});
fs.writeFileSync(path.join(out,${JSON.stringify(targets[target].executable)}),'synthetic fresh executable');
fs.writeFileSync(path.join(out,'THIRD-PARTY-NOTICES','NOTICE'),'synthetic');
if(process.env.EP_FIXTURE_DIRTY==='1')fs.appendFileSync('package.json','\n');
`);
        fs.mkdirSync(path.join(checkout,'node_modules','puppeteer'),{recursive:true});
        fs.writeFileSync(path.join(checkout,'node_modules','puppeteer','index.js'),'exports.PUPPETEER_REVISIONS={chrome: "synthetic"};');
        fs.writeFileSync(path.join(checkout,'packaging','build-downloadable.js'),`
const fs=require('node:fs'),path=require('node:path');
const out=path.join(process.cwd(),'build',${JSON.stringify(target+'-downloadable')});
if(fs.existsSync(out))throw Error('Stale downloadable build');
fs.mkdirSync(path.join(out,'THIRD-PARTY-NOTICES'),{recursive:true});
fs.writeFileSync(path.join(out,${JSON.stringify(targets[target].executable)}),'synthetic no-browser executable');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({browserMode:'direct-google-download',browserVersion:process.env.EP_BAD_PIN==='1'?'wrong':'synthetic'}));
fs.writeFileSync(path.join(out,'sea.json'),JSON.stringify({assets:{manifest:'inert',native:'inert',...(process.env.EP_BAD_ASSET==='1'?{browser:'bad'}:{})}}));
`);
        const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')&&key!=='GITHUB_SHA'));
        const gitPath=process.platform==='win32'?String.raw`C:\Program Files\Git\cmd\git.exe`:'/usr/bin/git';
        const git=(...args)=>execFileSync(gitPath,args,{cwd:checkout,env,encoding:'utf8'}).trim();
        git('init','--quiet');git('add','scripts','release','packaging','package.json');
        git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Synthetic fixture');
        const commit=git('rev-parse','HEAD');
        const command=(version='2026.11.12-validation.1',extra={})=>spawnSync(process.execPath,['scripts/beta-candidate.js','check',version,target],{cwd:checkout,env:{...env,...extra},encoding:'utf8'});
        const clean=command();assert.ifError(clean.error);assert.equal(clean.status,0,clean.stderr);assert.equal(JSON.parse(clean.stdout).sourceCommit,commit);
        const invalid=command('2026.2.29-validation.1');assert.ifError(invalid.error);assert.equal(invalid.status,1);
        const mismatch=command(undefined,{GITHUB_SHA:'b'.repeat(40)});assert.ifError(mismatch.error);assert.equal(mismatch.status,1);
        const build=extra=>spawnSync(process.execPath,['scripts/beta-candidate.js','build','2026.11.12-validation.1',target],{cwd:checkout,env:{...env,...extra},encoding:'utf8'});
        const directory=path.join(checkout,'build',target);
        fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'stale'),'old bytes');
        const built=build({});assert.ifError(built.error);assert.equal(built.status,0,built.stderr);
        assert.equal(fs.existsSync(path.join(directory,'stale')),false);
        const manifest=JSON.parse(fs.readFileSync(path.join(directory,'CANDIDATE.json'),'utf8'));assert.equal(manifest.sourceCommit,commit);
        assert.equal(manifest.schemaVersion,2);assert.equal(manifest.labelKind,'internal-validation-not-release');assert.equal(manifest.validationLabel,'2026.11.12-validation.1');assert.equal(manifest.target,target);assert.equal(manifest.publicationAuthorized,false);
        assert.equal(manifest.files[0].size,Buffer.byteLength('synthetic fresh executable'));
        assert.equal(manifest.files[0].sha256,createHash('sha256').update('synthetic fresh executable').digest('hex'));
        const downloadableDirectory=path.join(checkout,'build',target+'-downloadable');
        fs.mkdirSync(downloadableDirectory,{recursive:true});fs.writeFileSync(path.join(downloadableDirectory,'stale'),'old');
        const direct=spawnSync(process.execPath,['scripts/beta-candidate.js','build-downloadable','2026.11.12-validation.1',target],{cwd:checkout,env,encoding:'utf8'});
        assert.equal(direct.status,0,direct.stderr);assert.equal(fs.existsSync(path.join(downloadableDirectory,'stale')),false);
        const directManifest=JSON.parse(fs.readFileSync(path.join(checkout,'build',target+'-downloadable','CANDIDATE.json')));
        assert.equal(directManifest.distributionMode,'direct-google-download');assert.equal(directManifest.browserBundled,false);
        for(const control of ['EP_BAD_PIN','EP_BAD_ASSET']){const refused=spawnSync(process.execPath,['scripts/beta-candidate.js','build-downloadable','2026.11.12-validation.1',target],{cwd:checkout,env:{...env,[control]:'1'},encoding:'utf8'});assert.equal(refused.status,1);assert.match(refused.stderr,control==='EP_BAD_PIN'?/pin differs/:/unexpected browser assets/);assert.equal(fs.existsSync(path.join(downloadableDirectory,'CANDIDATE.json')),false);}
        const failed=build({EP_FIXTURE_FAIL:'1'});assert.ifError(failed.error);assert.equal(failed.status,1);
        assert.equal(fs.existsSync(path.join(directory,'CANDIDATE.json')),false,'failed builds cannot retain a candidate manifest');
        const drift=build({EP_FIXTURE_DIRTY:'1'});assert.ifError(drift.error);assert.equal(drift.status,1);
        assert.equal(fs.existsSync(path.join(directory,'CANDIDATE.json')),false,'source drift cannot be inventoried');
        fs.appendFileSync(path.join(checkout,'package.json'),'\n');
        const dirty=command();assert.ifError(dirty.error);assert.equal(dirty.status,1,'dirty source must not become a candidate');
    }finally{fs.rmSync(checkout,{recursive:true,force:true});}
    const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/beta-preparation.yml'),'utf8');
    const active=workflow.split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n');
    assert.match(active,/contents: read/);assert.match(active,/persist-credentials: false/);
    assert.match(active,/if: github.ref == 'refs\/heads\/main'/);
    assert.match(active,/npm ci --ignore-scripts/);assert.match(active,/node-version: 22\.23\.4/);
    assert.doesNotMatch(active,/continue-on-error/,'A failed probe must still fail the job');
    const stepGate=(content,name)=>{
        const step=content.replaceAll('\r\n','\n').split('      - name: ').find(block=>block.startsWith(name+'\n'));
        assert.ok(step,'Named native probe must exist');
        return step.split('\n').find(line=>line.trimStart().startsWith('if:'))||'';
    };
    const requiredGates=[
        ['Windows actual SEA first-run public consent and direct acquisition','candidate_build'],
        ['Select exact downloadable artifact for existing credential fixtures','candidate_build'],
        ['Windows exact SEA hosted synthetic setup health and deletion','store_candidate'],
    ];
    const verifyGates=content=>{for(const [name,prerequisite] of requiredGates){
        const gate=stepGate(content,name);
        assert.ok(gate.includes('!cancelled()')&&gate.includes("steps."+prerequisite+".outcome == 'success'")&&gate.includes("inputs.browser_mode == 'direct-download-validation'"),'Each independent step needs its own prerequisite');
        if(name.startsWith('Windows'))assert.ok(gate.includes("runner.os == 'Windows'"));
    }};
    verifyGates(active);
    verifyGates(active.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
    for(const [name,prerequisite] of requiredGates){
        const gate=stepGate(active,name);
        await assert.rejects(async()=>verifyGates(active.replace(gate,gate.replace("steps."+prerequisite+".outcome == 'success'",'true'))));
        await assert.rejects(async()=>verifyGates(active.replace(gate,gate.replace('!cancelled()','true'))));
    }
    assert.doesNotMatch(active,/contents: write|gh release|git tag|git push|actions\/cache|pull_request_target/);
    assert.equal((active.match(/uses: actions\/upload-artifact@/g)||[]).length,1);
    assert.match(active,/uses: actions\/upload-artifact@[a-f0-9]{40}(?:\s|$)/);
    const upload=active.split('      - name: Upload explicitly requested unsigned Windows test package')[1].split('      - name:')[0];
    assert.match(upload,/inputs.upload_windows_test && steps.test_package.outcome == 'success'/);assert.match(upload,/runner.os == 'Windows'/);
    assert.match(upload,/retention-days: 7/);assert.match(upload,/path: build\/windows-internal-test\//);assert.match(upload,/if-no-files-found: error/);
    assert.match(active,/upload_windows_test:[\s\S]*?default: false/);
    assert.doesNotMatch(active,/run:.*\$\{\{\s*inputs\./);
    assert.equal((active.match(/- uses:/g)||[]).length,4);
    assert.match(active,/actions\/checkout@[a-f0-9]{40}/);assert.match(active,/actions\/setup-node@[a-f0-9]{40}/);
    console.log('Beta preparation contracts PASS: dated versions, exact-byte inventory, invalid target/commit/missing-file failures, read-only manual workflow/explicit opt-in test artifact only, no release. Synthetic only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
