const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {browserIdentity,emitBrowserIdentity}=require('../lib/test-browser-identity');
const {readVerifiedArchive,verifyArchive,parseIdentityReceipt,assertOwnedBrowser,verifyLegIdentity,runStagedPanel}=require('./startup-browser-identity');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-identity-inert-'));
 try {
  const bytes=Buffer.from('fixed inert archive'),archive=path.join(root,'browser.tar.gz');fs.writeFileSync(archive,bytes);
  const manifest={length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),browserVersion:'156.0.8078.47',executable:'private-path-do-not-print',unknown:'private-env-do-not-print'};
  const expected=browserIdentity(manifest);let line;emitBrowserIdentity(manifest,text=>{line=text;});assert.ok(!line.includes('private'));assert.deepEqual(parseIdentityReceipt(line),expected);
  assert.deepEqual(await verifyArchive(archive,manifest),expected);
  const snapshot=await readVerifiedArchive(archive,manifest);fs.writeFileSync(archive,Buffer.alloc(bytes.length));assert.deepEqual(snapshot.bytes,bytes,'Source extraction consumes verified snapshot, not reopened replacement');fs.writeFileSync(archive,bytes);
  await assert.rejects(verifyArchive(archive,{...manifest,length:1}));
  fs.writeFileSync(archive,Buffer.alloc(bytes.length));await assert.rejects(verifyArchive(archive,manifest));
  fs.mkdirSync(path.join(root,'host-cache'));fs.writeFileSync(path.join(root,'host-cache','chrome.exe'),'inert');
  await assert.rejects(verifyArchive(path.join(root,'missing-pinned-archive'),manifest),error=>error.message==='Diagnostic archive unavailable' && !error.message.includes(root));
  if(process.platform!=='win32') {
   fs.writeFileSync(archive,bytes);const alias=path.join(root,'archive-alias');fs.symlinkSync(archive,alias);
   await assert.rejects(verifyArchive(alias,manifest));
   fs.symlinkSync(path.join(root,'host-cache','chrome.exe'),path.join(root,'escape'));assert.throws(()=>assertOwnedBrowser(root,path.join(root,'escape')));
  } else console.log('SKIP: native Windows symlink fixture requires privilege, no symlink proof.');
  for(const bad of [undefined,{...manifest,browserVersion:'private-env'},{...manifest,sha256:'private-path'}])assert.throws(()=>browserIdentity(bad));
  for(const text of ['',line+'\n'+line,line.replace('"hashVerified":true','"hashVerified":false'),line.replace('"extractionOwned":true','"extractionOwned":false')])assert.throws(()=>parseIdentityReceipt(text));
  const dir=path.join(root,'educationperfected-owned');fs.mkdirSync(dir);const exe=path.join(dir,'chrome.exe');fs.writeFileSync(exe,'inert');assert.equal(assertOwnedBrowser(root,exe),true);
  assert.throws(()=>assertOwnedBrowser(root,path.join(root,'host-cache','chrome.exe')));
  const leg={receipt:expected,observedVersion:'Chrome/'+expected.browserVersion,owned:true,ready:true,cleanupCertain:true};verifyLegIdentity({...leg,expected});
  for(const broken of [{receipt:undefined},{receipt:{...expected,sha256:'0'.repeat(64)}},{observedVersion:'Chrome/1.2.3.4'},{owned:false}])assert.throws(()=>verifyLegIdentity({...leg,...broken,expected}));
  for(const broken of [{receipt:undefined},{cleanupCertain:false},{ready:false},{owned:false}]) {
   let calls=0;const result=await runStagedPanel(async()=>({...leg,...broken}),async()=>{calls++;return leg;},expected);assert.equal(calls,0);assert.deepEqual(result,{outcome:'uncertainty',leg:'source',seaAttempted:false});
  }
  const order=[];assert.deepEqual(await runStagedPanel(async()=>{order.push('source');return leg;},async()=>{order.push('sea');return leg;},expected),{outcome:'not-reproduced-in-one-instrumented-sample',seaAttempted:true});assert.deepEqual(order,['source','sea']);
  let calls=0;await runStagedPanel(async()=>{throw Error('fixed failure');},async()=>{calls++;},expected);assert.equal(calls,0);
  assert.deepEqual(await runStagedPanel(async()=>leg,async()=>({...leg,receipt:null}),expected),{outcome:'uncertainty',leg:'sea',seaAttempted:true});
  console.log('Inert public-only identity, tampered/length/missing archive no fallback, missing receipt/mismatch/owned browser, staged source-first cleanup uncertainty stop contracts passed. No process/native/Windows proof.');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
