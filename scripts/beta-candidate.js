// Build-only candidate preparation. Never tags, uploads, publishes or changes release gates.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {sourceState}=require('./release-gate');
const {spawnSync}=require('node:child_process');
const targets={
    'linux-x64':{platform:'linux',arch:'x64',executable:'educationperfected',builder:'build-linux.js'},
    'linux-arm64':{platform:'linux',arch:'arm64',executable:'educationperfected',builder:'build-linux.js'},
    'windows-x64':{platform:'win32',arch:'x64',executable:'educationperfected.exe',builder:'build-windows.js'},
    'macos-arm64':{platform:'darwin',arch:'arm64',executable:'educationperfected',builder:'build-macos.js'},
    'macos-x64':{platform:'darwin',arch:'x64',executable:'educationperfected',builder:'build-macos.js'},
};
function betaVersion(value){
    const match=/^(2026)\.([1-9]|1[0-2])\.([1-9]|[12][0-9]|3[01])-beta\.([1-9][0-9]{0,3})$/.exec(value||'');
    if(!match)throw Error('Expected dated V2026 beta version: 2026.M.D-beta.N');
    const [,year,month,day]=match;
    const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
    if(date.getUTCMonth()+1!==Number(month)||date.getUTCDate()!==Number(day))throw Error('Invalid beta calendar date');
    return value;
}
async function hashFile(file){
    const hash=createHash('sha256');let size=0;
    for await(const chunk of fs.createReadStream(file)){hash.update(chunk);size+=chunk.length;}
    return{size,sha256:hash.digest('hex')};
}
function noticeFiles(directory,prefix='THIRD-PARTY-NOTICES'){
    return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(entry=>{
        const relative=prefix+'/'+entry.name;
        if(entry.isSymbolicLink())throw Error('Candidate notices must not contain symlinks');
        if(entry.isDirectory())return noticeFiles(path.join(directory,entry.name),relative);
        if(!entry.isFile())throw Error('Candidate notices must be regular files');
        return[relative];
    });
}
async function inventory({directory,target,version,sourceCommit,sourceVersion,expectedBrowserVersion}){
    betaVersion(version);
    if(!Object.hasOwn(targets,target)||!(/^[a-f0-9]{40}$/).test(sourceCommit||''))throw Error('Invalid candidate target/source commit');
    const executable=targets[target].executable;
    const files=[executable,...noticeFiles(path.join(directory,'THIRD-PARTY-NOTICES'))];
    const records=[];
    for(const file of files){
        const full=path.join(directory,file),stat=fs.lstatSync(full);
        if(!stat.isFile()||stat.isSymbolicLink())throw Error('Candidate file must be regular');
        records.push({path:file,...await hashFile(full)});
    }
    return{schemaVersion:1,candidateVersion:version,sourceVersion,sourceCommit,target,expectedBrowserVersion,
        status:'build-only-not-for-distribution',publicationAuthorized:false,
        limits:['No release clearance or certification','No signing/notarization or no-Node proof','No normal saved-login or live EP verification'],files:records};
}
async function main(){
    const [command,version,target]=process.argv.slice(2);
    if(!['check','build'].includes(command)||process.argv.length!==5)throw Error('Usage: beta-candidate.js check|build 2026.M.D-beta.N target');
    betaVersion(version);
    if(!Object.hasOwn(targets,target))throw Error('Unknown candidate target');
    const expected=targets[target];
    if(process.platform!==expected.platform||process.arch!==expected.arch)throw Error('Candidate requires its native build host');
    const root=path.resolve(__dirname,'..');
    const sourceCommit=sourceState(root);
    const expectedCommit=process.env.GITHUB_SHA;
    if(expectedCommit&&sourceCommit!==expectedCommit)throw Error('Candidate source differs from workflow commit');
    // Deliberately do not mutate package/lock versions or tracked files. The
    // candidate label names this build, not an already-published npm version.
    const info={sourceCommit,sourceVersion:require('../package.json').version,candidateVersion:version,target};
    if(command==='check'){console.log(JSON.stringify(info));return;}
    const directory=path.join(root,'build',target);
    // An arbitrary pre-existing binary must never be relabelled as this commit.
    // Own the fresh build and inventory in one process, with a fixed builder.
    fs.rmSync(directory,{recursive:true,force:true});
    const result=spawnSync(process.execPath,[path.join(root,'packaging',expected.builder)],{cwd:root,stdio:'inherit'});
    if(result.error||result.status!==0)throw Error('Candidate build failed; no candidate manifest created');
    if(sourceState(root)!==sourceCommit)throw Error('Source changed during candidate build');
    const manifest=await inventory({directory,target,version,sourceCommit,sourceVersion:info.sourceVersion,expectedBrowserVersion:require('puppeteer').PUPPETEER_REVISIONS.chrome});
    fs.writeFileSync(path.join(directory,'CANDIDATE.json'),JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(path.join(directory,'SHA256SUMS'),manifest.files.map(file=>file.sha256+'  '+file.path).join('\n')+'\n');
    console.log(JSON.stringify({...info,files:manifest.files.length,status:manifest.status}));
}
module.exports={betaVersion,inventory,targets};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
