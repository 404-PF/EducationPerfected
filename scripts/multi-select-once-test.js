const assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');const {installMultiChoiceFixture}=require('./multi-choice-fixture');
const {detectQuestion}=require('../lib/detect-question');const {playMultiChoiceSelection}=require('../lib/multi-choice-handler');
const {createSelectMultiOnce}=require('../lib/multi-select-once');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await puppeteer.launch({headless:true});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
const setup=async()=>{await page.goto(origin+'/lesson');await page.evaluate(installMultiChoiceFixture);await page.evaluate(()=>{
 const f=multiFixture;f.trusted=[];document.addEventListener('click',e=>{const b=e.target.closest('#sa-navigation-controls button');if(b&&b.textContent.trim()!=='Submit')f.nexts++;if(e.target.closest('.mcq-preview-option'))f.trusted.push(e.isTrusted);},true);
 const b=document.querySelector('#sa-navigation-controls button'),clone=b.cloneNode(true);clone.textContent='Next Question';b.parentElement.append(clone);clone.click();clone.remove();
});assert.equal(await page.evaluate(()=>multiFixture.nexts),1);await page.evaluate(()=>{multiFixture.nexts=0;});};
const factory=()=>createSelectMultiOnce({detectQuestion,playMultiChoiceSelection});
await setup();const once=factory();assert.deepEqual(await once(page),{status:'selected-only'});
assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks,multiFixture.trusted,multiFixture.state.selectedOptions.sort(),multiFixture.submits,multiFixture.nexts,multiFixture.q.questionIndex]),[[2,0],[true,true],[0,2],0,0,0]);
assert.deepEqual(await page.evaluate(()=>multiFixture.state.previewOptions.map(p=>[multiFixture.state.originalMultiChoiceOptions.indexOf(p.option),p.isSelected,p.fields.check.checked,p.element.getAttribute('aria-selected')])),[[2,true,true,'true'],[0,true,true,'true'],[1,false,false,null]]);
if(process.env.EP_MULTI_ONCE_SCREENSHOT)await page.screenshot({path:process.env.EP_MULTI_ONCE_SCREENSHOT});
await setup();assert.equal((await once(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>multiFixture.clicks.length),0);
for(const mutation of ['prefilled','manual','assessment','missing','mixed','wrongID','single']){
 await setup();await page.evaluate(m=>{const f=multiFixture;if(m==='prefilled'){const p=f.state.previewOptions[0];p.isSelected=p.fields.check.checked=true;p.element.setAttribute('aria-selected','true');f.state.selectedOptions=[2];}if(m==='manual')f.self.sectionData.activityGroup.isAutoMarked=false;if(m==='assessment')f.self.model.gameMode=2;if(m==='missing')delete f.q.cachedRenderers;if(m==='mixed')f.q.questionDef.Components.push({ComponentTypeCode:'TEXT_BOX_COMPONENT'});if(m==='wrongID')f.state.selectedOptions=[999];if(m==='single')f.comp.AllowMultiSelect=false;},mutation);
 const run=factory();assert.equal((await run(page)).status,'refused',mutation);assert.equal((await run(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits,multiFixture.nexts]),[0,0,0]);
}
for(const mutation of ['answer','identity','advance','ineffective']){
 await setup();await page.evaluate(m=>{const f=multiFixture;if(m==='ineffective')f.ignoreClicks=true;f.mutateOnClick=()=>{if(m==='answer')f.metadata.Options[0].Correct='false';if(m==='identity')f.q.cachedRenderers[1].identifiedComponents.baseComponents[f.comp.ComponentID]=[{...f.component}];if(m==='advance')f.q.questionIndex++;};},mutation);
 const run=factory();assert.equal((await run(page)).status,'stopped',mutation);assert.equal((await run(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits,multiFixture.nexts]),[1,0,0]);
}
await setup();assert.equal((await factory()(page,{shouldStop:()=>true})).status,'aborted');assert.equal(await page.evaluate(()=>multiFixture.clicks.length),0);
let release,calls=0;const wait=new Promise(r=>release=r),locked=createSelectMultiOnce({detectQuestion:async()=>{calls++;await wait;return null;},playMultiChoiceSelection});const first=locked(page);assert.equal((await locked(page)).reason,'attempt-consumed');release();await first;assert.equal(calls,1);
console.log('Multi-select once browser PASS: initially empty, exact2trustedclicks/0Submit/0Next/noadvance, DOM/native/ARIA/cache exact set,7initialrefusals,4postclickstops,cancel0input,processrepeatnewpage and overlap consumed. Synthetic only.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
