const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {installGapsFixture}=require('./gaps-fixture');
const {detectQuestion}=require('../lib/detect-question');
const {playGapsRound}=require('../lib/gaps-handler');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage();
  const setup=async mutation=>{
   await page.goto('http://127.0.0.1:'+server.address().port+'/lesson');await page.evaluate(installGapsFixture);
   await page.evaluate(m=>{
    const f=gapsFixture;
    // DOM gap7 is flexible; gap41 requires beta. A greedy choice beta for
    // gap7 would starve gap41, so exact matching must allocate alpha to gap7.
    f.metadata.Gaps[1].CorrectOptions=['beta','alpha'];f.metadata.Gaps[0].CorrectOptions=['beta'];
    if(m==='missing')f.metadata.Gaps[1].CorrectOptions=['not displayed'];
    if(m==='shortage')f.metadata.Gaps[1].CorrectOptions=['beta'];
    if(m==='duplicate-correct')f.metadata.Gaps[1].CorrectOptions=['alpha','alpha','beta'];
    if(m==='drift')f.afterInput=()=>{f.metadata.Gaps[0].CorrectOptions=['wrong'];};
   },mutation);
  };
  const positive=async mutation=>{
   await setup(mutation);const d=await detectQuestion(page);assert.equal(d.kind,'gaps');assert.deepEqual(d.gaps.map(g=>g.source),[1,2]);
   assert.equal((await playGapsRound(page,d,{enter:true,timeout:500})).status,'advanced');
   assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.map(i=>i.index),gapsFixture.submits]),[[1,2],1]);
  };
  await positive('alternatives');await positive('duplicate-correct');
  const refusal=async(mutation,guard)=>{
   await setup(mutation);const d=await detectQuestion(page);assert.equal(d.kind,'unsupported');assert.equal(d.diagnostic.guard,guard);assert.doesNotMatch(JSON.stringify(d.diagnostic),/alpha|beta|displayed|CorrectOptions/);
   assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
  };
  await refusal('missing','correct-label-missing');await refusal('shortage','correct-label-allocation');
  await setup('drift');const d=await detectQuestion(page);assert.equal((await playGapsRound(page,d,{enter:true,timeout:100})).status,'stopped');
  assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[1,0]);
 }finally{if(browser){await browser.close();}await new Promise(r=>server.close(r));}
 console.log('Gaps exact alternatives PASS: deterministic distinct matching avoids starvation, duplicate correct strings, missing/shortage diagnostics, post-input drift stops0Submit. Synthetic only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
