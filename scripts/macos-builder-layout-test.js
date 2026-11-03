// Exercise the fixed builder's macOS branch without archive/native execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/build-development.js'),'utf8');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-macos-builder-'));
 try {
  const packaging=path.join(root,'packaging');fs.mkdirSync(path.join(packaging,'notices'),{recursive:true});fs.writeFileSync(path.join(packaging,'notices','provenance.json'),'[]');fs.writeFileSync(path.join(root,'package-lock.json'),'{"packages":{}}');
  const runtimeBytes=Buffer.from('synthetic runtime notices'),runtime={version:process.versions.node,file:'node-LICENSE',sha256:require('node:crypto').createHash('sha256').update(runtimeBytes).digest('hex')};
  fs.writeFileSync(path.join(packaging,'notices','node-LICENSE'),runtimeBytes);fs.writeFileSync(path.join(packaging,'notices','runtime.json'),JSON.stringify(runtime));
  for(const arch of ['arm64','x64']) {
   const payload=path.join(root,'chrome-mac-'+arch),contents=path.join(payload,'Google Chrome for Testing.app','Contents'),browser=path.join(contents,'MacOS','Google Chrome for Testing');
   for(const dir of ['MacOS','Frameworks','Resources'])fs.mkdirSync(path.join(contents,dir),{recursive:true});fs.writeFileSync(browser,'synthetic');fs.writeFileSync(path.join(contents,'Info.plist'),'synthetic');
   const moduleFixture={exports:{}},stop=Error('archive boundary');let archives=0;
   const load=id=>{
    if(id==='puppeteer')return {executablePath:()=>browser};
    if(id==='esbuild')return {build(){throw Error('Must not bundle');}};
    if(id==='modern-tar/fs')return {packTar:directory=>{archives++;assert.equal(directory,payload);assert.notEqual(directory,path.dirname(browser));throw stop;}};
    if(id==='./notices/runtime.json')return runtime;
    if(id==='./macos-browser-layout')return require('../packaging/macos-browser-layout');
    assert.ok(id.startsWith('node:'));return require(id);
   };
   vm.runInNewContext(source,{require:load,module:moduleFixture,__dirname:packaging,process:{argv:['node','builder'],env:{},platform:'darwin',arch,execPath:process.execPath,versions:{node:process.versions.node}},console}); // NOSONAR: fixed repository builder, synthetic files and inert execution boundary only.
   await assert.rejects(moduleFixture.exports.buildDevelopment({directory:'macos-'+arch,macosLayout:true}),error=>error===stop);assert.equal(archives,1);
   const rejectedModule={exports:{}};
   vm.runInNewContext(source,{require:load,module:rejectedModule,__dirname:packaging,process:{argv:['node','builder'],env:{},platform:'linux',arch,execPath:process.execPath,versions:{node:process.versions.node}},console}); // NOSONAR: fixed source, synthetic non-macOS host only.
   await assert.rejects(rejectedModule.exports.buildDevelopment({directory:'rejected-'+arch,macosLayout:true}),/requires native macOS/);assert.equal(archives,1);
  }
  console.log('macOS builder branch selects complete platform payload root before archive (fixed-source synthetic boundary, no native proof).');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
