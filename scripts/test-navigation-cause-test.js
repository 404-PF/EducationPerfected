const assert=require('node:assert/strict');
const {navigationCause,navigateForLogin}=require('../lib/test-navigation-cause');
(async()=>{
 const secret='http://private-user:private-pass@private-host/private-path';
 for(const [error,expected] of [
  [Error('net::ERR_CONNECTION_REFUSED at '+secret),{category:'network-error',code:'ERR_CONNECTION_REFUSED'}],
  [Error('net::ERR_SOMETHING_PRIVATE at '+secret),{category:'network-error',code:'other'}],
  [Object.assign(Error(secret),{name:'TimeoutError'}),{category:'timeout'}],
  [Error('Session closed '+secret),{category:'session-closed'}],
  [Error('Target closed '+secret),{category:'target-closed'}],
  [Error('browser has disconnected '+secret),{category:'connection-closed'}],
  [Error('Navigating frame was detached '+secret),{category:'frame-detached'}],
  [Error('Requesting main frame too early! '+secret),{category:'main-frame-unavailable'}],
  [Object.assign(Error(secret),{name:'ProtocolError'}),{category:'protocol-error'}],
  [Object.assign(Error(secret),{code:'ERR_INVALID_URL'}),{category:'invalid-url'}],
  [Error(secret),{category:'other'}],
 ]) {
  assert.deepEqual(navigationCause(error),expected);
  const output=[],order=[];
  const page={goto:async(url,options)=>{assert.equal(url,secret);assert.deepEqual(options,{waitUntil:'domcontentloaded'});order.push('goto');throw error;}};
  await assert.rejects(navigateForLogin(page,secret,true,line=>{order.push('report');output.push(line);}),caught=>caught===error);
  order.push('owner-catch');assert.deepEqual(order,['goto','report','owner-catch']);
  assert.equal(output.length,1);assert.ok(!output[0].includes('private'));assert.ok(!output[0].includes(secret));
  let outsideReports=0;
  await assert.rejects(navigateForLogin(page,secret,false,()=>{outsideReports++;}),caught=>caught===error);
  assert.equal(outsideReports,0);
  await assert.rejects(navigateForLogin(page,secret,true,()=>{throw Error('Sink failed');}),caught=>caught===error);
 }
 let successReports=0;
 const response={status:200};assert.equal(await navigateForLogin({goto:async()=>response},secret,true,()=>{successReports++;}),response);
 assert.equal(successReports,0);
 console.log('Navigation diagnostics: fixed categories, secret exclusion, TEST_BOOT gate, original rejection identity, pre-cleanup observation and unchanged successful result passed (deterministic fakes).');
})().catch(error=>{console.error(error);process.exitCode=1;});
