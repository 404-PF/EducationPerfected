// Controlled local experiment only, not a product retry or release attestation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {startupFailure}=require('../lib/test-startup-failure');
const {browserStderr,browserLogFile}=require('./windows-browser-stderr');
async function sample({kind,executablePath,env,url,launch,requestSeen,logPath,recover=false}){
 const stderr=browserStderr();let detach=()=>{};
 let browser,cleanup=false,initialBlank=null,navigated=false,ready=false,cause=null,stage='launch';
 try{
  browser=await launch({headless:'shell',defaultViewport:null,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,executablePath,env,...(logPath?{args:['--enable-logging','--log-file='+logPath]}:{})});
  detach=stderr.attach(browser.process()?.stderr);
  stage='page-selection';
  const initial=(await browser.pages())[0];initialBlank=initial.url()==='about:blank';
  const page=kind==='new-page'?await browser.newPage():initial;
  stage='navigation';if(recover)await require('../lib/initial-login-navigation').navigateInitialLogin(page,url);else await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});navigated=true;
  stage='readiness';await page.waitForSelector('#loginId',{timeout:5000});ready=true;
 }catch(error){
  cause=startupFailure(error,browser);
  // The shared startup classifier assumes navigation; this panel also observes readiness.
  if(stage==='readiness'&&cause.category==='navigation-timeout')cause.category='readiness-timeout';
 }
 // Returned browser handles are closed after success or failure. A failed launch
 // without a handle cannot confirm closure and retains the owned root.
 // Throw outside finally so closure uncertainty cannot be mistaken for an observed sample.
 if(!browser)throw new Error('Diagnostic launch closure unconfirmed');
 // Read only after navigation/readiness was observed, never before goto.
 const networkSandbox=await require('./windows-network-sandbox').observeNetworkSandbox(browser).catch(()=>null);
 const utilityHistograms=await require('./windows-utility-histograms').utilityHistograms(browser);
 let timer;
 try{await Promise.race([browser.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Close deadline')),10000);})]);cleanup=true;}
 catch{try{browser.process()?.kill();}catch{ /* Retain uncertainty even if best-effort kill fails. */ }}
 finally{clearTimeout(timer);detach();}
 if(!cleanup)throw new Error('Diagnostic browser cleanup unconfirmed');
 return {networkSandbox,kind,recover,initialBlank,navigated,ready,stage,requestSeen:requestSeen()?true:null,cleanup,cause,utilityHistograms,stderr:stderr.result(),...(logPath?{loggingEnabled:true,logFile:browserLogFile(logPath)}:{})};
}

async function panel(){
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.argv.length,2);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-navigation-panel-'));let safe=true;
 const server=require('./mock-ep').createServer();let requests=0;
 server.on('request',()=>{requests++;});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const home=path.join(root,'home'),tmp=path.join(root,'tmp'),empty=path.join(root,'empty');for(const dir of [home,tmp,empty])fs.mkdirSync(dir);
 require('./windows-fixture-profile').prepareWindowsFixtureProfile(home);
  // Hosted CI diagnostic authorizes its own pinned Chrome download. Product consent is unchanged.
  const executablePath=await require('../packaging/download-browser').ensureBrowser({home,consent:async()=>true});
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','PUPPETEER_BROWSER','PUPPETEER_EXECUTABLE_PATH'].includes(key.toUpperCase())));
  Object.assign(env,{HOME:home,USERPROFILE:home,PATH:empty,TEMP:tmp,TMP:tmp,TMPDIR:tmp});
  // Two independent baseline launches, then configure the owned browser sandbox,
  // then two independent launches. Order/warm-up remains a possible confound.
  for(const [index,setupKind] of ['installer-attempted','installer-attempted','explicit-final-setup','explicit-final-setup'].entries()){
   if(index===2){
    safe=false;
    const setup=require('./windows-sandbox-setup').sandboxSetup(executablePath);
    console.log('Windows owned Chrome sandbox setup: '+JSON.stringify(setup));
    assert.equal(setup.state,'configured','Owned Chrome sandbox setup was not confirmed');safe=true;
   }
   const before=requests;safe=false;
   const result=await sample({kind:'initial-page',executablePath,env,logPath:path.join(root,'chrome-'+index+'.log'),url:'http://127.0.0.1:'+server.address().port+'/app/login',launch:options=>require('puppeteer').launch(options),requestSeen:()=>requests>before});
   safe=result.cleanup;assert.ok(result.networkSandbox,'Windows Network sandbox acceptance failed');console.log('Windows local sandbox-setup comparison: '+JSON.stringify({setupKind,...result}));
  }
  const recovered=[];
  for(let index=0;index<6;index++){
   const before=requests;safe=false;
   const result=await sample({kind:'initial-page',recover:true,executablePath,env,logPath:path.join(root,'recovery-'+index+'.log'),url:'http://127.0.0.1:'+server.address().port+'/app/login',launch:options=>require('puppeteer').launch(options),requestSeen:()=>requests>before});
   safe=result.cleanup;assert.ok(result.networkSandbox,'Windows Network sandbox acceptance failed');console.log('Windows bounded initial-login recovery: '+JSON.stringify(result));
   recovered.push(result.ready);
  }
  assert.ok(recovered.every(Boolean),'Bounded recovery did not reach local login in every independent sample');
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  if(safe)fs.rmSync(root,{recursive:true,force:true});
  else console.error('Diagnostic browser closure uncertain; owned root retained until hosted VM destruction.');
 }
}
module.exports={sample,panel};if(require.main===module)panel().catch(()=>{console.error('Windows local navigation comparison failed outside an observed sample.');process.exitCode=1;});
