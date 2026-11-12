// Local fixture only. Uses the fixed native development executable.
const assert = require('node:assert/strict');
const { createServer } = require('./mock-ep');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
const { finishFixtureCleanup } = require('./fixture-cleanup-errors');
const { connectAfterLoginReady, selectLoginPage, disconnectController } = require('./packaged-fixture-page');
async function runPackagedFixture({directDownload=false}={}) {
 if (process.argv.length > 2) throw Error('No executable override arguments accepted');
 const base=require('./packaged-fixture-target').packagedFixtureTarget();
 const filename=base.filename,executable=directDownload?path.join(path.dirname(base.executable)+'-downloadable',filename):base.executable;
 let acquiredPath;
 const server = createServer();
 let isolated, child, closed, browser, spawnError, serverError, primaryError;
 let text='';
 function reportResidue() {
  if (!isolated) return [];
  const residue = fs.readdirSync(isolated).filter(name=>name.startsWith('educationperfected-'));
  if (residue.length) {
   // Synthetic owned-root metadata only: never print file contents or host paths.
   const inventory = [];
   const inspect = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
     if (inventory.length >= 20) return;
     const name = path.join(relative, entry.name);
     inventory.push({name, type:entry.isSymbolicLink()?'symlink':entry.isDirectory()?'directory':'file'});
     if (entry.isDirectory() && !entry.isSymbolicLink()) inspect(path.join(directory,entry.name),name);
    }
   };
   for (const directory of residue) {
    const root = path.join(isolated,directory), stat = fs.lstatSync(root);
    if (stat.isDirectory() && !stat.isSymbolicLink()) inspect(root,'owned-extraction');
    else if (inventory.length < 20) inventory.push({name:'owned-extraction',type:stat.isSymbolicLink()?'symlink':'file'});
   }
   console.error('Synthetic owned extraction residue: '+JSON.stringify(inventory));
  }
  return residue;
 }

 try {
 await new Promise((resolve,reject) => {
  const onError = error => { server.removeListener('listening',onListening); reject(error); };
  const onListening = () => { server.removeListener('error',onError); resolve(); };
  server.once('error',onError); server.once('listening',onListening); server.listen(0, '127.0.0.1');
 });
 // Runtime failures must reach the fixture, not an already-settled listen promise.
 server.on('error',error => { serverError=error; });
 const origin = `http://127.0.0.1:${server.address().port}`;
 isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-packaged-test-'));
 const home = path.join(isolated, 'home'), emptyPath = path.join(isolated, 'empty-path'), runtime = path.join(isolated, 'runtime');
 for (const directory of [home, emptyPath, runtime]) fs.mkdirSync(directory, {mode: 0o700});
 // Direct mode's source controller prepares a private cache; not first-run UI proof.

 // A host-isolation surrogate, not certification on a separate no-Node machine.
 const env = {...process.env, HOME:home, USERPROFILE:home, XDG_CONFIG_HOME:path.join(home,'config'), XDG_CACHE_HOME:path.join(home,'cache'), XDG_DATA_HOME:path.join(home,'data'), XDG_RUNTIME_DIR:runtime, PATH:emptyPath, EP_TEST_BOOT:'1', EP_LOGIN_URL:origin+'/app/login', EP_LOGIN_HOST:'127.0.0.1', TMPDIR:isolated, PUPPETEER_EXECUTABLE_PATH:''};
 if (process.platform === 'win32') { env.TEMP = isolated; env.TMP = isolated; }
 delete env.EP_EMAIL; delete env.EP_PASSWORD;
 const copy = path.join(isolated, filename); fs.copyFileSync(executable,copy); fs.chmodSync(copy,0o700);
 if(directDownload)acquiredPath=await require('../packaging/download-browser').ensureBrowser({home,consent:async()=>true});
 child = spawn(copy, [], {env,cwd:home,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
 child.once('error', error => { spawnError=error; });
 child.stdout.on('data',data=>{text+=data;}); child.stderr.on('data',data=>{text+=data;});
 closed = new Promise(resolve=>child.once('close',resolve));
 const wait = (predicate, name = 'local-cli-control', milliseconds = 20000) => require('./packaged-checkpoint').waitForPackagedCheckpoint(predicate, {
  child, name, milliseconds, failure: () => serverError || spawnError,
 });
 // The previous 20s fixture deadline could preempt Puppeteer's pinned 30s
 // launch timeout. Allow it to report/settle; do not retry or alter the launch.
 // No connect/pages/target/CDP observer traffic before owner's fixed marker.
 const ready = await connectAfterLoginReady({text:()=>text,child,failure:()=>serverError||spawnError,
  connect:options=>puppeteer.connect(options)});
 browser = ready.browser;
 console.log('Packaged owner login-ready checkpoint: '+JSON.stringify(ready.checkpoint)+' (instrumented sample only).');
  const command = await browser.target().createCDPSession();
  const { arguments: browserArgs } = await command.send('Browser.getBrowserCommandLine');
  if(directDownload){
   assert.equal(fs.realpathSync(browserArgs[0]),fs.realpathSync(acquiredPath),'SEA must use the exact direct-download cache');
   assert.equal(await browser.version(),'Chrome/'+require('../packaging/browser-downloads.json').version);
   console.log('Downloadable SEA browser path matches direct Google cache; observed version matches pin.');
  } else {
  const { browserIsInOwnedExtraction, browserOriginEvidence } = require('./packaged-browser-origin');
  console.log('Packaged browser origin relationship: ' + JSON.stringify(browserOriginEvidence(isolated, browserArgs[0])));
  assert.ok(browserIsInOwnedExtraction(isolated, browserArgs[0]), 'Browser must launch from this executable extraction, never a host cache');
  }
  await command.detach();
  const page=await selectLoginPage(browser,origin+'/app/login');
  await page.type('#loginId','fixture-user'); await page.type('#password','fixture-only'); await page.click('form button');
  await wait(()=>text.includes('Commands: start'), 'commands-listed');
  await page.goto(origin+'/lesson'); child.stdin.write('mode semi\nstart\n');
  await wait(()=>text.includes('Nothing else is clicked in semi-auto.'), 'semi-auto-notice');
  assert.equal(await page.$eval('.multi-choice-component',el=>window.angular.element(el).scope().self.model._currentQuestion.questionIndex),0);
  child.stdin.write('stop\n'); await wait(()=>text.includes('answerLoop Exited.'), 'answer-loop-exit');
  child.stdin.write('quit\n'); assert.equal(await boundedClose(closed,10000,'Packaged quit timed out: '+text),0,text);
  const residue = reportResidue();
  assert.equal(residue.length,0,'Owned extraction directory must be removed');
  if(serverError) throw serverError;
  console.log(directDownload?'Downloadable SEA: private direct-download cache, observed pinned browser, copied artifact, empty PATH, local sign-in, semi-auto noSubmit, quit and extraction cleanup passed (host-isolation surrogate, not first-run UI/no-Node proof).':'Packaged executable: copied outside source, fresh HOME/cache, empty PATH, embedded browser, local sign-in, semi-auto without submission, stop/quit and extraction cleanup passed (host-isolation surrogate only).');
 } catch (error) {
  primaryError = error;
  // Emit the original checkpoint failure before cleanup can fail separately.
  console.error('Original packaged fixture failure:', error);
  console.error('Fixed packaged startup evidence: '+JSON.stringify(require('./packaged-startup-evidence').startupEvidence(text)));
  throw error;
 } finally {
  await finishFixtureCleanup(primaryError, [
   () => disconnectController(browser),
   () => stopChild(child,closed),
   () => new Promise(resolve => server.close(resolve)),
   () => { if(isolated) reportResidue(); },
   () => { if(isolated) fs.rmSync(isolated,{recursive:true,force:true}); },
  ]);
 }
}
module.exports={runPackagedFixture};
if(require.main===module)runPackagedFixture().catch(error=>{console.error(error);process.exitCode=1;});
