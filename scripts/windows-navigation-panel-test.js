const assert=require('node:assert/strict'),{sample}=require('./windows-navigation-panel');
(async()=>{
 for(const kind of ['initial-page','new-page'])for(const fail of [false,true]){
  let selected,closed=false,launchOptions;
  const page=name=>({url:()=> 'about:blank',goto:async()=>{selected=name;if(fail)throw new Error('net::ERR_ABORTED private');},waitForSelector:async()=>{}});
  const browser={pages:async()=>[page('initial-page')],newPage:async()=>page('new-page'),close:async()=>{closed=true;},process:()=>({exitCode:null}),isConnected:()=>true};
  const result=await sample({kind,executablePath:'fixed',env:{PATH:'empty'},url:'http://127.0.0.1/inert',launch:async options=>{launchOptions=options;return browser;},requestSeen:()=>!fail});
  assert.equal(selected,kind);assert.equal(closed,true);assert.equal(result.navigated,!fail);assert.equal(result.requestSeen,fail?null:true);assert.equal(result.cleanup,true);assert.equal(launchOptions.headless,'shell');
  if(fail){assert.equal(result.cause.networkCode,'ERR_ABORTED');assert.ok(!JSON.stringify(result).includes('private'));}
 }
 const browser={pages:async()=>{throw new Error('private');},close:async()=>{throw new Error('private');},process:()=>({kill(){}})};
 await assert.rejects(sample({kind:'initial-page',launch:async()=>browser,requestSeen:()=>false}),/cleanup unconfirmed/);
 await assert.rejects(sample({kind:'initial-page',launch:async()=>{throw new Error('private');},requestSeen:()=>false}),/launch closure unconfirmed/);
 console.log('Navigation panel independent-case selection, bounded errors, empty environment transport and fail-closed cleanup passed (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
