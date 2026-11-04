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
    const child=spawn(process.execPath,[path.join(__dirname,'../bin/validate-gaps-fill.js')],{env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
    let output='',browser;
    child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});
    const wait=async predicate=>{const end=Date.now()+20000;while(!predicate()){if(child.exitCode!==null||Date.now()>end)throw new Error('Validation checkpoint failed: '+output);await new Promise(r=>setTimeout(r,20));}};
    try {
        await wait(()=>/EP_WS_ENDPOINT=(\S+)/.test(output));
        browser=await puppeteer.connect({browserWSEndpoint:output.match(/EP_WS_ENDPOINT=(\S+)/)[1]});
        await browser.waitForTarget(target=>target.type()==='page');
        const page=(await browser.pages())[0];await page.waitForSelector('#loginId');
        await page.type('#loginId','fixture-user');await page.type('#password','fixture-only');await page.click('form button');
        await wait(()=>output.includes('Commands: fill once'));
        await page.goto(origin+'/lesson-gaps');
        await page.evaluate(()=>window.startAnswer());
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('start\nmode auto\n');
        await wait(()=>output.includes('Use fill once'));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('fill once\n');
        await wait(()=>output.includes('EP_FILL_ONCE {"status":"filled-only"}'));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits,gapsFixture.q.questionIndex]),[[{index:2,trusted:true},{index:1,trusted:true}],0,0]);
        await page.goto(origin+'/lesson-gaps'); // Even a new empty page cannot consume a second attempt.
        child.stdin.write('fill once\n');await wait(()=>output.includes('Attempt already consumed'));
        await page.evaluate(()=>window.startAnswer());
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log('One-shot real-program fixture: stoppedboot, hotkey/start/mode blocked, exactfill, 0submit/noadvance, permanentrepeatrefusal after newpage, cleanquit PASS');
    } finally {
        try { browser?.disconnect(); if(child.exitCode===null)cleanupTestProcess(child); } finally { await new Promise(r=>server.close(r)); }
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
