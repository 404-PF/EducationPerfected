const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync, spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
(async () => {
 if(process.argv.length>2)throw Error('No executable override arguments accepted');
 const executable=path.resolve(__dirname,'../build/linux-x64/educationperfected');
 let child,closed;
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
  for (const signal of ['SIGTERM','SIGINT','SIGHUP']) {
  child=spawn(executable,[],{env:{...process.env,TMPDIR:extract},stdio:'ignore',detached:process.platform!=='win32'});
  closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  const deadline=Date.now()+5000;
  while(!fs.readdirSync(extract).some(name=>name.startsWith('educationperfected-') && fs.existsSync(path.join(extract,name,'keyring.node')))) {
   if(child.exitCode!==null || child.signalCode!==null)throw Error('Extraction child exited before checkpoint: '+child.exitCode+'/'+child.signalCode);
   if(Date.now()>deadline)throw Error('Extraction checkpoint timed out');
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  child.kill(signal);const interrupted=await boundedClose(closed,10000,'Extraction interrupt did not exit');assert.equal(interrupted.code,signal==='SIGINT'?130:signal==='SIGHUP'?129:143);assert.equal(interrupted.signal,null);
  assert.deepEqual(fs.readdirSync(extract),[],'Interrupted extraction must be removed');
  console.log('Extraction '+signal+' handled with owned temp cleanup.');
  }
 } finally {try {await stopChild(child,closed);} finally {fs.rmSync(root,{recursive:true,force:true});}}
})().catch(error=>{console.error(error);process.exitCode=1;});
