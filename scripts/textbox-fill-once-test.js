const {assertTextboxFillProof}=require('./textbox-fill-proof');
const assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question'),{playTextboxRound}=require('../lib/textbox-handler');
const {createFillTextboxesOnce}=require('../lib/textbox-fill-once');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
const setup=()=>page.goto(origin+'/lesson-textbox'),factory=()=>createFillTextboxesOnce({detectQuestion,playTextboxRound});
await setup();const once=factory();assert.deepEqual(await once(page),{status:'filled-only'});await assertTextboxFillProof(page);
// Negative controls prove the oracle rejects trust/answer/state failures and detects navigation.
for(const mutation of ['trust','dom','cache','unset','next','advance']){
 await page.evaluate(m=>{const f=textboxFixture,c=f.base['box-b'][0];if(m==='trust')f.inputs[0].trusted=false;if(m==='dom')c.textBox.value='wrong';if(m==='cache')c.componentState.userAnswer='wrong';if(m==='unset')c.componentState.isUserAnswerSet=false;if(m==='advance')f.q.questionIndex++;if(m==='next'){const button=document.querySelector('#sa-navigation-controls button'),clone=button.cloneNode(true);clone.textContent='Next Question';button.parentElement.append(clone);clone.click();clone.remove();}},mutation);
 if(mutation==='next')assert.equal(await page.evaluate(()=>textboxFixture.nexts),1);
 if(mutation==='advance')assert.equal(await page.evaluate(()=>textboxFixture.q.questionIndex-textboxFixture.initialQuestionIndex),1);
 await assert.rejects(()=>assertTextboxFillProof(page),{name:'AssertionError',code:'ERR_ASSERTION'});
 await page.evaluate(()=>{const f=textboxFixture,c=f.base['box-b'][0];f.inputs[0].trusted=true;c.textBox.value='beta';c.componentState.userAnswer='beta';c.componentState.isUserAnswerSet=true;f.nexts=0;f.q.questionIndex=f.initialQuestionIndex;});
 await assertTextboxFillProof(page);
}
await setup();assert.equal((await once(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>textboxFixture.inputs.length),0);
for(const mutation of ['prefill','stored','manual','numeric','metadata']){await setup();await page.evaluate(m=>{const f=textboxFixture,b=f.group.querySelector('input'),c=Object.values(f.base)[0][0];if(m==='prefill')b.value='x';if(m==='stored'){c.componentState.userAnswer='x';c.componentState.isUserAnswerSet=true;}if(m==='manual')f.self.sectionData.activityGroup.isAutoMarked=false;if(m==='numeric')b.type='number';if(m==='metadata')c.componentState.metadataInstance.Options=['wrong'];},mutation);const run=factory();assert.equal((await run(page)).status,'refused',mutation);assert.equal((await run(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[0,0]);}
await setup();const cancel=factory();assert.equal((await cancel(page,{shouldStop:()=>true})).status,'aborted');assert.equal((await cancel(page)).reason,'attempt-consumed');assert.equal(await page.evaluate(()=>textboxFixture.inputs.length),0);
await setup();let stop=false;await page.exposeFunction('testStopTextbox',()=>{stop=true;});await page.evaluate(()=>document.addEventListener('input',()=>{window.testStopTextbox();},{once:true}));const interrupted=factory();assert.equal((await interrupted(page,{shouldStop:()=>stop})).status,'stopped');assert.equal((await interrupted(page)).reason,'attempt-consumed');assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[1,0]);
let release,calls=0;const wait=new Promise(r=>release=r),locked=createFillTextboxesOnce({detectQuestion:async()=>{calls++;await wait;return null;},playTextboxRound});const first=locked(page);assert.equal((await locked(page)).reason,'attempt-consumed');release();await first;assert.equal(calls,1);
console.log('Textbox fill-once browser:9trustedchars/0Submit/0Next, consumedsuccess/refusal/cancel/partial/overlap,5initialrefusals0input PASS. Synthetic only.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
