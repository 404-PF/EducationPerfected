const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync, spawn} = require('node:child_process');
const assert = require('node:assert/strict');
(async () => {
 const executable=path.resolve(process.argv[2]||'build/linux-x64/educationperfected');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-package-integrity-'));
 try {
  const copy=path.join(root,'corrupt'), extract=path.join(root,'temp'); fs.mkdirSync(extract);
  fs.copyFileSync(executable,copy);fs.chmodSync(copy,0o700);
  const fd=fs.openSync(copy,'r+'),size=fs.fstatSync(fd).size, byte=Buffer.alloc(1);fs.readSync(fd,byte,0,1,size-17);byte[0]^=1;fs.writeSync(fd,byte,0,1,size-17);fs.closeSync(fd);
  const result=spawnSync(copy,[],{env:{...process.env,TMPDIR:extract},encoding:'utf8',timeout:20000});
  assert.ifError(result.error);assert.equal(result.status,1);assert.ok(result.stderr.includes('could not start'));
  assert.deepEqual(fs.readdirSync(extract),[],'Corruption path must clean extracted native asset');
  console.log('Corrupted browser payload rejected before launch, extraction cleaned.');
  // Interrupt during hash/extraction, before handing signal ownership to browser startup.
  const child=spawn(executable,[],{env:{...process.env,TMPDIR:extract},stdio:'ignore'});
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  const deadline=Date.now()+5000;
  while(!fs.readdirSync(extract).some(name=>name.startsWith('educationperfected-'))) {
   if(Date.now()>deadline)throw Error('Extraction checkpoint timed out');
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  child.kill('SIGTERM');const interrupted=await closed;assert.equal(interrupted.code,143);assert.equal(interrupted.signal,null);
  assert.deepEqual(fs.readdirSync(extract),[],'Interrupted extraction must be removed');
  console.log('Extraction SIGTERM handled with owned temp cleanup.');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
