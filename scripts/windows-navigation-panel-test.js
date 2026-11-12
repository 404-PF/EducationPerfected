const assert=require('node:assert/strict'),{sample}=require('./windows-navigation-panel');
const {browserStderr,LIMIT}=require('./windows-browser-stderr'),{PassThrough}=require('node:stream');
(async()=>{
 const stream=new PassThrough(),diagnostic=browserStderr(),detach=diagnostic.attach(stream);
 stream.write('private-path network_service_instance_impl.cc: Network ser');
 stream.write('vice crashed, restarting service.\nsandbox_win.cc: Sandbox cannot access executable. Access is denied.\n');
 stream.write('gpu_process_host.cc: GPU process exited unexpectedly\nos_crypt_win.cc: Failed to encrypt private-value\n');
 const detail=diagnostic.result();assert.equal(detail.attached,true);
 for(const key of ['networkServiceCrash','sandboxAccessDenied','gpuProcessExit','encryptionFailure'])assert.equal(detail[key],true);
 assert.ok(!JSON.stringify(detail).includes('private'));detach();assert.equal(stream.listenerCount('data'),0);
 const bounded=browserStderr();bounded.observe(Buffer.alloc(LIMIT,120));bounded.observe('network_service.cc: Network service crashed');
 assert.equal(bounded.result().bytesExamined,LIMIT);assert.equal(bounded.result().truncated,true);assert.equal(bounded.result().networkServiceCrash,false);
 assert.equal(browserStderr().result().attached,false);

 for(const kind of ['initial-page','new-page'])for(const fail of [false,true]){
  let selected,closed=false,launchOptions;const childStderr=new PassThrough();
  const page=name=>({url:()=> 'about:blank',goto:async()=>{selected=name;if(fail){childStderr.write('network_service_instance_impl.cc: Network service crashed private');throw new Error('net::ERR_ABORTED private');}},waitForSelector:async()=>{}});
  const browser={pages:async()=>[page('initial-page')],newPage:async()=>page('new-page'),close:async()=>{closed=true;},process:()=>({exitCode:null,stderr:childStderr}),isConnected:()=>true};
  const result=await sample({kind,executablePath:'fixed',env:{PATH:'empty'},url:'http://127.0.0.1/inert',launch:async options=>{launchOptions=options;return browser;},requestSeen:()=>!fail});
  assert.equal(selected,kind);assert.equal(closed,true);assert.equal(result.navigated,!fail);assert.equal(result.requestSeen,fail?null:true);assert.equal(result.cleanup,true);assert.equal(launchOptions.headless,'shell');assert.deepEqual(launchOptions.env,{PATH:'empty'});assert.equal(launchOptions.executablePath,'fixed');assert.equal(result.ready,!fail);assert.equal(result.stderr.attached,true);assert.equal(result.stderr.networkServiceCrash,fail);assert.equal(childStderr.listenerCount('data'),0);
  if(fail){assert.equal(result.cause.networkCode,'ERR_ABORTED');assert.ok(!JSON.stringify(result).includes('private'));}
 }
 for(const stage of ['navigation','readiness']){
  const timeout=()=>{const error=new Error('private');error.name='TimeoutError';throw error;};
  const page={url:()=> 'about:blank',goto:async()=>{if(stage==='navigation')timeout();},waitForSelector:async()=>timeout()};
  const browser={pages:async()=>[page],close:async()=>{},process:()=>({exitCode:null}),isConnected:()=>true};
  const result=await sample({kind:'initial-page',launch:async()=>browser,requestSeen:()=>true});
  assert.equal(result.stage,stage);assert.equal(result.navigated,stage==='readiness');assert.equal(result.ready,false);
  assert.equal(result.cause.category,stage==='navigation'?'navigation-timeout':'readiness-timeout');
  assert.ok(!JSON.stringify(result).includes('private'));
 }
 const browser={pages:async()=>{throw new Error('private');},close:async()=>{throw new Error('private');},process:()=>({kill(){}})};
 await assert.rejects(sample({kind:'initial-page',launch:async()=>browser,requestSeen:()=>false}),/cleanup unconfirmed/);
 await assert.rejects(sample({kind:'initial-page',launch:async()=>{throw new Error('private');},requestSeen:()=>false}),/launch closure unconfirmed/);
 console.log('Navigation panel independent-case selection, bounded errors, readiness separation, empty environment transport, bounded stderr flags and fail-closed cleanup passed (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
