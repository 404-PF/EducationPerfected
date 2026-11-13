// Local owned-browser acceptance, not a production launch policy or repair.
const assert=require('node:assert/strict');
function assertNetworkSandbox(text,histograms){
 const row=text.split(/\r?\n/).map(line=>line.split('\t')).find(cells=>cells[2]==='Network Service');
 assert.ok(row&&row[3]==='Network'&&row.some(cell=>/S-1-15-2-\d/.test(cell)),'Windows Network Service must run in Network sandbox with an AppContainer SID');
 for(const item of histograms)assert.ok(item.known&&item.count===0,'Windows Network Service must have no launch-failure samples');
 return {sandbox:'Network',appContainer:true,launchFailures:0};
}
async function observeNetworkSandbox(browser){
 const session=await browser.target().createCDPSession();const histograms=[];let page;
 try{
  // A missing single histogram is not evidence of zero. Enumerate the exact
  // prefix instead, requiring a valid response and checking every match.
  const {histograms:values}=await session.send('Browser.getHistograms',{query:'Chrome.SystemNetworkContextManager.NetworkSandboxLaunchFailed.',delta:false},{timeout:5000});
  assert.ok(Array.isArray(values),'Network launch histogram enumeration unavailable');
  for(const value of values){assert.ok(Number.isSafeInteger(value.count)&&value.count>=0);histograms.push({known:true,count:value.count});}
  if(!values.length)histograms.push({known:true,count:0});
  page=await browser.newPage();await page.goto('chrome://sandbox',{waitUntil:'domcontentloaded',timeout:10000});
  await page.waitForFunction(()=>document.body.innerText.includes('Network Service'),{timeout:10000});
  return assertNetworkSandbox(await page.evaluate(()=>document.body.innerText),histograms);
 }finally{
  try{if(page)await page.close();}finally{await session.detach();}
 }
}
module.exports={assertNetworkSandbox,observeNetworkSandbox};
