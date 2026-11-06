const assert=require('node:assert/strict'),{bootFixtureCli}=require('./fixture-cli-session');
(async()=>{const session=await bootFixtureCli('validate-dropdown.js','Commands: submit once');const {page,child,origin,wait}=session;
try{
 await page.goto(origin+'/lesson-dropdown');await page.evaluate(()=>{dropdownFixture.submitTrusted=[];document.addEventListener('click',e=>{if(e.target.closest('#sa-navigation-controls button')?.textContent.trim()==='Submit')dropdownFixture.submitTrusted.push(e.isTrusted);},true);});
 await page.evaluate(()=>window.startAnswer());await page.keyboard.down('Alt');await page.keyboard.press('s');await page.keyboard.up('Alt');child.stdin.write('start\nmode auto\nrefresh\n');await wait(()=>(session.output.match(/Use submit once/g)||[]).length>=3);assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
 child.stdin.write('submit once\n');await wait(()=>session.output.includes('EP_DROPDOWN_ONCE {"status":"submitted-once"}'));
 assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.keys.every(e=>e.trusted),dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.q.questionIndex,dropdownFixture.submitTrusted]),[15,true,1,0,1,[true]]);
 assert.deepEqual(await page.evaluate(()=>dropdownFixture.submittedSelections),['Radius','Circumference','Circumference','2','Radius'].map(a=>[a,a]));
 await new Promise(r=>setTimeout(r,150));assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),15);
 await page.goto(origin+'/lesson-dropdown');child.stdin.write('submit once\n');await wait(()=>session.output.includes('Attempt already consumed'));await page.evaluate(()=>window.startAnswer());assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[0,0]);
 child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);assert.equal(child.exitCode,0);
 console.log('Dropdown once realCLI PASS: stoppedboot/hotkey/browserstart/start/mode/refreshblocked,15trustedkeys/oneSubmit/exactcache/0Next/advance1,no following-question input,newpagerepeatrefused,quit. Synthetic only.');
}finally{await session.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1;});
