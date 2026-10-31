// Local fixture only. Uses the fixed native development executable.
const assert = require('node:assert/strict');
const { createServer } = require('./mock-ep');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
(async () => {
 if (process.argv.length > 2) throw Error('No executable override arguments accepted');
 const target = process.platform === 'win32' && process.arch === 'x64'
  ? '../build/windows-x64/educationperfected.exe' : '../build/linux-'+process.arch+'/educationperfected';
 if (!['linux', 'win32'].includes(process.platform)) throw Error('No packaged fixture target for this platform');
 const executable = path.resolve(__dirname, target);
 const server = createServer();
 let isolated, child, closed, browser, spawnError, serverError;
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
 let text='';
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
  assert.equal(fs.readdirSync(isolated).filter(name=>name.startsWith('educationperfected-')).length,0,'Owned extraction directory must be removed');
  if(serverError) throw serverError;
  console.log('Packaged executable: copied outside source, fresh HOME/cache, empty PATH, embedded browser, local sign-in, semi-auto without submission, stop/quit and extraction cleanup passed (host-isolation surrogate only).');
 } finally {
  if(browser) await browser.close().catch(()=>{});
  try { await stopChild(child,closed); } finally {
   await new Promise(resolve => server.close(resolve));
   if(isolated) fs.rmSync(isolated,{recursive:true,force:true});
  }
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
