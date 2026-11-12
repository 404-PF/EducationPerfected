// Controlled local experiment only, not a product retry or release attestation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {startupFailure}=require('../lib/test-startup-failure');
async function sample({kind,executablePath,env,url,launch,requestSeen}){
 let browser,cleanup=false,initialBlank=null,navigated=false,ready=false,cause=null,stage='launch';
 try{
  browser=await launch({headless:'shell',defaultViewport:null,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,executablePath,env});
  stage='page-selection';
  const initial=(await browser.pages())[0];initialBlank=initial.url()==='about:blank';
  const page=kind==='new-page'?await browser.newPage():initial;
  stage='navigation';await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});navigated=true;
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
 let timer;
 try{await Promise.race([browser.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Close deadline')),10000);})]);cleanup=true;}
 catch{try{browser.process()?.kill();}catch{ /* Retain uncertainty even if best-effort kill fails. */ }}
 finally{clearTimeout(timer);}
 if(!cleanup)throw new Error('Diagnostic browser cleanup unconfirmed');
 return {kind,initialBlank,navigated,ready,stage,requestSeen:requestSeen()?true:null,cleanup,cause};
}

async function panel(){
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.argv.length,2);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-navigation-panel-'));let safe=true;
 const server=require('./mock-ep').createServer();let requests=0;
 server.on('request',()=>{requests++;});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const home=path.join(root,'home'),tmp=path.join(root,'tmp'),empty=path.join(root,'empty');for(const dir of [home,tmp,empty])fs.mkdirSync(dir);
  // Hosted CI diagnostic authorizes its own pinned Chrome download. Product consent is unchanged.
  const executablePath=await require('../packaging/download-browser').ensureBrowser({home,consent:async()=>true});
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','PUPPETEER_BROWSER','PUPPETEER_EXECUTABLE_PATH'].includes(key.toUpperCase())));
  Object.assign(env,{HOME:home,USERPROFILE:home,PATH:empty,TEMP:tmp,TMP:tmp,TMPDIR:tmp});
  // Alternating independent fresh browser launches, never retry a failed page.
  for(const kind of ['initial-page','new-page','initial-page','new-page']){
   const before=requests;safe=false;
   const result=await sample({kind,executablePath,env,url:'http://127.0.0.1:'+server.address().port+'/app/login',launch:options=>require('puppeteer').launch(options),requestSeen:()=>requests>before});
   safe=result.cleanup;console.log('Windows local navigation comparison: '+JSON.stringify(result));
  }
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  if(safe)fs.rmSync(root,{recursive:true,force:true});
  else console.error('Diagnostic browser closure uncertain; owned root retained until hosted VM destruction.');
 }
}
module.exports={sample,panel};if(require.main===module)panel().catch(()=>{console.error('Windows local navigation comparison failed outside an observed sample.');process.exitCode=1;});
