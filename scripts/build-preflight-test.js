// Fixed-source builder with synthetic dependencies; no browser/archive/native build.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/build-development.js'),'utf8');
(async()=>{
 for(const scenario of ['complete','required-missing','optional-missing','missing-notice','runtime-version','runtime-corrupt']) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-preflight-test-'));
  try {
   const packaging=path.join(root,'packaging'),browserDir=path.join(root,'chrome-synthetic'),out=path.join(root,'build','synthetic'),notices=path.join(out,'THIRD-PARTY-NOTICES');
   fs.mkdirSync(packaging,{recursive:true});fs.mkdirSync(browserDir);fs.writeFileSync(path.join(browserDir,'chrome'),'synthetic');
   fs.mkdirSync(path.join(packaging,'notices'));fs.writeFileSync(path.join(packaging,'notices','provenance.json'),'[]');
   fs.mkdirSync(notices,{recursive:true});fs.writeFileSync(path.join(notices,'stale-LICENSE'),'must disappear');
   const relative='node_modules/synthetic-dependency',dependency=path.join(root,relative);
   const record={version:'1.0.0',...(scenario==='optional-missing'?{optional:true}:{})};
   fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({packages:{'':{},[relative]:record,'node_modules/build-only':{dev:true}}}));
   if(!['required-missing','optional-missing'].includes(scenario)) {
    fs.mkdirSync(dependency,{recursive:true});fs.writeFileSync(path.join(dependency,'package.json'),JSON.stringify({name:'synthetic-dependency',version:'1.0.0',license:'MIT'}));
    if(scenario!=='missing-notice')fs.writeFileSync(path.join(dependency,'LICENSE'),'synthetic notice bytes');
   }
   const runtimeBytes=Buffer.from('synthetic runtime notices');
   const runtime={name:'Node.js',version:process.versions.node,file:'node-LICENSE',source:'https://example.invalid/runtime-license',sha256:require('node:crypto').createHash('sha256').update(runtimeBytes).digest('hex')};
   fs.writeFileSync(path.join(packaging,'notices','node-LICENSE'),scenario==='runtime-corrupt'?'corrupted':runtimeBytes);
   fs.writeFileSync(path.join(packaging,'notices','runtime.json'),JSON.stringify(runtime));
   let archived=0,bundled=0,spawned=0;const warnings=[];
   const stop=Error('synthetic archive boundary');const moduleFixture={exports:{}};
   const load=id=>{
    if(id==='node:child_process')return {execFileSync(){spawned++;throw Error('Native execution forbidden');}};
    if(id==='esbuild')return {build(){bundled++;throw Error('Bundle execution forbidden');}};
    if(id==='puppeteer')return {executablePath:()=>path.join(browserDir,'chrome')};
    if(id==='./notices/provenance.json')return [];
    if(id==='./notices/runtime.json')return runtime;
    if(id==='modern-tar/fs')return {packTar(directory){
     archived++;assert.equal(directory,browserDir);
     assert.deepEqual(fs.readFileSync(path.join(notices,'node-LICENSE')),runtimeBytes);
     assert.deepEqual(JSON.parse(fs.readFileSync(path.join(notices,'NODE-RUNTIME-PROVENANCE.json'),'utf8')),runtime);
     assert.equal(fs.existsSync(path.join(notices,'stale-LICENSE')),false);
     const inventory=JSON.parse(fs.readFileSync(path.join(notices,'DEPENDENCY-INVENTORY.json'),'utf8'));
     assert.equal(inventory.length,scenario==='optional-missing'?0:1);
     if(inventory.length)assert.equal(inventory[0].status,scenario==='missing-notice'?'MISSING-NOTICE-REQUIRES-REVIEW':'files-copied-not-legally-reviewed');
     assert.ok(fs.readFileSync(path.join(notices,'NOT-FOR-DISTRIBUTION.txt'),'utf8').includes('Development artifact only'));
     if(scenario==='complete')assert.equal(fs.readFileSync(path.join(notices,'node_modules-synthetic-dependency-LICENSE'),'utf8'),'synthetic notice bytes');
     throw stop;
    }};
    assert.ok(id.startsWith('node:'),'Unexpected dependency');return require(id);
   };
   // Execute only this fixed sibling builder with inert native/bundle/archive dependencies.
   vm.runInNewContext(source,{require:load,module:moduleFixture,__dirname:packaging,process:{argv:['node','fixed-builder'],env:{},execPath:process.execPath,versions:{node:scenario==='runtime-version'?'0.0.0':process.versions.node}},console:{warn:line=>warnings.push(line),log(){}}}); // NOSONAR: fixed repository source and synthetic fixtures only; no external code or input.
   const target={directory:'synthetic',browserDirectory:'chrome-synthetic',browserFiles:[],nativePackage:'never-loaded',executable:'never-built'};
   await assert.rejects(moduleFixture.exports.buildDevelopment(target),error=>scenario==='required-missing'?/Missing required production dependency/.test(error.message):scenario==='runtime-version'?/Node runtime notice version mismatch/.test(error.message):scenario==='runtime-corrupt'?/Node runtime notice checksum mismatch/.test(error.message):error===stop);
   assert.equal(archived,['required-missing','runtime-version','runtime-corrupt'].includes(scenario)?0:1);assert.equal(bundled,0);assert.equal(spawned,0);
   assert.equal(warnings.length,scenario==='missing-notice'?1:0);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
 }
 for(const scenario of ['arguments','custom-browser','missing-browser','wrong-directory','missing-browser-file']) {
  let archived=0,bundled=0,spawned=0,noticesTouched=0;
  const moduleFixture={exports:{}};
  const load=id=>{
   if(id==='node:fs')return {
    mkdirSync(){},existsSync:file=>scenario!=='missing-browser' && !(scenario==='missing-browser-file' && file.endsWith('required.dat')),
    rmSync(){noticesTouched++;throw Error('Must not inventory rejected browser');},
   };
   if(id==='node:child_process')return {execFileSync(){spawned++;throw Error('Must not execute native build');}};
   if(id==='esbuild')return {build(){bundled++;throw Error('Must not bundle');}};
   if(id==='puppeteer')return {executablePath:()=>'/synthetic/'+(scenario==='wrong-directory'?'unexpected':'chrome-synthetic')+'/chrome'};
   if(id==='modern-tar/fs')return {packTar(){archived++;throw Error('Must not archive');}};
   assert.ok(id.startsWith('node:'));return require(id);
  };
  vm.runInNewContext(source,{require:load,module:moduleFixture,__dirname:'/synthetic/packaging',process:{argv:scenario==='arguments'?['node','builder','unapproved-output']:['node','builder'],env:scenario==='custom-browser'?{PUPPETEER_EXECUTABLE_PATH:'/unapproved/browser'}:{},execPath:process.execPath},console}); // NOSONAR: fixed sibling source, inert dependencies and synthetic inputs only.
  const target={directory:'synthetic',browserDirectory:'chrome-synthetic',browserFiles:['required.dat'],nativePackage:'never-loaded',executable:'never-built'};
  const expected=scenario==='arguments'?/no output path arguments/:scenario==='custom-browser'?/Custom browser paths/:scenario==='missing-browser'?/Chrome for Testing is not installed/:/Expected a Chrome for Testing payload directory/;
  await assert.rejects(moduleFixture.exports.buildDevelopment(target),expected);
  assert.equal(archived,0);assert.equal(bundled,0);assert.equal(spawned,0);assert.equal(noticesTouched,0);
 }
 console.log('Builder preflight: notice inventory, dependency distinction and browser/output guards passed before archive/bundle/native execution (synthetic only).');
})().catch(error=>{console.error(error);process.exitCode=1;});
