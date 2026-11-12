// Hosted native fixture bridge. Copy only the just-inventoried no-browser SEA.
// Existing fixture source and the original candidate remain unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hashFile}=require('./beta-candidate');
function regular(file){const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Expected regular file');}
function directory(file){const stat=fs.lstatSync(file);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'Expected real directory');}
async function verify(directoryPath,filename,target,sourceCommit){
 directory(directoryPath);regular(path.join(directoryPath,'CANDIDATE.json'));
 const candidate=JSON.parse(fs.readFileSync(path.join(directoryPath,'CANDIDATE.json'),'utf8'));
 assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);assert.equal(candidate.sourceCommit,sourceCommit);assert.equal(candidate.target,target);
 assert.equal(candidate.distributionMode,'direct-google-download');assert.equal(candidate.browserBundled,false);
 const source=path.join(directoryPath,filename);regular(source);
 const matches=candidate.files.filter(file=>file.path===filename);assert.equal(matches.length,1);
 const expected=matches[0],actual=await hashFile(source);assert.equal(actual.sha256,expected.sha256);assert.equal(actual.size,expected.size);
 return {source,expected};
}
async function stage(){
 assert.equal(process.env.GITHUB_ACTIONS,'true','GITHUB_ACTIONS host guard');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','RUNNER_ENVIRONMENT host guard');
 const base=require('./packaged-fixture-target').packagedFixtureTarget();
 const target=path.basename(path.dirname(base.executable)),sourceDirectory=path.dirname(base.executable)+'-downloadable';
 const {source,expected}=await verify(sourceDirectory,base.filename,target,process.env.GITHUB_SHA);
 directory(path.dirname(sourceDirectory));
 fs.mkdirSync(path.dirname(base.executable),{recursive:true});directory(path.dirname(base.executable));
 fs.copyFileSync(source,base.executable,fs.constants.COPYFILE_EXCL);fs.chmodSync(base.executable,0o700);
 assert.equal((await hashFile(base.executable)).sha256,expected.sha256);
 console.log('Existing native store fixture receives exact inventoried direct-download SEA bytes. This path alias is not additional build or no-Node evidence.');
}
module.exports={stage,verify};
if(require.main===module)stage().catch(error=>{console.error(error);process.exitCode=1;});
