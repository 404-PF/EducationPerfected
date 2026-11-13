// Recovery is restricted to the initial, untouched blank Windows tab. Never
// retry an auth response/redirect, a non-GET main-frame request or answer input.
async function navigateInitialLogin(page,url,{platform=process.platform,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=console.log}={}){
 if(platform!=='win32'||page.url()!=='about:blank')return page.goto(url,{waitUntil:'domcontentloaded'});
 let progressed=false;
 const response=response=>{if(response.request().isNavigationRequest()&&response.frame()===page.mainFrame())progressed=true;};
 const request=request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame()&&(request.method()!=='GET'||request.url()!==url))progressed=true;};
 const navigation=frame=>{if(frame===page.mainFrame()&&frame.url()!=='about:blank')progressed=true;};
 page.on('response',response);page.on('request',request);page.on('framenavigated',navigation);
 try{
  try{return await page.goto(url,{waitUntil:'domcontentloaded'});}catch(error){
   if(!/\bnet::ERR_ABORTED\b/.test(String(error?.message))||progressed||page.isClosed()||page.url()!=='about:blank')throw error;
   // Chromium restarts a failed network service. A bounded pause lets its
   // restart settle; this does not change Chrome sandbox flags or permissions.
   await sleep(750);
   if(progressed||page.isClosed()||page.url()!=='about:blank')throw error;
   log('Initial blank login navigation aborted; retrying once after browser recovery.');
   return await page.goto(url,{waitUntil:'domcontentloaded'});
  }
 }finally{page.off('response',response);page.off('request',request);page.off('framenavigated',navigation);}
}
module.exports={navigateInitialLogin};
