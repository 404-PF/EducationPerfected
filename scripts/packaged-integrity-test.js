const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {spawnSync, spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
(async () => {
 if(process.argv.length>2)throw Error('No executable override arguments accepted');
 const executable=path.resolve(__dirname,'../build/linux-'+process.arch+'/educationperfected');
 let child,closed;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-package-integrity-'));
 try {
  const copy=path.join(root,'corrupt'), extract=path.join(root,'temp'); fs.mkdirSync(extract);
  fs.copyFileSync(executable,copy);fs.chmodSync(copy,0o700);
  // Find the generated archive inside the SEA asset, never by an EOF offset.
  const archive=path.resolve(__dirname,'../build/linux-'+process.arch+'/browser.tar.gz');
  const archiveFd=fs.openSync(archive,'r'),prefix=Buffer.alloc(64);
  let archiveSize;
  try {archiveSize=fs.fstatSync(archiveFd).size;assert.equal(fs.readSync(archiveFd,prefix,0,prefix.length,0),prefix.length);}
  finally {fs.closeSync(archiveFd);}
  const matches=[];let carry=Buffer.alloc(0),position=0;
  for await(const chunk of fs.createReadStream(copy,{highWaterMark:65536})) {
   const bytes=Buffer.concat([carry,chunk]);let found=bytes.indexOf(prefix);
   while(found!==-1){matches.push(position-carry.length+found);found=bytes.indexOf(prefix,found+1);}
   position+=chunk.length;carry=bytes.subarray(Math.max(0,bytes.length-prefix.length+1));
  }
  assert.equal(matches.length,1,'Expected one exact browser archive asset prefix');
  const payloadOffset=matches[0];assert.ok(payloadOffset+archiveSize<=fs.statSync(copy).size);
  const hash=require('node:crypto').createHash('sha256');
  for await(const chunk of fs.createReadStream(copy,{start:payloadOffset,end:payloadOffset+archiveSize-1}))hash.update(chunk);
  const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../build/linux-'+process.arch+'/manifest.json'),'utf8'));
  assert.equal(hash.digest('hex'),manifest.sha256,'Corruption fixture must target the original browser asset');
  const fd=fs.openSync(copy,'r+'),byte=Buffer.alloc(1),corruptionOffset=payloadOffset+archiveSize-1;
  try {assert.equal(fs.readSync(fd,byte,0,1,corruptionOffset),1);byte[0]^=1;fs.writeSync(fd,byte,0,1,corruptionOffset);}
  finally {fs.closeSync(fd);}
  const result=spawnSync(copy,[],{env:{...process.env,TMPDIR:extract},encoding:'utf8',timeout:20000});
  assert.ifError(result.error);assert.equal(result.status,1);assert.ok(result.stderr.includes('EP_BROWSER_CHECKSUM'),'Must fail at the checksum gate, not native loading, decompression or browser startup');
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
