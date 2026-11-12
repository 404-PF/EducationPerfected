const assert=require('node:assert/strict'),{sample,pathCases}=require('./windows-navigation-panel');
const {browserStderr,browserLogFile,LIMIT}=require('./windows-browser-stderr'),{PassThrough}=require('node:stream');
(async()=>{
 const cases=pathCases({PATH:'empty',HOME:'owned',Path:'conflict',NODE_OPTIONS:undefined},{Path:'host-tools'});
 assert.deepEqual(cases.map(entry=>entry.pathKind),['empty','inherited','empty','inherited']);
 for(const [index,entry] of cases.entries()){assert.equal(entry.env.PATH,index%2?'host-tools':'empty');assert.equal(entry.env.HOME,'owned');assert.equal(Object.keys(entry.env).filter(key=>key.toUpperCase()==='PATH').length,1);}
 assert.throws(()=>pathCases({PATH:'empty'},{}));assert.throws(()=>pathCases({PATH:'empty'},{PATH:''}));
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-log-inert-')),logPath=path.join(root,'chrome.log');
 try{
  assert.equal(browserLogFile(logPath).state,'absent');assert.equal(browserLogFile(root).state,'unreadable');
  fs.writeFileSync(logPath,'private-path network_service_instance_impl.cc: Network service crashed private\n'+'x'.repeat(LIMIT));
  const file=browserLogFile(logPath);assert.equal(file.state,'read');assert.equal(file.bytesExamined,LIMIT);assert.equal(file.truncated,true);assert.equal(file.networkServiceCrash,true);assert.ok(!JSON.stringify(file).includes('private'));
  const page={url:()=> 'about:blank',goto:async()=>{},waitForSelector:async()=>{}};
  let options;const browser={pages:async()=>[page],close:async()=>{},process:()=>null};
  const result=await sample({kind:'initial-page',logPath,launch:async value=>{options=value;return browser;},requestSeen:()=>true});
  assert.deepEqual(options.args,['--enable-logging','--log-file='+logPath]);assert.equal(result.loggingEnabled,true);assert.equal(result.logFile.networkServiceCrash,true);assert.ok(!JSON.stringify(result).includes(logPath));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 const stream=new PassThrough(),diagnostic=browserStderr(),detach=diagnostic.attach(stream);
 stream.write('private-path network_service_instance_impl.cc: Network ser');
 stream.write('vice crashed, restarting service.\nsandbox_win.cc: Sandbox cannot access executable. Access is denied.\n');
 stream.write('gpu_process_host.cc: GPU process exited unexpectedly\nos_crypt_win.cc: Failed to encrypt private-value\n');
 const detail=diagnostic.result();assert.equal(detail.attached,true);
 for(const key of ['networkServiceCrash','sandboxAccessDenied','gpuProcessExit','encryptionFailure'])assert.equal(detail[key],true);
 assert.ok(!JSON.stringify(detail).includes('private'));detach();assert.equal(stream.listenerCount('data'),0);
 const bounded=browserStderr();bounded.observe(Buffer.alloc(LIMIT,120));bounded.observe('network_service.cc: Network service crashed');
 assert.equal(bounded.result().bytesExamined,LIMIT);assert.equal(bounded.result().truncated,true);assert.equal(bounded.result().networkServiceCrash,false);
 const strings=browserStderr();strings.observe('é'.repeat(LIMIT*4));assert.equal(strings.result().bytesExamined,LIMIT);assert.equal(strings.result().truncated,true);
 strings.observe({toString(){throw new Error('Must not coerce unknown objects');}});
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
