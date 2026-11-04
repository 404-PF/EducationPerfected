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
        const uncertainPage = new Proxy(page, { get(target, key) {
            if (key !== 'evaluateHandle') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
            return async (...args) => {
                const handle = await target.evaluateHandle(...args);
                if (args[2] !== 'submit') return handle;
                const getProperty = handle.getProperty.bind(handle);
                handle.getProperty = async name => {
                    const button = await getProperty(name);
                    const asElement = button.asElement.bind(button);
                    button.asElement = () => {
                        const element = asElement();
                        element.click = async () => { throw new Error('Uncertain click'); };
                        return element;
                    };
                    return button;
                };
                return handle;
            };
        } });
        const uncertain = factory();
        assert.equal((await uncertain(uncertainPage)).status, 'stopped');
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
            if (key !== 'evaluateHandle') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
            return async (...args) => {
                const handle = await target.evaluateHandle(...args);
                if (args[2] !== 'submit') return handle;
                const getProperty = handle.getProperty.bind(handle);
                handle.getProperty = async name => {
                    const button = await getProperty(name);
                    const asElement = button.asElement.bind(button);
                    button.asElement = () => {
                        const element = asElement(), click = element.click.bind(element);
                        element.click = async () => { await click(); throw new Error('Reply lost after dispatch'); };
                        return element;
                    };
                    return button;
                };
                return handle;
            };
        } });
        const afterDispatch = factory();
        assert.equal((await afterDispatch(completePage)).status, 'stopped');
        assert.equal((await afterDispatch(page)).status, 'refused');
        assert.equal(await page.evaluate(() => gapsFixture.submits), 1);
        console.log('Submit-once browser fixtures PASS: exact2inputs/1Submit/0Next/auto-advance1; no later-question input; repeat/refusal/prefill/cancel/mutation/uncertain-click permanent consumption.');
    } finally {
        try { if (browser) await browser.close(); } finally { await new Promise(r => server.close(r)); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
