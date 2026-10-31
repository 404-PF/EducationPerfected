const assert=require('node:assert/strict');
const {loginReady,selectLoginPage,disconnectController}=require('./packaged-fixture-page');
const {finishFixtureCleanup}=require('./fixture-cleanup-errors');
(async()=>{
 const endpoint='EP_WS_ENDPOINT=ws://fixture-only';
 assert.equal(loginReady(endpoint),false);
 assert.equal(loginReady('EP_TEST_LOGIN_READY'),false);
 assert.equal(loginReady(endpoint+'\nnot EP_TEST_LOGIN_READY\n'),false);
 assert.equal(loginReady(endpoint+'\nEP_TEST_LOGIN_READY\r\n'),true);
 const url='http://127.0.0.1:1234/app/login';
 let release, pageCalls=0, closed=0, disconnected=0;
 const page={isClosed:()=>false,mainFrame:()=>({}),url:()=>url};
 const target={type:()=> 'page',url:()=>url,page:async()=>{pageCalls++;return page;}};
 const browser={waitForTarget:async(predicate,options)=>{
  assert.equal(options.timeout,20000);
  assert.equal(predicate({type:()=> 'page',url:()=> 'about:blank'}),false);
  assert.equal(predicate({type:()=> 'page',url:()=>url+'/other'}),false);
  assert.equal(predicate({type:()=> 'worker',url:()=>url}),false);
  assert.equal(predicate(target),true);
  await new Promise(resolve=>{release=resolve;});return target;
 },pages:()=>{throw Error('Positional pages must not be used');},close:()=>{closed++;},disconnect:()=>{disconnected++;}};
 const selected=selectLoginPage(browser,url);
 await Promise.resolve();assert.equal(pageCalls,0);release();assert.equal(await selected,page);assert.equal(pageCalls,1);
 const badPage=async p=>({waitForTarget:async()=>({...target,page:async()=>p})});
 await assert.rejects(selectLoginPage(await badPage(null),url),/open Page/);
 await assert.rejects(selectLoginPage(await badPage({...page,isClosed:()=>true}),url),/open Page/);
 await assert.rejects(selectLoginPage(await badPage({...page,mainFrame:()=>{throw Error('Requesting main frame too early!');}}),url),/main frame too early/);
 await assert.rejects(selectLoginPage(await badPage({...page,url:()=>url+'/other'}),url),/owner-ready/);
 await assert.rejects(selectLoginPage({waitForTarget:async()=>{throw Error('Target timeout');}},url),/Target timeout/);
 await disconnectController(browser);assert.equal(disconnected,1);assert.equal(closed,0);
 await disconnectController(undefined);
 const order=[],primary=Error('original fixture failure');
 await finishFixtureCleanup(primary,[
  ()=>disconnectController({disconnect:()=>{order.push('disconnect');throw Error('disconnect failure');}}),
  ()=>{order.push('stop-owner');},
 ],()=>{});
 assert.deepEqual(order,['disconnect','stop-owner']);
 console.log('Fixture readiness, exact target identity, initialization fail-fast and borrowed connection ownership passed (deterministic fakes only).');
})().catch(error=>{console.error(error);process.exitCode=1;});
