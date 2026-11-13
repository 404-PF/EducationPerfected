// Only owned Chrome, local synthetic page and internal chrome://sandbox.
const puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+Number(process.argv[2])});
 try{
  const page=(await browser.pages())[0];let error=null;
  try{await page.goto('http://127.0.0.1:'+Number(process.argv[3])+'/app/login',{waitUntil:'domcontentloaded',timeout:15000});}catch(e){error=String(e.message).match(/net::(ERR_[A-Z_]+)/)?.[1]||'other';}
  const session=await browser.target().createCDPSession();const metrics={};
  for(const name of ['Chrome.SystemNetworkContextManager.NetworkSandboxLaunchFailed.ErrorCode','Chrome.SystemNetworkContextManager.NetworkSandboxLaunchFailed.WinLastError']){
   try{const {histogram}=await session.send('Browser.getHistogram',{name});metrics[name]={count:histogram.count,buckets:histogram.buckets};}catch{metrics[name]={unavailable:true};}
  }
  await session.detach();await page.goto('chrome://sandbox',{waitUntil:'domcontentloaded',timeout:10000});
  const sandbox=await page.evaluate(()=>document.body.innerText.slice(0,12000));
  console.log(JSON.stringify({error,metrics,sandbox}));
 }finally{await browser.close();}
})().catch(()=>{console.log(JSON.stringify({observerFailure:true}));process.exitCode=1;});
