const assert=require('node:assert/strict');const {bootFixtureCli}=require('./fixture-cli-session');
(async()=>{const session=await bootFixtureCli('validate-multi-select.js','Commands: select once');const {page,child,origin,wait}=session;
try{
 await page.goto(origin+'/lesson-multi');await page.evaluate(()=>{const f=multiFixture;f.trusted=[];document.addEventListener('click',e=>{const b=e.target.closest('#sa-navigation-controls button');if(b&&b.textContent.trim()!=='Submit')f.nexts++;if(e.target.closest('.mcq-preview-option'))f.trusted.push(e.isTrusted);},true);});
 await page.evaluate(()=>window.startAnswer());child.stdin.write('start\nmode auto\nrefresh\n');await wait(()=>(session.output.match(/Use select once/g)||[]).length>=3);assert.equal(await page.evaluate(()=>multiFixture.clicks.length),0);
 child.stdin.write('select once\n');await wait(()=>session.output.includes('EP_MULTI_SELECT_ONCE {"status":"selected-only"}'));
 assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks,multiFixture.trusted,multiFixture.state.selectedOptions.sort(),multiFixture.submits,multiFixture.nexts,multiFixture.q.questionIndex]),[[2,0],[true,true],[0,2],0,0,0]);
 await page.goto(origin+'/lesson-multi');child.stdin.write('select once\n');await wait(()=>session.output.includes('Attempt already consumed'));await page.evaluate(()=>window.startAnswer());assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[0,0]);
 child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);assert.equal(child.exitCode,0);
 console.log('Multi-select once realCLI PASS: stoppedboot/browserstart/start/mode/refreshblocked,2trustedclicks0Submit0Next/exactcache,noadvance,newpagerepeatrefused,quit. Synthetic only.');
}finally{await session.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1;});
