// Local owned-browser acceptance, not a production launch policy or repair.
const assert=require('node:assert/strict');
function assertNetworkSandbox(text,histograms){
 const row=text.split(/\r?\n/).map(line=>line.split('\t')).find(cells=>cells[2]==='Network Service');
 assert.ok(row&&row[3]==='Network'&&row.some(cell=>/^(?:➕)?S-1-15-2-\d+(?:-\d+){6}$/.test(cell.trim())),'Windows Network Service must run in Network sandbox with an AppContainer SID');
 for(const item of histograms)assert.ok(item.known&&item.count===0,'Windows Network Service must have no launch-failure samples');
 return {sandbox:'Network',appContainer:true,noRecordedLaunchFailures:true};
}
async function observeNetworkSandbox(browser,milliseconds=20000){
 let session,page,expired=false,timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Network sandbox observation deadline'));},milliseconds);});
 const bounded=operation=>Promise.race([operation,deadline]);
 const lateClose=async object=>{try{await object.close();}catch{}};
 try{
  session=await bounded(browser.target().createCDPSession().then(async value=>{if(expired){try{await value.detach();}catch{}throw Error('Late sandbox session');}return value;}));
  const prefix='Chrome.SystemNetworkContextManager.NetworkSandboxLaunchFailed.';
  const {histograms:values}=await bounded(session.send('Browser.getHistograms',{query:prefix,delta:false},{timeout:5000}));
  assert.ok(Array.isArray(values),'Network launch histogram enumeration unavailable');
  const histograms=values.map(value=>{
   assert.ok(typeof value.name==='string'&&value.name.startsWith(prefix)&&Number.isSafeInteger(value.count)&&value.count>=0,'Invalid network histogram enumeration');
   return {known:true,count:value.count};
  });
  // Chromium lazily creates these failure histograms. An empty successful
  // prefix enumeration means no matching samples recorded, not a missing
  // single histogram measured as zero. The fixed prefix is source-verified.
  page=await bounded(browser.newPage().then(async value=>{if(expired){await lateClose(value);throw Error('Late sandbox page');}return value;}));
  await bounded(page.goto('chrome://sandbox',{waitUntil:'domcontentloaded',timeout:10000}));
  await bounded(page.waitForFunction(()=>document.body.innerText.includes('Network Service'),{timeout:10000}));
  return assertNetworkSandbox(await bounded(page.evaluate(()=>document.body.innerText)),histograms);
 }finally{
  expired=true;
  const cleanup=[];if(page)cleanup.push(page.close().catch(()=>{}));if(session)cleanup.push(session.detach().catch(()=>{}));
  let cleanupTimer;try{await Promise.race([Promise.all(cleanup),new Promise(resolve=>{cleanupTimer=setTimeout(resolve,2000);})]);}finally{clearTimeout(cleanupTimer);clearTimeout(timer);}
 }
}
module.exports={assertNetworkSandbox,observeNetworkSandbox};
