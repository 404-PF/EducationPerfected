const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin+'/lesson-textbox');
        child.stdin.write('mode semi\n');
        await wait(()=>session.output.includes('"mode":"semi"'));
        await page.keyboard.down('Alt'); await page.keyboard.press('s'); await page.keyboard.up('Alt');
        await wait(()=>session.output.includes('Filled exact lesson textbox answers.'));
        assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[9,0]);
        child.stdin.write('stop\n');
        await wait(()=>session.output.includes('"state":"stopped","mode":"semi"'));
        await page.goto(origin+'/lesson-textbox');
        await page.evaluate(()=>{
            const submit=document.querySelector('#sa-navigation-controls button');
            submit.addEventListener('click',()=>{
                textboxFixture.group.remove();
                document.querySelector('#question-container-group').remove();
                textboxFixture.self.model._currentQuestion=null;
                const exit=document.querySelector('button.exit-button');exit.hidden=false;exit.style.display='';
            });
        });
        child.stdin.write('mode auto\n');
        await wait(()=>session.output.includes('"mode":"auto"'));
        const offset=session.output.length;child.stdin.write('start\n');
        await wait(()=>session.output.slice(offset).includes('Lesson completed.'));
        assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[9,1]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log('Textbox real-program fixture: Alt+S semi-only9chars/0Submit, stop, normalCLIauto9chars/1Submit/provencompletion/cleanquit PASS. Synthetic only.');
    } finally { await session.cleanup(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
