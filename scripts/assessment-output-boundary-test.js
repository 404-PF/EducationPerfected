const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        const origin = `http://127.0.0.1:${server.address().port}`;
        const checkRoute = async route => {
            await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => {
                const fixture = window.dropdownFixture || window.textboxFixture || window.numberBoxFixture || window.gapsFixture || window.multiFixture;
                const self = fixture?.self || window.angular.element().scope().self;
                self.model.gameMode = 2;
                const question = self.model._currentQuestion;
                window.outputBoundaryReads = [];
                const fields = ['validAnswers', 'questionDef', 'cachedRenderers', 'identifiedComponents', 'getQuestionRenderer', 'userAnswer', 'userState'];
                for (const field of fields) Object.defineProperty(question, field, {
                    configurable: true,
                    get() { window.outputBoundaryReads.push(field); throw new Error('poisoned output boundary'); },
                });
                // A positive control proves the getter sentinels really fire.
                try { void question.validAnswers; } catch {}
            });
            assert.deepEqual(await page.evaluate(() => window.outputBoundaryReads), ['validAnswers'], route);
            await page.evaluate(() => { window.outputBoundaryReads = []; });
            const result = await detectQuestion(page);
            assert.equal(result?.kind, 'unsupported', route);
            assert.equal(result.assessment, true, route);
            assert.deepEqual(await page.evaluate(() => window.outputBoundaryReads), [], route);
        };
        const routes = ['/lesson-assessment', '/lesson', '/lesson-dropdown', '/lesson-textbox', '/lesson-number-box', '/lesson-gaps', '/lesson-multi', '/audio', '/task/play'];
        await routes.reduce((previous, route) => previous.then(() => checkRoute(route)), Promise.resolve());
        console.log('Assessment output boundary PASS:9shell/mode-only question shapes refuse before answer/definition/renderer/stored-state getter reads; working poison controls. Synthetic only.');
    } finally {
        try { if (browser) await browser.close(); }
        finally { await new Promise(resolve => server.close(resolve)); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
