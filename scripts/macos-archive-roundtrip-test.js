// Real pinned tar/gzip roundtrip over synthetic app files, not native macOS proof.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pipeline}=require('node:stream/promises'),{createGzip,createGunzip}=require('node:zlib');
const {packTar,unpackTar}=require('modern-tar/fs');
const {macosBrowserLayout}=require('../packaging/macos-browser-layout');
const {macosExtractedExecutable}=require('../packaging/macos-extracted-executable');
(async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ep-macos-archive-'));
 try {
  for(const arch of ['arm64','x64']) {
   const root=path.join(temporary,'chrome-mac-'+arch),contents=path.join(root,'Google Chrome for Testing.app','Contents'),browser=path.join(contents,'MacOS','Google Chrome for Testing');
   const framework=path.join(contents,'Frameworks','Synthetic.framework'),resources=path.join(framework,'Versions','A','Resources');
   for(const dir of [path.dirname(browser),resources,path.join(contents,'Resources')])fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(browser,'synthetic browser, never executed');fs.chmodSync(browser,0o700);fs.writeFileSync(path.join(contents,'Info.plist'),'synthetic plist');fs.writeFileSync(path.join(resources,'fixture.txt'),'full framework resource');fs.chmodSync(path.join(resources,'fixture.txt'),0o600);fs.chmodSync(resources,0o700);
   fs.symlinkSync('A',path.join(framework,'Versions','Current'));fs.symlinkSync('Versions/Current/Resources',path.join(framework,'Resources'));
   const layout=macosBrowserLayout(browser,arch),archive=path.join(temporary,arch+'.tar.gz'),extracted=path.join(temporary,'relocated-'+arch);fs.mkdirSync(extracted);
   await pipeline(packTar(layout.archiveRoot),createGzip(),fs.createWriteStream(archive));
   await pipeline(fs.createReadStream(archive),createGunzip(),unpackTar(extracted));
   const executable=macosExtractedExecutable(extracted,layout.executable);
   assert.equal(fs.readFileSync(executable,'utf8'),'synthetic browser, never executed');assert.equal(fs.statSync(executable).mode&0o777,0o700);
   const relocatedFramework=path.join(extracted,'Google Chrome for Testing.app','Contents','Frameworks','Synthetic.framework');
   assert.equal(fs.readlinkSync(path.join(relocatedFramework,'Versions','Current')),'A');assert.equal(fs.readlinkSync(path.join(relocatedFramework,'Resources')),'Versions/Current/Resources');
   assert.equal(fs.readFileSync(path.join(relocatedFramework,'Resources','fixture.txt'),'utf8'),'full framework resource');
   assert.equal(fs.statSync(path.join(relocatedFramework,'Resources','fixture.txt')).mode&0o777,0o600);assert.equal(fs.statSync(path.join(relocatedFramework,'Resources')).mode&0o777,0o700);
   assert.equal(fs.readFileSync(path.join(extracted,'Google Chrome for Testing.app','Contents','Info.plist'),'utf8'),'synthetic plist');
  }
  console.log('Pinned tar/gzip full synthetic macOS app layout, resources, internal framework symlinks, executable mode and relocated path roundtrip passed on Linux; no native/signature proof.');
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
