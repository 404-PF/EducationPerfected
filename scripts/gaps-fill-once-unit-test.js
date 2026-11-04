const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const { createFillGapsOnce } = require('../lib/gaps-fill-once');
(async()=>{
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    let browser;
    try {
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH || undefined});
        const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
        const setup=()=>page.goto(origin+'/lesson-gaps');
        const run=createFillGapsOnce({detectQuestion,playGapsRound});
        await setup();
        assert.deepEqual(await createFillGapsOnce({detectQuestion,playGapsRound})(page),{status:'filled-only'});
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits,gapsFixture.q.questionIndex]),[[{index:2,trusted:true},{index:1,trusted:true}],0,0]);
        assert.equal((await createFillGapsOnce({detectQuestion,playGapsRound})(page)).status,'refused'); // no retry on filled state
        assert.equal(await page.evaluate(()=>gapsFixture.inputs.length),2);
        await setup();assert.equal((await createFillGapsOnce({detectQuestion,playGapsRound})(page,{shouldStop:()=>true})).status,'aborted');
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        await setup();await page.evaluate(()=>{gapsFixture.afterInput=()=>{gapsFixture.metadata.Gaps[0].CorrectOptions=['wrong'];};});
        assert.equal((await createFillGapsOnce({detectQuestion,playGapsRound})(page)).status,'stopped');
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[1,0]);
        await page.goto(origin+'/lesson');assert.equal((await createFillGapsOnce({detectQuestion,playGapsRound})(page)).status,'refused');
        await setup();assert.equal((await run(page)).status,'filled-only');await setup();assert.equal((await run(page)).status,'refused');
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        let release;const waiting=new Promise(r=>release=r);let calls=0;
        const lock=createFillGapsOnce({detectQuestion:async()=>{calls++;await waiting;return null;},playGapsRound});
        const first=lock(page);assert.equal((await lock(page)).status,'refused');release();await first;assert.equal(calls,1);
        console.log('One-shot browser-unit fixtures: exact2trustedinputs/0submit/noadvance; prefillrefusal; cancelled0input; mutationstops1input0submit; nongapsrefusal; overlaprefusal PASS');
    }finally{try{if(browser)await browser.close();}finally{await new Promise(r=>server.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
