const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
(async () => {
    const session = await bootFixtureCli('validate-gaps-fill.js', 'Commands: fill once');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin+'/lesson-gaps');
        await page.evaluate(()=>window.startAnswer());
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('start\nmode auto\n');
        await wait(()=>session.output.includes('Use fill once'));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('fill once\n');
        await wait(()=>session.output.includes('EP_FILL_ONCE {"status":"filled-only"}'));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits,gapsFixture.q.questionIndex]),[[{index:2,trusted:true},{index:1,trusted:true}],0,0]);
        await page.goto(origin+'/lesson-gaps'); // Even a new empty page cannot consume a second attempt.
        child.stdin.write('fill once\n');await wait(()=>session.output.includes('Attempt already consumed'));
        await page.evaluate(()=>window.startAnswer());
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0]);
        child.stdin.write('status\nquit\n');await wait(()=>child.exitCode!==null);
        assert.equal(child.exitCode,0);
        console.log('One-shot real-program fixture: stoppedboot, hotkey/start/mode blocked, exactfill, 0submit/noadvance, permanentrepeatrefusal after newpage, cleanquit PASS');
    } finally { await session.cleanup(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
