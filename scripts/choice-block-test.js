const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound } = require('../lib/choice-handler');
const { setup: setupMath } = require('./choice-renderer-fixture');
async function setup(page, origin) {
    await setupMath(page, origin);
    await page.evaluate(() => {
        const f = window.mathFixture;
        for (let i = 0; i < f.previews.length; i++) {
            const text = 'Synthetic plain answer ' + i;
            const template = '[block align="left"\n' + text + '\n]';
            f.comp.Options[i].TextTemplate = template;
            f.metadata.Options[i].TextTemplate = template;
            f.previews[i].renderer.templateString = template;
            f.previews[i].fields.renderGroup.textContent = text;
        }
        const index = f.q.cachedRenderers[1].identifiedComponents;
        f.q.cachedRenderers[1] = Object.create({ get identifiedComponents() { window.indexGetterCalls++; throw new Error('Must read own parser'); } });
        f.q.cachedRenderers[1].parser = { identifiedComponents: index };
        window.indexGetterCalls = 0;
    });
}
(async () => {
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        await setup(page, origin);
        const descriptor = await detectQuestion(page);
        assert.equal(descriptor.kind, 'choice'); assert.equal(descriptor.plainBlock, true);
        await page.evaluate(() => { const f = mathFixture; f.group.prepend(f.previews[1].element); f.previews.reverse(); });
        let selected = false;
        await playChoiceRound(page, descriptor, { enter: false, timeout: 30, shouldStop: () => selected, log: message => { if(message.startsWith('Selected ')) selected = true; } });
        assert.deepEqual(await page.evaluate(() => mathFixture.clicks), descriptor.correct);
        assert.equal(await page.evaluate(() => indexGetterCalls), 0);
        await setup(page, origin);
        const automatic = await detectQuestion(page);
        await page.evaluate(() => {
            window.blockSubmits = 0;
            document.querySelector('#sa-navigation-controls button').addEventListener('click', event => { event.stopImmediatePropagation(); blockSubmits++; mathFixture.q.questionIndex++; }, true);
        });
        assert.equal((await playChoiceRound(page, automatic, { enter: true, timeout: 1000 })).status, 'advanced');
        assert.deepEqual(await page.evaluate(() => [mathFixture.clicks.length, blockSubmits, indexGetterCalls]), [1, 1, 0]);
        const mutations = ['no-parser', 'foreign-index', 'image', 'math', 'extra-editable', 'render-text', 'unknown-grammar', 'mixed-plain', 'nested-directive', 'blank', 'wrong-group', 'wrong-state', 'wrong-preview', 'wrong-renderer', 'duplicate-template', 'missing-original', 'foreign-original', 'missing-displayed', 'foreign-displayed', 'correct-not-displayed', 'missing-preview'];
        for (const mutation of mutations) {
            await setup(page, origin);
            await page.evaluate(mutation => {
                const f = mathFixture, state = f.component.componentState;
                if (mutation === 'no-parser') delete f.q.cachedRenderers[1].parser;
                if (mutation === 'foreign-index') f.q.cachedRenderers[1].parser.identifiedComponents = { baseComponents: {} };
                if (mutation === 'image') f.previews[1].element.append(document.createElement('img'));
                if (mutation === 'math') { const formula = document.createElement('span'); formula.className = 'katex'; f.previews[1].element.append(formula); }
                if (mutation === 'extra-editable') f.previews[1].element.append(document.createElement('input'));
                if (mutation === 'render-text') f.previews[1].fields.renderGroup.textContent = 'foreign text';
                if (mutation === 'unknown-grammar') f.comp.Options[0].TextTemplate = '[unknown\ntext\n]';
                if (mutation === 'mixed-plain') f.comp.Options[0].TextTemplate = 'plain';
                if (mutation === 'nested-directive') f.comp.Options[0].TextTemplate = '[block\n[image url="x"]\n]';
                if (mutation === 'blank') f.comp.Options[0].TextTemplate = '[block\n \n]';
                if (mutation === 'wrong-group') f.component.visualElement = document.body;
                if (mutation === 'wrong-state') state.componentID = 'foreign';
                if (mutation === 'wrong-preview') f.previews[1].correct = false;
                if (mutation === 'wrong-renderer') f.previews[1].renderer.templateString = 'foreign';
                if (mutation === 'duplicate-template') f.comp.Options[0].TextTemplate = f.comp.Options[1].TextTemplate;
                if (mutation === 'missing-original') delete state.originalMultiChoiceOptions;
                if (mutation === 'foreign-original') state.originalMultiChoiceOptions[0] = { ...state.originalMultiChoiceOptions[0] };
                if (mutation === 'missing-displayed') delete state.displayedOptions;
                if (mutation === 'foreign-displayed') state.displayedOptions[0] = { ...state.displayedOptions[0] };
                if (mutation === 'correct-not-displayed') { f.previews[1].element.remove(); state.displayedOptions.splice(1, 1); f.previews.splice(1, 1); }
                if (mutation === 'missing-preview') f.previews.pop();
            }, mutation);
            assert.equal((await detectQuestion(page)).kind, 'unsupported', mutation);
            assert.equal(await page.evaluate(() => mathFixture.clicks.length), 0);
        }
        for (const mutation of ['round', 'template', 'resolved-marking', 'auto-marking', 'detached', 'graph']) {
            await setup(page, origin); const descriptor = await detectQuestion(page);
            await page.evaluate(mutation => {
                const f = mathFixture;
                if (mutation === 'round') f.q.questionIndex++;
                if (mutation === 'template') f.comp.Options[1].TextTemplate += 'changed';
                if (mutation === 'resolved-marking') f.metadata.Options[1].Correct = 'false';
                if (mutation === 'auto-marking') angular.element(f.group).scope().self.sectionData.activityGroup.isAutoMarked = false;
                if (mutation === 'detached') f.previews[1].element.remove();
                if (mutation === 'graph') f.component.componentState.originalMultiChoiceOptions[0] = { ...f.metadata.Options[0] };
            }, mutation);
            assert.equal((await playChoiceRound(page, descriptor, { enter: false, timeout: 20 })).status, 'stopped', mutation);
            assert.equal(await page.evaluate(() => mathFixture.clicks.length), 0);
        }
        console.log('Plain block choice synthetic fixtures: exact renderer mapping despite reorder, semi1select/0Submit, auto1select/1Submit, getter0calls,21 initial refusals+6 changed-state0select PASS. No live answering proof.');
    } finally { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
