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
(async () => {
 if (process.argv.length > 2) throw Error('No executable override arguments accepted');
 const target = process.platform === 'win32' && process.arch === 'x64'
  ? '../build/windows-x64/educationperfected.exe' : '../build/linux-'+process.arch+'/educationperfected';
 if (!(process.platform === 'linux' && ['x64','arm64'].includes(process.arch)) && !(process.platform === 'win32' && process.arch === 'x64')) throw Error('No packaged fixture target for this platform');
 const executable = path.resolve(__dirname, target);
 const server = createServer();
 let isolated, child, closed, browser, spawnError, serverError, primaryError, text='';
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
 // A host-isolation surrogate, not certification on a separate no-Node machine.
 const env = {...process.env, HOME:home, USERPROFILE:home, XDG_CONFIG_HOME:path.join(home,'config'), XDG_CACHE_HOME:path.join(home,'cache'), XDG_DATA_HOME:path.join(home,'data'), XDG_RUNTIME_DIR:runtime, PATH:emptyPath, EP_TEST_BOOT:'1', EP_LOGIN_URL:origin+'/app/login', EP_LOGIN_HOST:'127.0.0.1', TMPDIR:isolated, PUPPETEER_EXECUTABLE_PATH:''};
 if (process.platform === 'win32') { env.TEMP = isolated; env.TMP = isolated; }
 delete env.EP_EMAIL; delete env.EP_PASSWORD;
 const copy = path.join(isolated, process.platform === 'win32' ? 'educationperfected.exe' : 'educationperfected'); fs.copyFileSync(executable,copy); fs.chmodSync(copy,0o700);
 child = spawn(copy, [], {env,cwd:home,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
 child.once('error', error => { spawnError=error; });
 child.stdout.on('data',data=>{text+=data;}); child.stderr.on('data',data=>{text+=data;});
 closed = new Promise(resolve=>child.once('close',resolve));
 const wait = async predicate => {
  const until=Date.now()+20000;
  while(!predicate()) {
   if(serverError) throw serverError;
   if(spawnError) throw spawnError;
   if(child.exitCode!==null || child.signalCode!==null || Date.now()>until) throw Error('Packaged checkpoint failed: '+text);
   await new Promise(resolve=>setTimeout(resolve,30));
  }
 };
  await wait(()=>/EP_WS_ENDPOINT=(\S+)/.test(text));
  browser=await puppeteer.connect({browserWSEndpoint:text.match(/EP_WS_ENDPOINT=(\S+)/)[1]});
  await browser.waitForTarget(target=>target.type()==='page');
  const command = await browser.target().createCDPSession();
  const { arguments: browserArgs } = await command.send('Browser.getBrowserCommandLine');
  assert.ok(browserArgs[0].startsWith(isolated + path.sep), 'Browser must launch from this executable extraction, never a host cache');
  await command.detach();
  const page=(await browser.pages())[0]; await page.waitForSelector('#loginId');
  await page.type('#loginId','fixture-user'); await page.type('#password','fixture-only'); await page.click('form button');
  await wait(()=>text.includes('Commands: start'));
  await page.goto(origin+'/lesson'); child.stdin.write('mode semi\nstart\n');
  await wait(()=>text.includes('Nothing else is clicked in semi-auto.'));
  assert.equal(await page.$eval('.multi-choice-component',el=>window.angular.element(el).scope().self.model._currentQuestion.questionIndex),0);
  child.stdin.write('stop\n'); await wait(()=>text.includes('answerLoop Exited.'));
  child.stdin.write('quit\n'); assert.equal(await boundedClose(closed,10000,'Packaged quit timed out: '+text),0,text);
  const residue = reportResidue();
  assert.equal(residue.length,0,'Owned extraction directory must be removed');
  if(serverError) throw serverError;
  console.log('Packaged executable: copied outside source, fresh HOME/cache, empty PATH, embedded browser, local sign-in, semi-auto without submission, stop/quit and extraction cleanup passed (host-isolation surrogate only).');
 } catch (error) {
  primaryError = error;
  // Emit the original checkpoint failure before cleanup can fail separately.
  console.error('Original packaged fixture failure:', error);
  console.error('Synthetic packaged child output: '+text.slice(-4000).replace(/wss?:\/\/\S+/g,'[redacted browser endpoint]'));
  console.error('Synthetic child exit state: '+JSON.stringify({code:child?.exitCode,signal:child?.signalCode}));
  throw error;
 } finally {
  if(primaryError) console.error('EP_TEST_FIXTURE_PHASE=teardown-start');
  if(browser) await browser.close().catch(()=>{});
  if(primaryError) console.error('EP_TEST_FIXTURE_PHASE=controller-close-finished');
  await finishFixtureCleanup(primaryError, [
   () => stopChild(child,closed),
   () => new Promise(resolve => server.close(resolve)),
   () => { if(isolated) reportResidue(); },
   () => { if(isolated) fs.rmSync(isolated,{recursive:true,force:true}); },
   () => { if(primaryError) {
    console.error('Synthetic child output after teardown: '+text.slice(-4000).replace(/wss?:\/\/\S+/g,'[redacted browser endpoint]'));
    console.error('Synthetic child final exit state: '+JSON.stringify({code:child?.exitCode,signal:child?.signalCode}));
   } },
  ]);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
