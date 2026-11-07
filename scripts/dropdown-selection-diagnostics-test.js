const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const {createServer} = require('./mock-ep');
const {detectQuestion} = require('../lib/detect-question');
const {playDropdownRound} = require('../lib/dropdown-handler');
const {createSubmitDropdownOnce} = require('../lib/dropdown-once');
async function testDiagnostics() {
 const server = createServer();
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 let browser;
 try {
  browser = await puppeteer.launch({headless:true, executablePath:process.env.HANDLER_EXECUTABLE_PATH || undefined});
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const setup = () => page.goto(origin + '/lesson-dropdown');
  const factory = (play = playDropdownRound) => createSubmitDropdownOnce({detectQuestion,playDropdownRound:play});
  async function scenario(mutation,phase,guard,keys) {
   await setup();
   await page.evaluate(m => {
    const f=dropdownFixture,c=f.base['dropdown-0'][0],el=c.dropDownList;
    if(m==='focus') {
     el.addEventListener('focus',()=>f.base['dropdown-1'][0].dropDownList.focus());
     return;
    }
    f.beforeKey=e=>{
     if(m==='arrow'&&e.key==='ArrowDown')e.preventDefault();
     if(m==='home'&&e.key==='Home') {
      e.preventDefault();el.selectedIndex=1;c.componentState._selectedOption=c.componentState._shuffledOptions[1];
     }
    };
    f.afterChange=()=>{
     if(m==='cache')c.componentState._selectedOption=null;
     if(m==='identity')f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};
    };
   },mutation);
   const run=factory(), result=await run(page);
   assert.equal(result.reason,'selection-not-verified-may-be-partial',mutation);
   assert.deepEqual(result.selectionDiagnostic,{phase,dropdownIndex:0,keyDispatchesReturned:keys,guard},mutation);
   assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[keys,0,0],mutation);
   assert.equal((await run(page)).reason,'attempt-consumed');
  }
  await scenario('focus','focus','focus-mismatch',0);
  await scenario('home','after-home','selected-index-mismatch',1);
  await scenario('arrow','after-arrow','selected-index-mismatch',2);
  await scenario('cache','after-arrow','cached-selection-identity',2);
  await scenario('identity','after-arrow','baseline-changed',2);
  await setup();
  const replaced=factory(async(p,d,o)=>{
   await p.evaluate(()=>{dropdownFixture.self.model._currentQuestion={...dropdownFixture.q};});
   return playDropdownRound(p,d,o);
  });
  const result=await replaced(page);
  assert.equal(result.status,'stopped');
  assert.deepEqual(result.selectionDiagnostic,{phase:'baseline',dropdownIndex:null,keyDispatchesReturned:0,guard:'baseline-changed'});
  assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[0,0,0]);
  assert.equal((await replaced(page)).reason,'attempt-consumed');
  console.log('Dropdown selection diagnostic browser PASS: same-read guards/phases/counts; zero Submit/Next on failure; permanently consumed. Synthetic Linux only.');
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
testDiagnostics().catch(error=>{console.error(error);process.exitCode=1;});
