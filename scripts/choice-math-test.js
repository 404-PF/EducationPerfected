const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound } = require('../lib/choice-handler');
async function setup(page, origin) {
    await page.goto(origin + '/lesson');
    await page.waitForSelector('.mcq-preview-option');
    await page.evaluate(() => {
        const group = document.querySelector('.multi-choice-component');
        const q = window.angular.element(group).scope().self.model._currentQuestion;
        const comp = q.questionDef.Components[0];
        comp.ComponentID = 'synthetic-choice';
        const elements = [...group.querySelectorAll('.mcq-preview-option')];
        // Invented formula markup mimics aggregate categories, NOT captured
        // user content or an asserted grammar for the actual failing slide.
        comp.Options = elements.map((el, i) => ({ TextTemplate: `[block align="center"\n\`\`\`x^{${i + 1}}\`\`\`\n]`, Correct: i === 1 ? 'True' : 'false' }));
        const metadata = { ...comp, Options: comp.Options.map(o => ({ ...o })) };
        const previews = elements.map((el, i) => {
            el.querySelectorAll('.shortcut-key').forEach(e => e.remove());
            el.replaceChildren();
            const renderGroup = document.createElement('div');
            renderGroup.innerHTML = '<span class="inline-formula"><span class="katex"><math><annotation encoding="application/x-tex">DUPLICATE MATH TEXT</annotation></math><span>DUPLICATE MATH TEXT</span></span></span>';
            el.append(renderGroup);
            const option = metadata.Options[i];
            const preview = { componentID: comp.ComponentID, correct: option.Correct.toLowerCase() === 'true', element: el, option, fields: { renderGroup }, renderer: { templateString: option.TextTemplate } };
            option.PreviewOption = preview;
            return preview;
        });
        const component = { type: 'multichoice', id: comp.ComponentID, visualElement: group, componentState: { componentID: comp.ComponentID, originalMultiChoiceOptions: metadata.Options.slice(), displayedOptions: previews.map(p => p.option), metadataInstance: metadata, previewOptions: previews } };
        q.cachedRenderers = { 1: { identifiedComponents: { baseComponents: { [comp.ComponentID]: [component] } } } };
        window.mathFixture = { q, comp, metadata, previews, component, group, clicks: [] };
        // Capture-phase intercept avoids fixture grading logic, no network.
        group.addEventListener('click', event => {
            const el = event.target.closest('.mcq-preview-option');
            if (el) { event.stopImmediatePropagation(); window.mathFixture.clicks.push(previews.find(p => p.element === el)?.option.TextTemplate); }
        }, true);
    });
}
(async () => {
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        await setup(page, origin);
        const descriptor = await detectQuestion(page);
        assert.equal(descriptor.kind, 'choice'); assert.equal(descriptor.representation, 'renderer-template');
        assert.equal(descriptor.correct.length, 1);
        // DOM and preview order both change; exact element/template association wins.
        await page.evaluate(() => { const f = window.mathFixture; f.group.prepend(f.previews[1].element); f.previews.reverse(); });
        let selected = false;
        const outcome = await playChoiceRound(page, descriptor, { enter: false, timeout: 30, shouldStop: () => selected, log: message => { if (message.startsWith('Selected ')) selected = true; } });
        assert.equal(await page.evaluate(() => window.mathFixture.clicks.length), 1, JSON.stringify(outcome));
        assert.equal(await page.evaluate(() => window.mathFixture.clicks[0]), descriptor.correct[0]);
        // Auto-mode submission still uses the existing keyed controls.
        await setup(page, origin);
        const auto = await detectQuestion(page);
        await page.evaluate(() => {
            const button = [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit');
            button.addEventListener('click', event => { event.stopImmediatePropagation(); window.mathFixture.q.questionIndex++; }, true);
        });
        const automatic = await playChoiceRound(page, auto, { enter: true, timeout: 1000, shouldStop: () => false });
        assert.equal(automatic.status, 'advanced', JSON.stringify(automatic));
        assert.equal(await page.evaluate(() => window.mathFixture.clicks.length), 1);
        await setup(page, origin);
        await page.evaluate(() => {
            const f = window.mathFixture;
            f.comp.Options.forEach((o, i) => { o.Correct = i === 1; });
            f.metadata.Options.forEach((o, i) => { o.Correct = i === 1; });
        });
        const booleanDescriptor = await detectQuestion(page);
        assert.equal(booleanDescriptor.kind, 'choice', 'preserve coherent boolean marking');
        const booleanExpected = await page.evaluate(() => window.mathFixture.metadata.Options[1].TextTemplate);
        assert.deepEqual(booleanDescriptor.correct, [booleanExpected]);
        let booleanSelected = false;
        await playChoiceRound(page, booleanDescriptor, { enter: false, timeout: 30, shouldStop: () => booleanSelected,
            log: message => { if (message.startsWith('Selected ')) booleanSelected = true; } });
        assert.deepEqual(await page.evaluate(() => window.mathFixture.clicks), [booleanExpected]);
        // Source-shaped resolution changes template AND marking before render.
        // Deliberately use a different correct option than the raw metadata.
        await setup(page, origin);
        await page.evaluate(() => {
            const f = window.mathFixture;
            f.metadata.Options.forEach((o, i) => {
                o.TextTemplate = `Synthetic sentence with \`resolved_${i}\` units.`;
                o.Correct = i === 2 ? 'true' : 'false';
                f.previews[i].renderer.templateString = o.TextTemplate;
                f.previews[i].correct = i === 2;
            });
            f.comp.Options.forEach(o => { o.Correct = '{syntheticCorrectVariable}'; });
            f.group.prepend(f.previews[2].element);
            f.previews.reverse();
        });
        const resolved = await detectQuestion(page);
        assert.equal(resolved.kind, 'choice');
        assert.match(resolved.correct[0], /resolved_2/);
        let resolvedSelected = false;
        await playChoiceRound(page, resolved, { enter: false, timeout: 30, shouldStop: () => resolvedSelected,
            log: message => { if (message.startsWith('Selected ')) resolvedSelected = true; } });
        assert.deepEqual(await page.evaluate(() => window.mathFixture.clicks), resolved.correct);
        for (const loading of ['all-math-missing', 'placeholder-text']) {
            await setup(page, origin);
            await page.evaluate(loading => {
                const f = window.mathFixture;
                for (const preview of f.previews) {
                    preview.element.querySelector('.inline-formula').remove();
                    if (loading === 'placeholder-text') {
                        // Plain backtick templates normalize nonempty and could
                        // match loading text without a raw-template routing gate.
                        const i = f.previews.indexOf(preview);
                        f.comp.Options[i].TextTemplate = `\`x${i}\``;
                        f.metadata.Options[i].TextTemplate = f.comp.Options[i].TextTemplate;
                        preview.renderer.templateString = f.comp.Options[i].TextTemplate;
                        preview.element.append(document.createTextNode(`\`x${i}\``));
                    }
                }
            }, loading);
            assert.equal((await detectQuestion(page)).kind, 'unsupported', loading);
            assert.equal(await page.evaluate(() => window.mathFixture.clicks.length), 0, loading);
        }
        for (const mutation of ['missing-cache','wrong-group','wrong-id','duplicate-component','duplicate-template','changed-correct','missing-preview','duplicate-element','foreign-option','wrong-renderer','wrong-render-group','missing-math','image','unreadable','changed-variable','missing-original','foreign-original','missing-displayed','foreign-displayed','duplicate-displayed','wrong-state-id','wrong-preview-id','wrong-preview-correct','invalid-resolved-correct','duplicate-resolved']) {
            await setup(page, origin);
            await page.evaluate(mutation => {
                const f = window.mathFixture;
                if (mutation === 'missing-cache') delete f.q.cachedRenderers;
                if (mutation === 'wrong-group') f.component.visualElement = document.body;
                if (mutation === 'wrong-id') f.component.id = 'foreign';
                if (mutation === 'duplicate-component') f.q.cachedRenderers[1].identifiedComponents.baseComponents[f.comp.ComponentID].push(f.component);
                if (mutation === 'duplicate-template') f.comp.Options[0].TextTemplate = f.comp.Options[1].TextTemplate;
                if (mutation === 'changed-correct') f.metadata.Options[1].Correct = 'false';
                if (mutation === 'missing-preview') f.previews.pop();
                if (mutation === 'duplicate-element') f.previews[0].element = f.previews[1].element;
                if (mutation === 'foreign-option') f.previews[1].option = { ...f.previews[1].option };
                if (mutation === 'wrong-renderer') f.previews[1].renderer.templateString = 'other';
                if (mutation === 'wrong-render-group') f.previews[1].fields.renderGroup = document.body;
                if (mutation === 'missing-math') f.previews[1].element.querySelector('.inline-formula').remove();
                if (mutation === 'image') f.previews[1].element.append(document.createElement('img'));
                if (mutation === 'unreadable') delete f.comp.Options[1].TextTemplate;
                const state = f.component.componentState;
                if (mutation === 'missing-original') delete state.originalMultiChoiceOptions;
                if (mutation === 'foreign-original') state.originalMultiChoiceOptions[0] = { ...f.metadata.Options[0] };
                if (mutation === 'missing-displayed') delete state.displayedOptions;
                if (mutation === 'foreign-displayed') state.displayedOptions[0] = { ...f.metadata.Options[0] };
                if (mutation === 'duplicate-displayed') state.displayedOptions[0] = state.displayedOptions[1];
                if (mutation === 'wrong-state-id') state.componentID = 'foreign';
                if (mutation === 'wrong-preview-id') f.previews[1].componentID = 'foreign';
                if (mutation === 'wrong-preview-correct') f.previews[1].correct = false;
                if (mutation === 'invalid-resolved-correct') f.metadata.Options[0].Correct = 'unknown';
                if (mutation === 'duplicate-resolved') f.metadata.Options[0].TextTemplate = f.metadata.Options[1].TextTemplate;
                if (mutation === 'changed-variable') f.metadata.Options[1].TextTemplate += 'resolved variable';
            }, mutation);
            assert.equal((await detectQuestion(page)).kind, 'unsupported', mutation);
            assert.equal(await page.evaluate(() => window.mathFixture.clicks.length), 0, mutation);
        }
        for (const mutation of ['round','template','resolved-template','resolved-marking','graph','marking','multi','detached']) {
            await setup(page, origin); const d = await detectQuestion(page);
            await page.evaluate(mutation => {
                const f = window.mathFixture;
                if (mutation === 'round') f.q.questionIndex++;
                if (mutation === 'template') f.comp.Options[1].TextTemplate += 'changed';
                if (mutation === 'resolved-template') {
                    f.metadata.Options[0].TextTemplate += 'changed';
                    f.previews[0].renderer.templateString = f.metadata.Options[0].TextTemplate;
                }
                if (mutation === 'resolved-marking') {
                    f.metadata.Options[1].Correct = 'false'; f.previews[1].correct = false;
                    f.metadata.Options[2].Correct = 'true'; f.previews[2].correct = true;
                }
                if (mutation === 'graph') f.component.componentState.originalMultiChoiceOptions[0] = { ...f.metadata.Options[0] };
                if (mutation === 'marking') window.angular.element(f.group).scope().self.sectionData.activityGroup.isAutoMarked = false;
                if (mutation === 'multi') f.comp.AllowMultiSelect = true;
                if (mutation === 'detached') f.previews[1].element.remove();
            }, mutation);
            const result = await playChoiceRound(page, d, { enter: false, timeout: 20, shouldStop: () => false });
            assert.equal(result.status, 'stopped', mutation);
            assert.equal(await page.evaluate(() => window.mathFixture.clicks.length), 0, mutation);
        }
        console.log('Math choice association: positive exact match despite duplicated rendered math and reordered DOM/previews; auto keyed advance, 2 full-loading-gap refusals, 25 malformed/foreign/stale refusal cases; resolved template+marking exact selection and 8 click-time guards passed. Synthetic only.');
    } finally {
        try { await browser?.close(); } finally { server.closeAllConnections(); server.close(); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
