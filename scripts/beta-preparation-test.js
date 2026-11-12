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
        assert.deepEqual(Object.keys(targets).sort((a,b)=>a.localeCompare(b,'en')),['linux-arm64','linux-x64','macos-arm64','macos-x64','windows-x64']);
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
        const env={...process.env};delete env.GITHUB_SHA;
        const gitPath=process.platform==='win32'?'C:\\Program Files\\Git\\cmd\\git.exe':'/usr/bin/git';
        const git=(...args)=>execFileSync(gitPath,args,{cwd:checkout,env,encoding:'utf8'}).trim();
        git('init','--quiet');git('add','scripts','release','packaging','package.json');
        git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Synthetic fixture');
        const commit=git('rev-parse','HEAD');
        const command=(version='2026.11.12-beta.1',extra={})=>spawnSync(process.execPath,['scripts/beta-candidate.js','check',version,target],{cwd:checkout,env:{...env,...extra},encoding:'utf8'});
        const clean=command();assert.equal(clean.status,0,clean.stderr);assert.equal(JSON.parse(clean.stdout).sourceCommit,commit);
        assert.notEqual(command('2026.2.29-beta.1').status,0);
        assert.notEqual(command(undefined,{GITHUB_SHA:'b'.repeat(40)}).status,0);
        const build=extra=>spawnSync(process.execPath,['scripts/beta-candidate.js','build','2026.11.12-beta.1',target],{cwd:checkout,env:{...env,...extra},encoding:'utf8'});
        const directory=path.join(checkout,'build',target);
        fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'stale'),'old bytes');
        const built=build({});assert.equal(built.status,0,built.stderr);
        assert.equal(fs.existsSync(path.join(directory,'stale')),false);
        const manifest=JSON.parse(fs.readFileSync(path.join(directory,'CANDIDATE.json'),'utf8'));assert.equal(manifest.sourceCommit,commit);
        assert.notEqual(build({EP_FIXTURE_FAIL:'1'}).status,0);
        assert.equal(fs.existsSync(path.join(directory,'CANDIDATE.json')),false,'failed builds cannot retain a candidate manifest');
        assert.notEqual(build({EP_FIXTURE_DIRTY:'1'}).status,0);
        assert.equal(fs.existsSync(path.join(directory,'CANDIDATE.json')),false,'source drift cannot be inventoried');
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
