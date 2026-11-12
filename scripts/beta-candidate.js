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
function validationLabel(value){
    const match=/^(2026)\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])-validation\.([1-9]\d{0,3})$/.exec(value||'');
    if(!match)throw new Error('Expected internal validation label (not a release version): 2026.M.D-validation.N');
    const [,year,month,day]=match;
    const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
    if(date.getUTCMonth()+1!==Number(month)||date.getUTCDate()!==Number(day))throw new Error('Invalid beta calendar date');
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
        if(entry.isSymbolicLink())throw new Error('Candidate notices must not contain symlinks');
        if(entry.isDirectory())return noticeFiles(path.join(directory,entry.name),relative);
        if(!entry.isFile())throw new Error('Candidate notices must be regular files');
        return[relative];
    });
}
async function inventory({directory,target,version,sourceCommit,sourceVersion,expectedBrowserVersion}){
    validationLabel(version);
    for(const dir of [directory,path.join(directory,'THIRD-PARTY-NOTICES')]){
        const stat=fs.lstatSync(dir);
        if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Candidate roots must be real directories');
    }
    if(!Object.hasOwn(targets,target)||!(/^[a-f0-9]{40}$/).test(sourceCommit||''))throw new Error('Invalid candidate target/source commit');
    const executable=targets[target].executable;
    const files=[executable,...noticeFiles(path.join(directory,'THIRD-PARTY-NOTICES'))];
    const records=await files.reduce((previous,file)=>previous.then(async records=>{
        const full=path.join(directory,file),stat=fs.lstatSync(full);
        if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Candidate file must be regular');
        records.push({path:file,...await hashFile(full)});
        return records;
    }),Promise.resolve([]));
    return{schemaVersion:2,labelKind:'internal-validation-not-release',validationLabel:version,sourceVersion,sourceCommit,target,expectedBrowserVersion,
        status:'build-only-not-for-distribution',publicationAuthorized:false,
        limits:['No release clearance or certification','No signing/notarization or no-Node proof','No normal saved-login or live EP verification'],files:records};
}
async function main(){
    const [command,version,target]=process.argv.slice(2);
    if(!['check','build','build-downloadable'].includes(command)||process.argv.length!==5)throw new Error('Usage: beta-candidate.js check|build|build-downloadable 2026.M.D-validation.N target');
    validationLabel(version);
    if(!Object.hasOwn(targets,target))throw new Error('Unknown candidate target');
    const expected=targets[target];
    if(process.platform!==expected.platform||process.arch!==expected.arch)throw new Error('Candidate requires its native build host');
    const root=path.resolve(__dirname,'..');
    const sourceCommit=sourceState(root);
    const expectedCommit=process.env.GITHUB_SHA;
    if(expectedCommit&&sourceCommit!==expectedCommit)throw new Error('Candidate source differs from workflow commit');
    // Deliberately do not mutate package/lock versions or tracked files. The
    // candidate label names this build, not an already-published npm version.
    const info={sourceCommit,sourceVersion:require('../package.json').version,validationLabel:version,target};
    if(command==='check'){console.log(JSON.stringify(info));return;}
    const directDownload=command==='build-downloadable';
    const directory=path.join(root,'build',target+(directDownload?'-downloadable':''));
    // An arbitrary pre-existing binary must never be relabelled as this commit.
    // Own the fresh build and inventory in one process, with a fixed builder.
    fs.rmSync(directory,{recursive:true,force:true});
    const result=spawnSync(process.execPath,[path.join(root,'packaging',directDownload?'build-downloadable.js':expected.builder)],{cwd:root,stdio:'inherit'});
    if(result.error||result.status!==0)throw new Error('Candidate build failed; no candidate manifest created');
    if(sourceState(root)!==sourceCommit)throw new Error('Source changed during candidate build');
    const manifest=await inventory({directory,target,version,sourceCommit,sourceVersion:info.sourceVersion,expectedBrowserVersion:require('puppeteer').PUPPETEER_REVISIONS.chrome});
    if(directDownload){
        const built=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
        const sea=JSON.parse(fs.readFileSync(path.join(directory,'sea.json'),'utf8'));
        if(built.browserVersion!==manifest.expectedBrowserVersion)throw new Error('Direct-download pin differs from expected browser version');
        if(built.browserMode!=='direct-google-download'||Object.hasOwn(sea.assets||{},'browser')||Object.keys(sea.assets||{}).sort((a,b)=>a.localeCompare(b,'en')).join(',')!=='manifest,native')throw new Error('Direct-download candidate has unexpected browser assets');
        manifest.distributionMode='direct-google-download';manifest.browserBundled=false;
    }
    fs.writeFileSync(path.join(directory,'CANDIDATE.json'),JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(path.join(directory,'SHA256SUMS'),manifest.files.map(file=>file.sha256+'  '+file.path).join('\n')+'\n');
    console.log(JSON.stringify(manifest,null,2));
    console.log(manifest.files.map(file=>file.sha256+'  '+file.path).join('\n'));
}
module.exports={validationLabel,inventory,targets,hashFile};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
