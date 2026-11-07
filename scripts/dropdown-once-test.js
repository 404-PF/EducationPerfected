const assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep'),{detectQuestion}=require('../lib/detect-question');
const {playDropdownRound}=require('../lib/dropdown-handler'),{createSubmitDropdownOnce}=require('../lib/dropdown-once');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
const setup=async()=>{await page.goto(origin+'/lesson-dropdown');await page.evaluate(()=>{const f=dropdownFixture;f.submitTrusted=[];document.addEventListener('click',e=>{if(e.target.closest('#sa-navigation-controls button')?.textContent.trim()==='Submit')f.submitTrusted.push(e.isTrusted);},true);const b=document.querySelector('#sa-navigation-controls button'),clone=b.cloneNode(true);clone.textContent='Next Question';b.parentElement.append(clone);clone.click();clone.remove();});assert.equal(await page.evaluate(()=>dropdownFixture.nexts),1);await page.evaluate(()=>{dropdownFixture.nexts=0;});};
const factory=(play=playDropdownRound)=>createSubmitDropdownOnce({detectQuestion,playDropdownRound:play});
await setup();const once=factory();assert.deepEqual(await once(page),{status:'submitted-once'});
assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.keys.every(e=>e.trusted),dropdownFixture.changes.length,dropdownFixture.changes.every(e=>e.trusted),dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.q.questionIndex,dropdownFixture.submitTrusted]),[15,true,10,true,1,0,1,[true]]);
const answers=['Radius','Circumference','Circumference','2','Radius'];assert.deepEqual(await page.evaluate(()=>dropdownFixture.submittedSelections),answers.map(a=>[a,a]));
if(process.env.EP_DROPDOWN_ONCE_SCREENSHOT)await page.screenshot({path:process.env.EP_DROPDOWN_ONCE_SCREENSHOT});
await setup();assert.equal((await once(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
for(const mutation of ['prefilled','manual','assessment','missing','mixed','default']){
 await setup();await page.evaluate(m=>{const f=dropdownFixture,c=f.base['dropdown-0'][0];if(m==='prefilled'){c.dropDownList.selectedIndex=2;c.componentState._selectedOption=c.componentState._shuffledOptions[2];}if(m==='manual')f.self.sectionData.activityGroup.isAutoMarked=false;if(m==='assessment')f.self.model.gameMode=2;if(m==='missing')delete f.q.cachedRenderers;if(m==='mixed')f.q.questionDef.Components.push({ComponentTypeCode:'TEXT_BOX_COMPONENT'});if(m==='default')delete c.componentState.metadataInstance.DefaultSelection;},mutation);
 const run=factory();assert.equal((await run(page)).status,'refused',mutation);assert.equal((await run(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[0,0,0]);
}
for(const mutation of ['answer','identity','advance','ineffective']){
 await setup();await page.evaluate(m=>{const f=dropdownFixture;f.afterChange=()=>{const c=f.base['dropdown-0'][0];if(m==='answer')c.componentState.metadataInstance.Options[1].Correct='false';if(m==='identity')f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};if(m==='advance')f.q.questionIndex++;if(m==='ineffective')c.componentState._selectedOption=null;};},mutation);
 const run=factory();assert.equal((await run(page)).status,'stopped',mutation);assert.equal((await run(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[2,0,0]);
}
// Same-read diagnostics distinguish zero-visible-change stops without another key or poll.
for(const [mutation,phase,guard,keys] of [
 ['focus','focus','focus-mismatch',0],
 ['home','after-home','selected-index-mismatch',1],
 ['arrow','after-arrow','selected-index-mismatch',2],
 ['cache','after-arrow','cached-selection-identity',2],
 ['identity','after-arrow','baseline-changed',2]
]){
 await setup();await page.evaluate(m=>{
  const f=dropdownFixture,c=f.base['dropdown-0'][0],el=c.dropDownList;
  if(m==='focus'){el.addEventListener('focus',()=>f.base['dropdown-1'][0].dropDownList.focus());return;}
  f.beforeKey=e=>{
   if(m==='arrow'&&e.key==='ArrowDown')e.preventDefault();
   if(m==='home'&&e.key==='Home'){e.preventDefault();el.selectedIndex=1;c.componentState._selectedOption=c.componentState._shuffledOptions[1];}
  };
  f.afterChange=()=>{
   if(m==='cache')c.componentState._selectedOption=null;
   if(m==='identity')f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};
  };
 },mutation);
 const run=factory(),result=await run(page);
 assert.equal(result.reason,'selection-not-verified-may-be-partial',mutation);
 assert.deepEqual(result.selectionDiagnostic,{phase,dropdownIndex:0,keyDispatchesReturned:keys,guard},mutation);
 assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[keys,0,0],mutation);
 assert.equal((await run(page)).reason,'attempt-consumed');
}
// The final reader is bound to the baseline before any input, not a new snapshot.
for(const mutation of ['renderer','answer','button','covered','cancel']){
 await setup();let cancelled=false;const run=factory(async(...args)=>{const result=await playDropdownRound(...args);await page.evaluate(m=>{const f=dropdownFixture;if(m==='renderer')f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};if(m==='answer')f.base['dropdown-0'][0].componentState.metadataInstance.Options[1].Correct='false';if(m==='button')document.querySelector('#sa-navigation-controls button').disabled=true;if(m==='covered'){const cover=document.createElement('div');Object.assign(cover.style,{position:'fixed',inset:'0',zIndex:'999999',background:'white'});document.body.append(cover);}},mutation);if(mutation==='cancel')cancelled=true;return result;});
 const result=await run(page,{shouldStop:()=>cancelled});assert.equal(result.status,mutation==='cancel'?'aborted':'stopped',mutation);assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[15,0,0]);assert.equal((await run(page)).reason,'attempt-consumed');
}
await setup();let cancelled=false;await page.exposeFunction('cancelOnceTest',()=>{cancelled=true;});await page.evaluate(()=>{dropdownFixture.afterChange=()=>window.cancelOnceTest();});const cancelledRun=factory();assert.equal((await cancelledRun(page,{shouldStop:()=>cancelled})).status,'aborted');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[2,0]);assert.equal((await cancelledRun(page)).reason,'attempt-consumed');
await setup();const early=factory();assert.equal((await early(page,{shouldStop:()=>true})).status,'aborted');assert.equal((await early(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
// Simulate uncertain mouse dispatch after it landed. No retry even on a new page.
await setup();const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{await click(...args);throw Error('uncertain dispatch');};const uncertain=factory();assert.equal((await uncertain(page)).status,'stopped');assert.equal(await page.evaluate(()=>dropdownFixture.submits),1);page.mouse.click=click;await setup();assert.equal((await uncertain(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
await setup();const replaced=factory(async(p,d,o)=>{await p.evaluate(()=>{dropdownFixture.self.model._currentQuestion={...dropdownFixture.q};});return playDropdownRound(p,d,o);});const replacementResult=await replaced(page);assert.equal(replacementResult.status,'stopped');assert.deepEqual(replacementResult.selectionDiagnostic,{phase:'baseline',dropdownIndex:null,keyDispatchesReturned:0,guard:'baseline-changed'});assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[0,0]);assert.equal((await replaced(page)).reason,'attempt-consumed');
// Negative control demonstrates the replacement would otherwise receive input.
await setup();const unbound=factory(async(p,d,o)=>{await p.evaluate(()=>{dropdownFixture.self.model._currentQuestion={...dropdownFixture.q};});const {baseline,...without}=o;return playDropdownRound(p,d,without);});assert.equal((await unbound(page)).status,'stopped');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[15,0]);
// Logging alone is not the verification checkpoint.
await setup();const logOnly=factory(async(p,d,o)=>{o.log?.('Unrelated diagnostic.');return{status:'aborted'};});assert.equal((await logOnly(page)).status,'aborted');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[0,0]);assert.equal((await logOnly(page)).reason,'attempt-consumed');
let release,calls=0;const wait=new Promise(r=>release=r),locked=createSubmitDropdownOnce({detectQuestion:async()=>{calls++;await wait;return null;},playDropdownRound});const first=locked(page);assert.equal((await locked(page)).reason,'attempt-consumed');release();await first;assert.equal(calls,1);
console.log('Dropdown once browser PASS:15trustedkeys/10trustedchanges/exactDOMcacheat1trustedSubmit/0Next/advance1,6initialrefusals,4postkeystops,5postfillstops,cancel,uncertaindispatch,repeatnewpage,overlap. Synthetic Linux only.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
