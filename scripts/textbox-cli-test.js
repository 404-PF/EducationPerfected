const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { cleanupTestProcess } = require('./test-process-cleanup');
(async () => {
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    const env={...process.env,EP_TEST_BOOT:'1',EP_LOGIN_URL:origin+'/app/login',EP_LOGIN_HOST:'127.0.0.1'};
    delete env.EP_EMAIL;delete env.EP_PASSWORD;
    const child=spawn(process.execPath,[path.join(__dirname,'../bin/cli.js')],{env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
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
        await wait(()=>output.includes('Commands: start'));
        await page.goto(origin+'/lesson-textbox');
        child.stdin.write('mode semi\n');
        await wait(()=>output.includes('"mode":"semi"'));
        await page.keyboard.down('Alt'); await page.keyboard.press('s'); await page.keyboard.up('Alt');
        await wait(()=>output.includes('Filled exact lesson textbox answers.'));
        assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[9,0]);
        child.stdin.write('stop\n');
        await wait(()=>output.includes('"state":"stopped","mode":"semi"'));
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
        await wait(()=>output.includes('"mode":"auto"'));
        const offset=output.length;child.stdin.write('start\n');
        await wait(()=>output.slice(offset).includes('Lesson completed.'));
        assert.deepEqual(await page.evaluate(()=>[textboxFixture.inputs.length,textboxFixture.submits]),[9,1]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log('Textbox real-program fixture: Alt+S semi-only9chars/0Submit, stop, normalCLIauto9chars/1Submit/provencompletion/cleanquit PASS. Synthetic only.');
    } finally {
        try { browser?.disconnect(); if(child.exitCode===null)cleanupTestProcess(child); } finally { await new Promise(r=>server.close(r)); }
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
