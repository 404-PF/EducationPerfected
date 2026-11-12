// Controlled local experiment only, not a product retry or release attestation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {startupFailure}=require('../lib/test-startup-failure');
async function sample({kind,executablePath,env,url,launch,requestSeen}){
 let browser,cleanup=false,initialBlank=null,navigated=false,cause=null;
 try{
  browser=await launch({headless:'shell',defaultViewport:null,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,executablePath,env});
  const initial=(await browser.pages())[0];initialBlank=initial.url()==='about:blank';
  const page=kind==='new-page'?await browser.newPage():initial;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#loginId',{timeout:5000});navigated=true;
 }catch(error){cause=startupFailure(error,browser);}
 finally{
  if(browser){
   let timer;
   try{await Promise.race([browser.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Close deadline')),10000);})]);cleanup=true;}
   catch{browser.process()?.kill();throw new Error('Diagnostic browser cleanup unconfirmed');}
   finally{clearTimeout(timer);}
  }else throw new Error('Diagnostic launch closure unconfirmed');
 }
 return {kind,initialBlank,navigated,requestSeen:requestSeen()?true:null,cleanup,cause};
}
async function panel(){
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.argv.length,2);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-navigation-panel-'));let safe=true;
 const server=require('./mock-ep').createServer();let requests=0;
 server.on('request',()=>{requests++;});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const home=path.join(root,'home'),tmp=path.join(root,'tmp'),empty=path.join(root,'empty');for(const dir of [home,tmp,empty])fs.mkdirSync(dir);
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
  await new Promise(resolve=>server.close(resolve));
  if(safe)fs.rmSync(root,{recursive:true,force:true});
  else console.error('Diagnostic browser closure uncertain; owned root retained until hosted VM destruction.');
 }
}
module.exports={sample,panel};if(require.main===module)panel().catch(()=>{console.error('Windows local navigation comparison failed outside an observed sample.');process.exitCode=1;});
