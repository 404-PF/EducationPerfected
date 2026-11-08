const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');

const REASON = 'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled';

async function installCounters(page) {
    await page.evaluate(() => {
        window.boundaryCounts = { clicks: 0, inputs: 0, keys: 0, submits: 0 };
        document.addEventListener('click', () => window.boundaryCounts.clicks++, true);
        document.addEventListener('input', () => window.boundaryCounts.inputs++, true);
        document.addEventListener('keydown', () => window.boundaryCounts.keys++, true);
        document.addEventListener('submit', () => window.boundaryCounts.submits++, true);
    });
}

async function assertBoundary(page, route, prepare) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (prepare) await page.evaluate(prepare);
    await page.evaluate(() => {
        const fixture = window.dropdownFixture || window.textboxFixture || window.numberBoxFixture || window.gapsFixture || window.multiFixture;
        const self = fixture?.self || window.angular.element().scope().self;
        self.model.gameMode = 2;
    });
    await installCounters(page);
    const detected = await detectQuestion(page);
    assert.equal(detected?.kind, 'unsupported', route);
    assert.equal(detected.assessment, true, route);
    assert.equal(detected.reason, REASON, route);
    assert.deepEqual(await page.evaluate(() => window.boundaryCounts), { clicks: 0, inputs: 0, keys: 0, submits: 0 }, route);
}

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        const origin = `http://127.0.0.1:${server.address().port}`;

        // Source-shaped assessment shell: EP mounts these controls only for
        // gameMode 2. Detection must stop there, before answer-state reads.
        await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            const self = window.angular.element().scope().self;
            self.model.gameMode = 2;
            const q = self.model._currentQuestion;
            window.answerStateReads = 0;
            Object.defineProperty(q, 'validAnswers', {
                configurable: true,
                get() { window.answerStateReads++; return []; },
            });
            for (const tag of ['game-assessment-action-bar', 'game-assessment-side-bar', 'game-assessment-navigation-controls']) {
                const control = document.createElement(tag);
                control.innerHTML = '<button type="button">Assessment control</button>';
                document.body.append(control);
            }
        });
        await installCounters(page);
        const shell = await detectQuestion(page);
        assert.equal(shell?.kind, 'unsupported');
        assert.equal(shell.assessment, true);
        assert.equal(shell.reason, REASON);
        assert.equal(await page.evaluate(() => window.answerStateReads), 0);
        assert.deepEqual(await page.evaluate(() => window.boundaryCounts), { clicks: 0, inputs: 0, keys: 0, submits: 0 });

        // The mounted shell is fail-closed even when the surrounding mode or
        // scope contradicts it; question support never overrides the boundary.
        for (const shape of ['smart-mode', 'unreadable-scope']) {
            await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(kind => {
                if (kind === 'smart-mode') window.angular.element().scope().self.model.gameMode = 3;
                if (kind === 'unreadable-scope') window.angular = undefined;
                for (const tag of ['game-assessment-action-bar', 'game-assessment-side-bar', 'game-assessment-navigation-controls']) {
                    const control = document.createElement(tag);
                    control.innerHTML = '<button type="button">Assessment control</button>';
                    document.body.append(control);
                }
            }, shape);
            const pinned = await detectQuestion(page);
            assert.equal(pinned?.kind, 'unsupported', shape);
            assert.equal(pinned.assessment, true, shape);
            assert.equal(pinned.reason, REASON, shape);
        }

        // A Smart Lesson control tag must not be mistaken for an Assessment.
        await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            const control = document.createElement('game-sa-action-bar');
            control.innerHTML = '<button type="button">Smart Lesson control</button>';
            document.body.append(control);
        });
        assert.equal((await detectQuestion(page))?.kind, 'choice');

        // Mode-only fallbacks cover every supported question shape when the
        // assessment shell is absent or has not mounted yet.
        for (const route of ['/lesson', '/lesson-dropdown', '/lesson-textbox', '/lesson-number-box', '/lesson-gaps', '/lesson-multi', '/audio', '/task/play']) {
            await assertBoundary(page, `${origin}${route}`);
        }
        await assertBoundary(page, `${origin}/lesson`, () => {
            document.querySelector('.multi-choice-component').remove();
            const box = document.createElement('input');
            box.id = 'answer-text';
            document.querySelector('#ep-question-container').append(box);
        });
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
    console.log('Assessment boundary PASS: source shell stops before answer reads and pins contradiction cases; gameMode 2 refuses choice, dropdown, textbox, number-box, gaps, multi-select, audio, classic text and typed lesson with zero clicks/input/keys/submits.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
