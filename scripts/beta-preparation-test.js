const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const {betaVersion,inventory,targets}=require('./beta-candidate');
(async()=>{
    assert.equal(betaVersion('2026.11.12-beta.1'),'2026.11.12-beta.1');
    assert.equal(betaVersion('2026.2.28-beta.25'),'2026.2.28-beta.25');
    for(const bad of ['2026.02.28-beta.1','2026.2.29-beta.1','2026.4.31-beta.1','2026.0.1-beta.1','2026.13.1-beta.1','2026.1.0-beta.1','2026.11.12','2026.11.12-beta.0','2026.11.12-beta.01','2026.11.12-beta.1;echo unsafe','2027.1.1-beta.1'])assert.throws(()=>betaVersion(bad));
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-beta-contract-'));
    try{
        fs.mkdirSync(path.join(root,'THIRD-PARTY-NOTICES'));
        fs.writeFileSync(path.join(root,'educationperfected'),'synthetic executable, not native proof');
        fs.writeFileSync(path.join(root,'THIRD-PARTY-NOTICES','NOTICE.txt'),'synthetic notice');
        const options={directory:root,target:'linux-x64',version:'2026.11.12-beta.1',sourceCommit:'a'.repeat(40),sourceVersion:'2026.0.0',expectedBrowserVersion:'synthetic-pin'};
        const first=await inventory(options),second=await inventory(options);
        assert.deepEqual(first,second,'inventory is deterministic for exact bytes');
        assert.equal(first.files.length,2);assert.equal(first.publicationAuthorized,false);assert.equal(first.status,'build-only-not-for-distribution');
        assert.equal(first.files[0].sha256,createHash('sha256').update('synthetic executable, not native proof').digest('hex'));
        assert.deepEqual(Object.keys(targets).sort(),['linux-arm64','linux-x64','macos-arm64','macos-x64','windows-x64']);
        fs.appendFileSync(path.join(root,'educationperfected'),'changed');
        assert.notEqual((await inventory(options)).files[0].sha256,first.files[0].sha256);
        await assert.rejects(inventory({...options,sourceCommit:'main'}));
        await assert.rejects(inventory({...options,target:'../foreign'}));
        fs.rmSync(path.join(root,'educationperfected'));
        await assert.rejects(inventory(options));
    }finally{fs.rmSync(root,{recursive:true,force:true});}
    // Exercise the actual CLI on an isolated clean source commit. No build,
    // browser, credentials or publication process runs in this fixture.
    const checkout=fs.mkdtempSync(path.join(os.tmpdir(),'ep-beta-cli-'));
    try{
        for(const directory of ['scripts','release'])fs.mkdirSync(path.join(checkout,directory));
        for(const file of ['scripts/beta-candidate.js','scripts/release-gate.js','release/criteria.json','package.json'])fs.copyFileSync(path.resolve(__dirname,'..',file),path.join(checkout,file));
        const env={...process.env};delete env.GITHUB_SHA;
        const git=(...args)=>execFileSync('git',args,{cwd:checkout,env,encoding:'utf8'}).trim();
        git('init','--quiet');git('add','.');
        git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Synthetic fixture');
        const commit=git('rev-parse','HEAD');
        const target=Object.keys(targets).find(key=>targets[key].platform===process.platform&&targets[key].arch===process.arch);
        assert.ok(target,'test host must be a supported native target');
        const command=(version='2026.11.12-beta.1',extra={})=>spawnSync(process.execPath,['scripts/beta-candidate.js','check',version,target],{cwd:checkout,env:{...env,...extra},encoding:'utf8'});
        const clean=command();assert.equal(clean.status,0,clean.stderr);assert.equal(JSON.parse(clean.stdout).sourceCommit,commit);
        assert.notEqual(command('2026.2.29-beta.1').status,0);
        assert.notEqual(command(undefined,{GITHUB_SHA:'b'.repeat(40)}).status,0);
        fs.appendFileSync(path.join(checkout,'package.json'),'\n');
        assert.notEqual(command().status,0,'dirty source must not become a candidate');
    }finally{fs.rmSync(checkout,{recursive:true,force:true});}
    const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/beta-preparation.yml'),'utf8');
    const active=workflow.split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n');
    assert.match(active,/contents: read/);assert.match(active,/persist-credentials: false/);
    assert.match(active,/if: github.ref == 'refs\/heads\/main'/);
    assert.match(active,/npm ci --ignore-scripts/);assert.match(active,/node-version: 22\.23\.4/);
    assert.doesNotMatch(active,/upload-artifact|contents: write|gh release|git tag|git push|actions\/cache|pull_request_target/);
    assert.doesNotMatch(active,/run:.*\$\{\{\s*inputs\./);
    assert.equal((active.match(/- uses:/g)||[]).length,2);
    assert.match(active,/actions\/checkout@[a-f0-9]{40}/);assert.match(active,/actions\/setup-node@[a-f0-9]{40}/);
    console.log('Beta preparation contracts PASS: dated versions, exact-byte inventory, invalid target/commit/missing-file failures, read-only manual workflow/no upload or publication. Synthetic only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
