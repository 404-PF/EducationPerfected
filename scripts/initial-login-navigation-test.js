// Inert browser events only. No real account or navigation.
const {EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const {navigateInitialLogin}=require('../lib/initial-login-navigation');
(async()=>{
 const url='https://login.example.test/',abort=Error('net::ERR_ABORTED at private-url');
 for(const scenario of ['recover','repeat-abort','success','other-error','non-windows','nonblank','response','redirect','post','navigated','late-response','closed']){
  const page=new EventEmitter(),frame={url:()=> 'https://different.example.test/'};let calls=0,sleeps=0,logs=0,current=scenario==='nonblank'?url:'about:blank';
  page.url=()=>current;page.isClosed=()=>scenario==='closed';page.mainFrame=()=>frame;
  const req={isNavigationRequest:()=>true,frame:()=>frame,method:()=>scenario==='post'?'POST':'GET',url:()=>scenario==='redirect'?'https://different.example.test/':url};
  page.goto=async(value,options)=>{calls++;assert.equal(value,url);assert.equal(options.waitUntil,'domcontentloaded');if(scenario==='success')return 'ok';if(calls===2&&scenario!=='repeat-abort')return 'ok';if(scenario==='response')page.emit('response',{request:()=>req,frame:()=>frame});if(['redirect','post'].includes(scenario))page.emit('request',req);if(scenario==='navigated')page.emit('framenavigated',frame);throw scenario==='other-error'?Error('net::ERR_CONNECTION_REFUSED'):abort;};
  let result,error;try{result=await navigateInitialLogin(page,url,{platform:scenario==='non-windows'?'linux':'win32',sleep:async()=>{sleeps++;if(scenario==='late-response')current=url;},log:()=>{logs++;}});}catch(e){error=e;}
  assert.equal(calls,['recover','repeat-abort'].includes(scenario)?2:1,scenario);assert.equal(logs,['recover','repeat-abort'].includes(scenario)?1:0,scenario);
  if(['recover','success'].includes(scenario))assert.equal(result,'ok');else assert.ok(error,scenario);
  assert.equal(page.eventNames().length,0,scenario);
 }
 console.log('Initial Windows blank-tab abort recovery: one retry only, no redirects/responses/nonGET/navigation/closed/non-Windows retries; observer cleanup passed (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
