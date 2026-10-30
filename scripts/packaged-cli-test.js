// Local fixture only. Pass an absolute development executable path.
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
 const executable = path.resolve(__dirname, '../build/linux-x64/educationperfected');
 const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-packaged-test-'));
 const env = {...process.env, EP_TEST_BOOT:'1', EP_LOGIN_URL:origin+'/app/login', EP_LOGIN_HOST:'127.0.0.1', TMPDIR:isolated, PUPPETEER_EXECUTABLE_PATH:''};
 delete env.EP_EMAIL; delete env.EP_PASSWORD;
 const child = spawn(executable, [], {env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
 let text='', browser;
 child.stdout.on('data',data=>{text+=data;}); child.stderr.on('data',data=>{text+=data;});
 const closed = new Promise(resolve=>child.once('close',resolve));
 const wait = async predicate => {
  const until=Date.now()+20000;
  while(!predicate()) {
   if(child.exitCode!==null || child.signalCode!==null || Date.now()>until) throw Error('Packaged checkpoint failed: '+text);
   await new Promise(resolve=>setTimeout(resolve,30));
  }
 };
 try {
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
  console.log('Packaged executable: embedded browser, local sign-in, semi-auto without submission, stop/quit and extraction cleanup passed.');
 } finally {
  if(browser) await browser.close().catch(()=>{});
  await stopChild(child,closed);
  server.close(); fs.rmSync(isolated,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
