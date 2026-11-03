const assert=require('node:assert/strict');
const {loginReady,connectAfterLoginReady,selectLoginPage,disconnectController}=require('./packaged-fixture-page');
(async()=>{
 const endpoint='EP_WS_ENDPOINT=ws://127.0.0.1:1234/devtools/browser/fixture-only';
 for(const text of [endpoint,'EP_TEST_LOGIN_READY',endpoint+'\nnot EP_TEST_LOGIN_READY\n']) assert.equal(loginReady(text),false);
 assert.equal(loginReady(endpoint+'\nEP_TEST_LOGIN_READY\r\n'),true);
 const child={exitCode:null,signalCode:null},events=[];let text=endpoint,tick=0;
 const browser={disconnect:()=>events.push('disconnect'),close:()=>{throw Error('Borrowed controller must not close owner');}};
 const connected=await connectAfterLoginReady({text:()=>text,child,now:()=>tick,pause:async()=>{assert.deepEqual(events,[]);tick+=30;text+='\nEP_TEST_LOGIN_READY\n';},connect:async()=>{events.push('connect');return browser;}});
 assert.equal(connected.browser,browser);assert.equal(connected.checkpoint.checkpoint,'owner-login-ready');assert.equal(connected.checkpoint.elapsedMs,30);assert.equal(connected.checkpoint.outcome,'arrived');assert.deepEqual(events,['connect']);await disconnectController(browser);assert.deepEqual(events,['connect','disconnect']);await disconnectController(undefined);
 let traffic=0;tick=0;
 await assert.rejects(connectAfterLoginReady({text:()=>endpoint,child,milliseconds:60,now:()=>tick,pause:async()=>{tick+=30;},connect:()=>{traffic++;}}),error=>error.code==='EP_FIXTURE_CHECKPOINT' && /owner-login-ready/.test(error.message) && /timeout/.test(error.message));
 assert.equal(traffic,0,'Marker expiry must never attach or succeed');
 await assert.rejects(connectAfterLoginReady({text:()=>endpoint,child:{exitCode:1,signalCode:null},connect:()=>{traffic++;}}),/child-exit/);assert.equal(traffic,0);
 await assert.rejects(connectAfterLoginReady({text:()=>endpoint.replace('127.0.0.1','external.invalid')+'\nEP_TEST_LOGIN_READY',child,connect:()=>{traffic++;}}));assert.equal(traffic,0);
 const url='http://127.0.0.1:1234/app/login';let pages=0;
 const page={isClosed:()=>false,mainFrame:()=>({}),url:()=>url};
 const target={type:()=> 'page',url:()=>url,page:async()=>{pages++;return page;}};
 const selector={waitForTarget:async(predicate,options)=>{assert.equal(options.timeout,20000);assert.equal(predicate({type:()=> 'page',url:()=> 'about:blank'}),false);assert.equal(predicate({type:()=> 'worker',url:()=>url}),false);assert.equal(predicate({...target,url:()=>url+'/other'}),false);assert.equal(predicate(target),true);return target;},pages:()=>{throw Error('No positional page selection');}};
 assert.equal(await selectLoginPage(selector,url),page);assert.equal(pages,1);
 for(const value of [null,{...page,isClosed:()=>true},{...page,mainFrame:()=>null},{...page,url:()=>url+'/other'}]) await assert.rejects(selectLoginPage({waitForTarget:async()=>({...target,page:async()=>value})},url));
 for(const [bad,message] of [
  ['https://127.0.0.1:1234/app/login','Fixture target must be local HTTP'],
  ['http://localhost:1234/app/login','Fixture target must be exact local loopback'],
  [url+'?private=secret','Fixture URL must carry no private fields'],
  [url+'#private','Fixture URL must carry no private fields'],
  ['http://u:p@127.0.0.1:1234/app/login','Fixture URL must carry no private fields'],
  ['http://127.0.0.1/app/login','Fixture target must have an explicit mock port'],
  [url+'/other','Fixture target must be the fixed mock login route'],
 ]) {
  let calls=0;
  await assert.rejects(selectLoginPage({waitForTarget:()=>{calls++;throw Error('Must reject before browser traffic');}},bad),error=>error.message.startsWith(message));
  assert.equal(calls,0,'URL validation must reject before target traffic');
 }
 console.log('Inert marker ordering, zero pre-ready connection, bounded expiry uncertainty, exact local initialized target and borrowed disconnect passed. No native proof.');
})().catch(error=>{console.error(error);process.exitCode=1;});
