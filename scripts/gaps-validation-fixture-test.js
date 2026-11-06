const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { cleanupTestProcess } = require('./test-process-cleanup');
const { installGapsFixture } = require('./gaps-fixture');
async function testGapsValidation(submit, repeated = false) {
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    const env={...process.env,EP_TEST_BOOT:'1',EP_LOGIN_URL:origin+'/app/login',EP_LOGIN_HOST:'127.0.0.1'};
    delete env.EP_EMAIL;delete env.EP_PASSWORD;
    const child=spawn(process.execPath,[path.join(__dirname,submit ? '../bin/validate-gaps-submit.js' : '../bin/validate-gaps-fill.js')],{env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
    let output='',browser;
    child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});
    const wait=async predicate=>{const end=Date.now()+20000;while(!predicate()){if(child.exitCode!==null||Date.now()>end)throw new Error('Validation checkpoint failed: '+output);await new Promise(r=>setTimeout(r,20));}};
    try {
        await wait(()=>/EP_WS_ENDPOINT=(\S+)/.test(output));
        browser=await puppeteer.connect({browserWSEndpoint:output.match(/EP_WS_ENDPOINT=(\S+)/)[1]});
        await browser.waitForTarget(target=>target.type()==='page');
        const page=(await browser.pages())[0];await page.waitForSelector('#loginId');
        await wait(()=>output.includes('EP_TEST_LOGIN_READY'));
        await page.type('#loginId','fixture-user');await page.type('#password','fixture-only');await page.click('form button');
        await wait(()=>output.includes(`Commands: ${submit ? 'submit' : 'fill'} once`));
        await page.goto(origin+(repeated ? '/lesson' : '/lesson-gaps'));
        if (repeated) await page.evaluate(installGapsFixture, {repeated:true});
        await page.evaluate(() => {
            document.addEventListener('click', e => {
                const button = e.target.closest('#sa-navigation-controls button');
                if (button && button.textContent.trim() !== 'Submit') gapsFixture.nexts++;
            }, true);
        });
        // Negative control: counter must detect an actual non-Submit navigation click.
        await page.evaluate(() => {
            const button = document.querySelector('#sa-navigation-controls button');
            const clone = button.cloneNode(true);
            clone.textContent = 'Next Question';
            button.parentElement.append(clone);
            clone.click();
            clone.remove();
        });
        assert.equal(await page.evaluate(() => gapsFixture.nexts), 1);
        await page.evaluate(() => { gapsFixture.nexts = 0; });
        const instruction = await page.evaluate(()=>window.startAnswer());
        assert.equal(instruction, 'Validation session: use the approved terminal one-shot command.');
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('start\nmode auto\n');
        await wait(()=>(output.match(new RegExp(`Use ${submit ? 'submit' : 'fill'} once`,'g'))||[]).length>=2);
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write(`${submit ? 'submit' : 'fill'} once\n`);
        await wait(()=>output.includes(submit ? 'EP_SUBMIT_ONCE {"status":"submitted-once"}' : 'EP_FILL_ONCE {"status":"filled-only"}'));
        const expected = (repeated ? [0,4,3,5] : [2,1]).map(index => ({index,trusted:true}));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits,gapsFixture.q.questionIndex]),[expected,submit ? 1 : 0,submit ? 1 : 0]);
        await new Promise(r=>setTimeout(r,300));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits,gapsFixture.nexts,gapsFixture.q.questionIndex]),[expected.length,submit ? 1 : 0,0,submit ? 1 : 0]);
        await page.goto(origin+'/lesson-gaps'); // Even a new empty page cannot consume a second attempt.
        child.stdin.write(`${submit ? 'submit' : 'fill'} once\n`);await wait(()=>output.includes('Attempt already consumed'));
        await page.evaluate(()=>window.startAnswer());
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log(`One-shot ${repeated ? 'repeated exact labels' : 'unique labels'} ${submit ? 'Submit' : 'fill'} real-program fixture: stoppedboot, hotkey/start/mode blocked, exactfill, ${submit ? '1submit/automaticadvance1' : '0submit/noadvance'}, instrumented0Next/noinputonfollowingquestion, permanent repeat refusal, cleanquit PASS`);
    } finally {
        try { browser?.disconnect(); if(child.exitCode===null)cleanupTestProcess(child); } finally { await new Promise(r=>server.close(r)); }
    }
}
module.exports = { testGapsValidation };
