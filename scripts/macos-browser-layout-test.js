const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {macosBrowserLayout}=require('../packaging/macos-browser-layout');
const {macosExtractedExecutable}=require('../packaging/macos-extracted-executable');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ep-macos-layout-test-'));
try {
 for(const arch of ['arm64','x64']) {
  const root=path.join(temporary,'chrome-mac-'+arch),contents=path.join(root,'Google Chrome for Testing.app','Contents'),browser=path.join(contents,'MacOS','Google Chrome for Testing');
  for(const dir of ['MacOS','Frameworks','Resources'])fs.mkdirSync(path.join(contents,dir),{recursive:true});
  fs.writeFileSync(browser,'synthetic');fs.chmodSync(browser,0o700);fs.writeFileSync(path.join(contents,'Info.plist'),'synthetic');
  assert.deepEqual(macosBrowserLayout(browser,arch),{archiveRoot:root,executable:path.join('Google Chrome for Testing.app','Contents','MacOS','Google Chrome for Testing')});
  const relative=path.relative(root,browser);
  const outside=path.join(temporary,'outside-'+arch);fs.mkdirSync(outside);
  assert.equal(macosExtractedExecutable(root,relative),fs.realpathSync(browser));
  const canonical=path.join(contents,'MacOS','canonical-browser');fs.renameSync(browser,canonical);fs.symlinkSync('canonical-browser',browser);
  assert.equal(macosExtractedExecutable(root,relative),fs.realpathSync(canonical));
  fs.unlinkSync(browser);fs.renameSync(canonical,browser);
  for(const bad of ['../outside','/absolute',relative+'/../other'])assert.throws(()=>macosExtractedExecutable(root,bad),/manifest/);
  fs.chmodSync(browser,0o600);assert.throws(()=>macosExtractedExecutable(root,relative),/executable file/);fs.chmodSync(browser,0o700);
  fs.symlinkSync('../Resources',path.join(contents,'Frameworks','internal'),'dir');macosBrowserLayout(browser,arch);
  fs.symlinkSync('/tmp',path.join(contents,'Resources','absolute'),'dir');assert.throws(()=>macosBrowserLayout(browser,arch),/Absolute/);fs.unlinkSync(path.join(contents,'Resources','absolute'));
  fs.symlinkSync('../../../../outside-'+arch,path.join(contents,'Resources','escape'),'dir');assert.throws(()=>macosBrowserLayout(browser,arch),/leaves archive root|escapes/);fs.unlinkSync(path.join(contents,'Resources','escape'));
  fs.symlinkSync('missing',path.join(contents,'Resources','dangling'));assert.throws(()=>macosBrowserLayout(browser,arch),{code:'ENOENT'});fs.unlinkSync(path.join(contents,'Resources','dangling'));
  fs.symlinkSync('cycle',path.join(contents,'Resources','cycle'));assert.throws(()=>macosBrowserLayout(browser,arch),{code:'ELOOP'});fs.unlinkSync(path.join(contents,'Resources','cycle'));
  const reentry='../../../../chrome-mac-'+arch+'/Google Chrome for Testing.app/Contents/Resources';
  fs.symlinkSync(reentry,path.join(contents,'Resources','reentry'),'dir');
  assert.equal(fs.realpathSync(path.join(contents,'Resources','reentry')),fs.realpathSync(path.join(contents,'Resources')));
  assert.throws(()=>macosBrowserLayout(browser,arch),/leaves archive root/);fs.unlinkSync(path.join(contents,'Resources','reentry'));
  assert.throws(()=>macosBrowserLayout(browser,arch==='arm64'?'x64':'arm64'),/complete Chrome/);
  fs.rmSync(path.join(contents,'Frameworks'),{recursive:true});assert.throws(()=>macosBrowserLayout(browser,arch),{code:'ENOENT'});
  fs.symlinkSync(outside,path.join(contents,'Frameworks'),'dir');assert.throws(()=>macosBrowserLayout(browser,arch),/escapes/);
  fs.unlinkSync(path.join(contents,'Frameworks'));fs.mkdirSync(path.join(contents,'Frameworks'));
  fs.unlinkSync(browser);fs.symlinkSync(path.join(outside,'external-browser'),browser);fs.writeFileSync(path.join(outside,'external-browser'),'synthetic');
  assert.throws(()=>macosExtractedExecutable(root,relative),/escapes/);fs.unlinkSync(browser);
  fs.mkdirSync(browser);assert.throws(()=>macosBrowserLayout(browser,arch),/file type/);
 }
 assert.throws(()=>macosBrowserLayout('/not-used','ia32'),/arm64 or x64/);
 assert.throws(()=>macosBrowserLayout('relative/path','arm64'),/absolute/);
 console.log('macOS layout preparation: full app payload root, relative executable, supported architectures, required resources and symlink containment passed on synthetic Linux files; not native macOS proof.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
