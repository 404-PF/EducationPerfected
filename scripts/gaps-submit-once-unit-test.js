const { guardVerifiedPointDispatch } = require('./verified-point-dispatch-fixture');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const { createFillGapsOnce } = require('../lib/gaps-fill-once');
const { createSubmitGapsOnce } = require('../lib/gaps-submit-once');
(async () => {
    const server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage(), origin = 'http://127.0.0.1:' + server.address().port;
        const setup = () => page.goto(origin + '/lesson-gaps');
        const factory = (fillGapsOnce = createFillGapsOnce({ detectQuestion, playGapsRound })) => createSubmitGapsOnce({ fillGapsOnce });
        await setup();
        const once = factory();
        assert.deepEqual(await once(page), { status: 'submitted-once' });
        assert.deepEqual(await page.evaluate(() => [gapsFixture.inputs.length, gapsFixture.submits, gapsFixture.nexts, gapsFixture.q.questionIndex]), [2, 1, 0, 1]);
        await setup();
        assert.equal((await once(page)).status, 'refused');
        assert.deepEqual(await page.evaluate(() => [gapsFixture.inputs.length, gapsFixture.submits]), [0, 0]);
        await setup();
        assert.equal((await factory()(page, { shouldStop: () => true })).status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [gapsFixture.inputs.length, gapsFixture.submits]), [0, 0]);
        await setup();
        await createFillGapsOnce({ detectQuestion, playGapsRound })(page);
        assert.equal((await factory()(page)).status, 'refused');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await page.goto(origin + '/lesson');
        const refused = factory();
        assert.equal((await refused(page)).status, 'refused');
        await setup();
        assert.equal((await refused(page)).status, 'refused');
        for (const mutation of ['question', 'answer', 'marking', 'button', 'metadata']) {
            await setup();
            const fill = createFillGapsOnce({ detectQuestion, playGapsRound });
            const run = factory(async (...args) => {
                const result = await fill(...args);
                await page.evaluate(m => {
                    if (m === 'question') gapsFixture.q.questionIndex++;
                    if (m === 'answer') document.querySelector('.dropzone-answer').textContent = 'wrong';
                    if (m === 'marking') gapsFixture.self.sectionData.activityGroup.isAutoMarked = false;
                    if (m === 'button') document.querySelector('#sa-navigation-controls button').textContent = 'Next Question';
                    if (m === 'metadata') gapsFixture.metadata.Gaps[0].CorrectOptions = ['wrong'];
                }, mutation);
                return result;
            });
            assert.equal((await run(page)).status, 'refused', mutation);
            assert.equal(await page.evaluate(() => gapsFixture.submits), 0, mutation);
        }
        await setup();
        let cancelled = false;
        const fill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const cancelAfterFill = factory(async (...args) => { const result = await fill(...args); cancelled = true; return result; });
        assert.equal((await cancelAfterFill(page, { shouldStop: () => cancelled })).status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [gapsFixture.inputs.length, gapsFixture.submits]), [2, 0]);
        await setup();
        let uncertainClicks = 0;
        const uncertainPage = new Proxy(page, { get(target, key) {
            if (key === 'mouse') return { click: async () => { uncertainClicks++; throw new Error('Uncertain click'); } };
            const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
        const uncertain = factory();
        assert.deepEqual(await uncertain(uncertainPage), { status: 'stopped', reason: 'inspection-or-dispatch-uncertain' });
        assert.equal(uncertainClicks, 1);
        assert.equal((await uncertain(page)).status, 'refused');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await setup();
        let release;
        const pending = new Promise(r => { release = r; });
        const overlap = factory(async () => { await pending; return { status: 'stopped' }; });
        const first = overlap(page);
        assert.equal((await overlap(page)).status, 'refused');
        release();
        assert.equal((await first).status, 'stopped');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await setup();
        const completePage = new Proxy(page, { get(target, key) {
            if (key === 'mouse') return { click: async (...args) => { await target.mouse.click(...args); throw new Error('Reply lost after dispatch'); } };
            const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
        const afterDispatch = factory();
        assert.equal((await afterDispatch(completePage)).status, 'stopped');
        assert.equal((await afterDispatch(page)).status, 'refused');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 1);
        await setup();
        const delayedFill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const delayed = factory(async (...args) => {
            const result = await delayedFill(...args);
            await page.evaluate(() => {
                const button = document.querySelector('#sa-navigation-controls button');
                button.disabled = true;
                setTimeout(() => { button.disabled = false; }, 150);
            });
            return result;
        });
        assert.equal((await delayed(page)).status, 'submitted-once');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 1);
        await setup();
        const disabledFill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const disabled = factory(async (...args) => {
            const result = await disabledFill(...args);
            await page.evaluate(() => { document.querySelector('#sa-navigation-controls button').disabled = true; });
            return result;
        });
        const since = Date.now();
        assert.equal((await disabled(page)).status, 'refused');
        assert.ok(Date.now() - since >= 950);
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await setup();
        let stopWaiting = false;
        const waitingFill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const waiting = factory(async (...args) => {
            const result = await waitingFill(...args);
            await page.evaluate(() => { document.querySelector('#sa-navigation-controls button').disabled = true; });
            setTimeout(() => { stopWaiting = true; }, 100);
            return result;
        });
        assert.equal((await waiting(page, { shouldStop: () => stopWaiting })).status, 'aborted');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await setup();
        const boundFill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const switched = factory(async (...args) => {
            await page.evaluate(() => { gapsFixture.q.questionIndex++; });
            return boundFill(...args);
        });
        assert.equal((await switched(page)).status, 'stopped');
        assert.deepEqual(await page.evaluate(() => [gapsFixture.inputs.length, gapsFixture.submits]), [0, 0]);
        await setup();
        const coverFill = createFillGapsOnce({ detectQuestion, playGapsRound });
        const covered = factory(async (...args) => {
            const result = await coverFill(...args);
            await page.evaluate(() => {
                const cover = document.createElement('div');
                cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent';
                window.coverClicks = 0;
                cover.addEventListener('click', () => { window.coverClicks++; });
                document.body.append(cover);
            });
            return result;
        });
        assert.equal((await covered(page)).status, 'refused');
        assert.deepEqual(await page.evaluate(() => [gapsFixture.submits, window.coverClicks]), [0, 0]);
        await setup();
        const abortedFill = factory(async () => ({ status: 'aborted' }));
        assert.deepEqual(await abortedFill(page), { status: 'aborted', reason: 'fill-cancelled-input-may-be-partial' });
        assert.equal(await page.evaluate(() => gapsFixture.submits), 0);
        await setup();
        const dispatch = guardVerifiedPointDispatch(page), guardedPage = dispatch.page;
        assert.equal((await factory()(guardedPage)).status, 'submitted-once');
        assert.deepEqual([...dispatch.counts(), await page.evaluate(() => gapsFixture.submits)], [1, 0, 1]);
        console.log('Submit-once browser fixtures PASS: exact2inputs/1Submit/0Next/auto-advance1; no later-question input; repeat/refusal/prefill/cancel/mutation/uncertain-click permanent consumption.');
    } finally {
        try { if (browser) await browser.close(); } finally { await new Promise(r => server.close(r)); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
