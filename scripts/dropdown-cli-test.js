const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin+'/lesson-dropdown');
        assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
        await page.evaluate(()=>{const b=document.querySelector('#sa-navigation-controls button'),clone=b.cloneNode(true);clone.textContent='Next Question';b.parentElement.append(clone);clone.click();clone.remove();});
        assert.equal(await page.evaluate(()=>dropdownFixture.nexts),1);await page.evaluate(()=>{dropdownFixture.nexts=0;});
        child.stdin.write('mode semi\n');
        await wait(()=>session.output.includes('"mode":"semi"'));
        await page.keyboard.down('Alt'); await page.keyboard.press('s'); await page.keyboard.up('Alt');
        await wait(()=>session.output.includes('Selected exact lesson dropdown answers.'));
        assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.keys.every(e=>e.trusted),dropdownFixture.changes.every(e=>e.trusted),dropdownFixture.submits,dropdownFixture.nexts]),[15,true,true,0,0]);
        child.stdin.write('stop\n');
        await wait(()=>session.output.includes('"state":"stopped","mode":"semi"'));
        await page.goto(origin+'/lesson-dropdown');
        await page.evaluate(()=>{
            const submit=document.querySelector('#sa-navigation-controls button');
            submit.addEventListener('click',()=>{
                dropdownFixture.group.remove();
                document.querySelector('#question-container-group').remove();
                dropdownFixture.self.model._currentQuestion=null;
                const exit=document.querySelector('button.exit-button');exit.hidden=false;exit.style.display='';
            });
        });
        child.stdin.write('mode auto\n');
        await wait(()=>session.output.includes('"mode":"auto"'));
        const offset=session.output.length;child.stdin.write('start\n');
        await wait(()=>session.output.slice(offset).includes('Lesson completed.'));
        assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.keys.every(e=>e.trusted),dropdownFixture.changes.every(e=>e.trusted),dropdownFixture.submits,dropdownFixture.nexts]),[15,true,true,1,0]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log('Dropdown real-program fixture: stoppedboot, Alt+S semi15trustedkeys/0Submit, stop, auto15trustedkeys/1Submit/provencompletion/0Next/cleanquit PASS. Synthetic Linux only.');
    } finally { await session.cleanup(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
