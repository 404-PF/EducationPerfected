const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { installAssessmentLifecycle } = require('./assessment-lifecycle-fixture');

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        const route = `http://127.0.0.1:${server.address().port}/lesson-assessment`;
        const reset = async () => {
            await page.goto(route, { waitUntil: 'domcontentloaded' });
            await page.evaluate(installAssessmentLifecycle);
        };
        const snapshot = () => page.evaluate(() => ({
            calls: [...window.assessmentLifecycle.calls],
            pending: window.assessmentLifecycle.pending,
            counts: { ...window.assessmentCounts },
        }));

        // Positive controls prove the synthetic sentinels are wired. These
        // are deliberate local interactions, not actions taken by detection.
        await reset();
        await page.type('#answer-text', 'x');
        assert.deepEqual((await snapshot()).calls, ['read-current', 'mark-current', 'queue-question']);
        await reset();
        await page.keyboard.press('ArrowRight');
        assert.deepEqual((await snapshot()).calls, ['submit-current', 'mark-current', 'queue-question', 'queue-navigation']);
        await reset();
        await page.click('#lifecycle-controls button');
        const completion = await snapshot();
        assert.deepEqual(completion.calls, ['mark-attempt-submitting', 'submit-current', 'mark-current', 'queue-question', 'request-completion', 'exit-ui']);
        assert.equal(completion.pending, 1, 'UI exit does not prove a drained save queue');

        // Detector stops before question getters and does not invoke any
        // lifecycle method, including cleanup. Pre-existing EP-like work is
        // deliberately NOT cancelled or incorrectly attributed to detection.
        const checkEvent = async event => {
            await reset();
            if (event) await page.evaluate(name => window.assessmentLifecycle[name](), event);
            const before = await snapshot();
            const result = await detectQuestion(page);
            assert.equal(result?.kind, 'unsupported', String(event));
            assert.equal(result.assessment, true, String(event));
            assert.deepEqual(await snapshot(), before, String(event));
            assert.equal(before.counts.answerReads, 0);
            assert.deepEqual(before.counts, { clicks: 0, inputs: 0, keys: 0, submits: 0, answerReads: 0 });
        };
        const events = [null, 'autosave', 'navigate', 'flag', 'focus', 'earlyExit', 'complete', 'freeze', 'forceSubmit', 'expire'];
        await events.reduce((previous, event) => previous.then(() => checkEvent(event)), Promise.resolve());
        // An already queued save can run after refusal. The promise is zero
        // program-generated input, NOT zero site-generated persistence.
        await reset();
        await page.evaluate(() => window.assessmentLifecycle.autosave());
        await detectQuestion(page);
        await page.evaluate(() => window.assessmentLifecycle.flush());
        const saved = await snapshot();
        assert.equal(saved.calls.at(-1), 'flush-queued');
        assert.equal(saved.pending, 0);
        assert.equal(saved.counts.answerReads, 0);
        console.log('Assessment lifecycle PASS: instrumented input/navigation/completion positives; refusal preserves pending autosave, navigation, flag, focus, exit and completion state. Synthetic only.');
    } finally {
        try { if (browser) await browser.close(); }
        finally { await new Promise(resolve => server.close(resolve)); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
