const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const {createServer} = require('./mock-ep');
const {detectQuestion} = require('../lib/detect-question');
const {playDropdownRound} = require('../lib/dropdown-handler');
const {readDropdownsInPage} = require('../lib/dropdown-state');
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
     if(m==='hidden')f.group.querySelectorAll('select').forEach(select=>{select.hidden=true;});
     if(m==='missing')document.querySelector('#ep-question-container').remove();
    };
   },mutation);
   const run=factory(), result=await run(page);
   assert.equal(result.reason,'selection-not-verified-may-be-partial',mutation);
   const {nativeState,...diagnostic}=result.selectionDiagnostic;
   assert.deepEqual(diagnostic,{phase,dropdownIndex:0,keyDispatchesReturned:keys,guard},mutation);
   if(mutation==='arrow')assert.deepEqual(nativeState,{actual:[0,0,0,0,0],expected:[1,0,0,0,0],focusedDropdownIndex:0});
   if(mutation==='focus')assert.equal(nativeState.focusedDropdownIndex,1);
   if(mutation==='home')assert.deepEqual(nativeState.actual,[1,0,0,0,0]);
   assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[keys,0,0],mutation);
   assert.equal((await run(page)).reason,'attempt-consumed');
  }
  async function delayedKey(mutation) {
   await setup();
   await page.evaluate(m=>{
    const f=dropdownFixture;
    let delayed=false;
    f.beforeKey=e=>{
     if(e.key!=='ArrowDown'||delayed)return;
     delayed=true;e.preventDefault();
     const select=e.target,component=f.base[select.id][0];
     setTimeout(()=>{
      if(m==='identity'){f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};return;}
      if(m==='focus'){f.base['dropdown-1'][0].dropDownList.focus();return;}
      select.selectedIndex=1;
      component.componentState._selectedOption=component.componentState._shuffledOptions[1];
     },60);
    };
   },mutation);
   const run=factory(),result=await run(page);
   if(mutation==='settle') {
    assert.equal(result.status,'submitted-once');
    assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[15,1,0]);
   } else {
    assert.equal(result.selectionDiagnostic.guard,mutation==='identity'?'baseline-changed':'focus-mismatch');
    assert.equal(result.selectionDiagnostic.keyDispatchesReturned,2);
    assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[2,0,0]);
   }
   assert.equal((await run(page)).reason,'attempt-consumed');
  }
  async function slowSuccessfulRead() {
   await setup();
   const evaluate=page.evaluateHandle.bind(page);
   let delayed=false;
   page.evaluateHandle=async(fn,...args)=>{
    if(!delayed&&args[1]===0&&await page.evaluate(()=>dropdownFixture.keys.length===2)) {
     delayed=true;
     await new Promise(resolve=>setTimeout(resolve,230));
    }
    return evaluate(fn,...args);
   };
   try {
    const run=factory(),result=await run(page);
    assert.equal(result.selectionDiagnostic.guard,'key-state-did-not-settle');
    assert.equal(result.selectionDiagnostic.keyDispatchesReturned,2);
    assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[2,0,0]);
    assert.equal((await run(page)).reason,'attempt-consumed');
   } finally {page.evaluateHandle=evaluate;}
  }
  await slowSuccessfulRead();
  await delayedKey('settle');
  await delayedKey('identity');
  await delayedKey('focus');
  await scenario('focus','focus','focus-mismatch',0);
  await scenario('home','after-home','selected-index-mismatch',1);
  await scenario('arrow','after-arrow','key-state-did-not-settle',2);
  await scenario('cache','after-arrow','cached-selection-identity',2);
  await scenario('identity','after-arrow','baseline-changed',2);
  await scenario('hidden','after-arrow','no-visible-selects',2);
  await scenario('missing','after-arrow','missing-question-container',2);
  async function rejectedDispatch(key,returned,delivered) {
   await setup();
   const element=await page.$('select'), prototype=Object.getPrototypeOf(element);
   const original=prototype.press;
   prototype.press=async function(value,...args) {
    if(value===key) {
     if(delivered)await original.call(this,value,...args);
     throw new Error('synthetic dispatch rejection');
    }
    return original.call(this,value,...args);
   };
   try {
    const run=factory(), result=await run(page);
    assert.deepEqual(result.selectionDiagnostic,{phase:key==='Home'?'home-dispatch':'arrow-dispatch',dropdownIndex:0,keyDispatchesReturned:returned,guard:'inspection-or-dispatch-uncertain'});
    assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[returned+Number(delivered),0,0]);
    assert.equal((await run(page)).reason,'attempt-consumed');
   } finally {prototype.press=original;await element.dispose();}
  }
  await rejectedDispatch('Home',0,false);
  await rejectedDispatch('Home',0,true);
  await rejectedDispatch('ArrowDown',1,false);
  await rejectedDispatch('ArrowDown',1,true);
  await setup();
  const preflight=createSubmitDropdownOnce({playDropdownRound,detectQuestion:async p=>{
   const d=await detectQuestion(p);
   await p.evaluate(()=>{dropdownFixture.q.questionIndex++;});
   return d;
  }});
  const preflightResult=await preflight(page);
  assert.equal(preflightResult.reason,'changed-before-selection');
  assert.deepEqual(preflightResult.selectionDiagnostic,{phase:'preflight',dropdownIndex:null,keyDispatchesReturned:0,guard:'descriptor-mismatch'});
  assert.equal((await preflight(page)).reason,'attempt-consumed');
  assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[0,0,0]);
  await setup();
  await page.evaluate(()=>{document.querySelector('#ep-question-container').remove();});
  assert.equal(await page.evaluate(readDropdownsInPage),null);
  assert.deepEqual(await page.evaluate(readDropdownsInPage,undefined,undefined,true),{guard:'missing-question-container'});
  await setup();
  const timedOut=await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:0});
  assert.deepEqual(timedOut.selectionDiagnostic,{phase:'post-selection',dropdownIndex:4,keyDispatchesReturned:15,guard:'result-not-confirmed'});
  assert.deepEqual(await page.evaluate(()=>[dropdownFixture.submits,dropdownFixture.nexts]),[1,0]);
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
