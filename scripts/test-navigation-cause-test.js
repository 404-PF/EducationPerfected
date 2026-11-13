const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {navigationCause,recordNavigationFailure} = require('../lib/test-navigation-cause');
(async () => {
 const source=fs.readFileSync(require.resolve('../index'),'utf8').replace(/\r\n/g,'\n');
 const navigation=source.slice(source.indexOf('                const navigationStartedAt = TEST_BOOT ? Date.now() : null;'),source.indexOf("                console.log('Waiting for login page to load...');"));
 assert.ok(navigation.includes('throw error;'));
 assert.equal((navigation.match(/await /g)||[]).length,1,'One awaited policy call before readiness');
 const run=vm.runInNewContext('(async function(page,DIR,TEST_BOOT,require){'+navigation+'})',{}, {timeout:1000}); // NOSONAR: fixed exact repository navigation block above plus constant wrapper, no user/env/network source; caller supplies inert page/report only.
 const secret=['https://','private-user',':','private-pass','@','private-host','/private-path'].join('');
 for (const [error,expected] of [
  [Object.assign(Error(secret),{name:'TimeoutError'}),'navigation-timeout'],
  [Error('Navigating frame was detached '+secret),'target-detached'],
  [Error('detached Frame '+secret),'target-detached'],
  [Error('Requesting main frame too early! '+secret),'target-detached'],
  [Error('Session closed '+secret),'browser-disconnected'],
  [Error('Target closed '+secret),'browser-disconnected'],
  [Error('browser has disconnected '+secret),'browser-disconnected'],
  [Error('Connection closed '+secret),'browser-disconnected'],
  [Object.assign(Error(secret),{name:'ProtocolError'}),'protocol-error'],
  [Error(secret),'other'],
  [Error('net::ERR_CONNECTION_REFUSED at '+secret),'other'],
 ]) {
  assert.deepEqual(navigationCause(error),expected);
  const output=[],order=[];
  const page={goto:async(url,options)=>{assert.equal(url,secret);assert.equal(options.waitUntil,'domcontentloaded');assert.deepEqual(Object.keys(options),['waitUntil']);order.push('goto');throw error;}};
  await assert.rejects(run(page,{login_url:secret},true,id=>id==='./lib/initial-login-navigation'?{navigateInitialLogin:async(page,url)=>page.goto(url,{waitUntil:'domcontentloaded'})}:{recordNavigationFailure:(e,gate,start)=>recordNavigationFailure(e,gate,start,line=>{order.push('report');output.push(line);})}),caught=>caught===error); // NOSONAR: calls the fixed repository navigation block compiled above, with inert page and fake require only; no external code.
  order.push('test-rejection-observed');assert.deepEqual(order,['goto','report','test-rejection-observed']);
  assert.equal(output.length,1);const detail=JSON.parse(output[0].split('=')[1]);assert.deepEqual(Object.keys(detail),['category','elapsedMs','controllerConnected','markerEmitted','browserExitCodeClass']);assert.equal(detail.category,expected);assert.ok(detail.elapsedMs>=0 && detail.elapsedMs<=120000);assert.equal(detail.controllerConnected,null);assert.equal(detail.markerEmitted,false);assert.equal(detail.browserExitCodeClass,'unobserved');assert.ok(!output[0].includes('private'));assert.ok(!output[0].includes(secret));
  let loads=0;
  await assert.rejects(run(page,{login_url:secret},false,id=>{if(id==='./lib/initial-login-navigation')return {navigateInitialLogin:async(page,url)=>page.goto(url,{waitUntil:'domcontentloaded'})};loads++;}),caught=>caught===error); // NOSONAR: calls the fixed repository navigation block compiled above, with inert page and fake require only; no external code.
  assert.equal(loads,0,'Normal boot must not load diagnostics');
  assert.doesNotThrow(()=>recordNavigationFailure(error,true,0,()=>{throw Error('Sink failed');}));
 }
 let reports=0;recordNavigationFailure(Error(secret),false,0,()=>{reports++;});assert.equal(reports,0);
 for (const [start,now,expected] of [[0,200000,120000],[10,5,0],[NaN,5,null]]) {
  let detail;recordNavigationFailure(Error(secret),true,start,line=>{detail=JSON.parse(line.split('=')[1]);},()=>now);assert.equal(detail.elapsedMs,expected);
 }
 let calls=0;await run({goto:async()=>{calls++;}}, {login_url:secret},true,id=>{if(id==='./lib/initial-login-navigation')return {navigateInitialLogin:async(page,url)=>page.goto(url,{waitUntil:'domcontentloaded'})};throw Error('Successful goto must not load recorder');});assert.equal(calls,1); // NOSONAR: calls the fixed repository navigation block compiled above, with inert page and fake require only; no external code.
 const ready=source.indexOf("if (TEST_BOOT && loginForm !== null) console.log('EP_TEST_LOGIN_READY');");
 assert.ok(ready>source.indexOf('const loginForm = await reachLoginForm();'));
 assert.equal((source.match(/EP_TEST_LOGIN_READY/g)||[]).length,1);
 console.log('Inert actual-source navigation block: fixed categories, privacy, single policy call, no added caller await, TEST_BOOT gate, original rejection identity and report-before-test-rejection. Marker after nonnull owner form. No native/startup reliability proof.');
})().catch(error=>{console.error(error);process.exitCode=1;});
