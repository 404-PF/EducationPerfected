const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound, clickVisibleButton } = require('../lib/choice-handler');
async function setup(page, origin, mutation = '') {
    await page.goto(origin + '/lesson');
    await page.waitForSelector('.mcq-preview-option');
    const descriptor = await detectQuestion(page);
    await page.evaluate(mutation => {
        const group = document.querySelector('.multi-choice-component');
        const self = window.angular.element(group).scope().self;
        const original = window.angular.element;
        const model = self.model;
        window.transitionFixture = { self, model, clicks: 0, submits: 0 };
        const submit = [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit');
        submit.addEventListener('click', event => {
            event.stopImmediatePropagation();
            window.transitionFixture.submits++;
            group.style.display = 'none';
            document.querySelector('#ep-question-container')?.remove();
            const explanation = document.createElement('div'); explanation.id = 'ep-explanation-container';
            document.body.append(explanation);
            model.isExplanationDisplayed = mutation !== 'not-explanation';
            window.angular.element = el => {
                if (el === explanation || el?.id === 'sa-navigation-controls') {
                    const chosen = mutation === 'foreign-model' && el?.id === 'sa-navigation-controls' ? { ...model } : model;
                    return { scope: () => ({ self: { model: chosen } }), isolateScope: () => ({ self: { model: chosen } }) };
                }
                return original(el);
            };
            if (mutation === 'stale-key') model._currentQuestion.questionIndex++;
            if (mutation === 'assessment') model.gameMode = 2;
            if (mutation === 'multi') model._currentQuestion.questionDef.Components[0].AllowMultiSelect = true;
            if (mutation === 'duplicate-explanation') document.body.append(explanation.cloneNode());
            submit.remove();
            const bar = document.querySelector('#sa-navigation-controls'); bar.replaceChildren();
            const next = document.createElement('button'); next.textContent = '3 seconds'; next.disabled = true;
            next.addEventListener('click', () => { window.transitionFixture.clicks++; model._currentQuestion.questionIndex++; document.body.append(group); group.style.display = ''; explanation.remove(); model.isExplanationDisplayed = false; });
            bar.append(next);
            if (mutation !== 'locked') setTimeout(() => { next.textContent = 'Next Question'; next.disabled = false; }, 80);
            if (mutation === 'duplicate-next') { const other = next.cloneNode(true); other.disabled = false; other.textContent = 'Next Question'; bar.append(other); }
        }, true);
    }, mutation);
    return descriptor;
}
(async () => {
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage(); const origin = `http://127.0.0.1:${server.address().port}`;
        const d = await setup(page, origin);
        const result = await playChoiceRound(page, d, { enter: true, timeout: 700, shouldStop: () => false });
        assert.equal(result.status, 'advanced', JSON.stringify(result));
        assert.deepEqual(await page.evaluate(() => [window.transitionFixture.submits, window.transitionFixture.clicks]), [1, 1]);
        for (const mutation of ['not-explanation','foreign-model','assessment','multi','duplicate-explanation','duplicate-next','locked']) {
            const d = await setup(page, origin, mutation);
            const result = await playChoiceRound(page, d, { enter: true, timeout: 250, shouldStop: () => false });
            assert.equal(result.status, 'stopped', mutation + JSON.stringify(result));
            assert.equal(await page.evaluate(() => window.transitionFixture.clicks), 0, mutation);
        }
        const stale = await setup(page, origin, 'stale-key');
        const advanced = await playChoiceRound(page, stale, { enter: true, timeout: 200, shouldStop: () => false });
        // A changed q may be invisible to detection; direct keyed control MUST refuse.
        assert.equal(await clickVisibleButton(page, 'Next Question', stale), 'unassociated');
        assert.equal(await page.evaluate(() => window.transitionFixture.clicks), 0);
        assert.ok(['stopped','advanced'].includes(advanced.status));
        // Semi mode never submits and thus cannot trigger explanation continuation.
        const semi = await setup(page, origin); let selected = false;
        await playChoiceRound(page, semi, { enter: false, timeout: 100, shouldStop: () => selected, log: s => { if (s.startsWith('Selected ')) selected = true; } });
        assert.deepEqual(await page.evaluate(() => [window.transitionFixture.submits, window.transitionFixture.clicks]), [0, 0]);
        console.log('Choice explanation transition: hidden/missing question detection, timed Next readiness, same model/key, 7 refusal cases, stale-key and semi-mode non-submit guards passed. Synthetic only.');
    } finally { try { await browser?.close(); } finally { server.close(); } }
})().catch(error => { console.error(error); process.exitCode = 1; });
