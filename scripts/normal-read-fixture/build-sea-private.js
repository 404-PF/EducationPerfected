// Owned private modified-fixture build ONLY. Never launches generated executable.
const esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const target=require('./target').target(process.platform,process.arch);
if(process.argv.length!==2||process.platform!=='linux'||process.version!=='v22.23.4')throw Error('Private builder host refused');
// esbuild exports are getters, so use an onLoad plugin through a private copy of
// the existing builder source rather than patching the installed API.
let source=fs.readFileSync(path.join(root,'packaging/build-development.js'),'utf8');
const needle="define: { 'process.env.NODE_ENV': '\"production\"' }";
if(source.split(needle).length!==2)throw Error('Builder seam changed');
source=source.replace(needle,needle+", metafile:true, plugins:[{name:'private-fixture-endpoint',setup(build){build.onLoad({filter:/[/\\\\]lib[/\\\\]login-endpoint\\.js$/},args=>{if(args.path!==path.resolve(__dirname,'../lib/login-endpoint.js'))throw Error('Wrong endpoint');return {contents:fs.readFileSync(path.resolve(__dirname,'../scripts/normal-read-fixture/endpoint.js'),'utf8'),loader:'js',resolveDir:path.dirname(args.path)};});}}]");
const Module=require('node:module'),owned=new Module(path.join(root,'packaging/private-build-in-memory.js'),module);owned.filename=path.join(root,'packaging/private-build-in-memory.js');owned.paths=module.paths;owned._compile(source,owned.filename);
owned.exports.buildDevelopment({directory:target.directory,browserDirectory:target.browserDirectory,browserFiles:['chrome_crashpad_handler','icudtl.dat'],nativePackage:target.nativePackage,executable:'educationperfected'}).then(()=>{
 const out=path.join(root,'build',target.directory),file=path.join(out,'educationperfected');
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(out,'PRIVATE-FIXTURE.json'),JSON.stringify({kind:'MODIFIED-VALIDATION-ONLY-NOT-RELEASE',arch:target.arch,sourceBase:'7e3e3075773a4e3ca903c88be26cc1c5267aaa0c',patch:'663d0e44fa9ff13b33f5872c23727f7a8a352a5294fc35f9a608de933b6be858',node:process.version,sha256:hash(fs.readFileSync(file)),mainSha256:hash(fs.readFileSync(path.join(out,'main.cjs'))),nativeSha256:hash(fs.readFileSync(require.resolve(target.nativePackage))),browser:JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'))},null,2));
 console.log('Private fixture generated, NOT launched.');
}).finally(()=>esbuild.stop()).catch(()=>{console.error('Private fixture generation failed.');process.exitCode=1;});
