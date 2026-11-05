const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playTextboxRound } = require('../lib/textbox-handler');
(async () => {
    const server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage(), origin = 'http://127.0.0.1:' + server.address().port;
        const setup = () => page.goto(origin + '/lesson-textbox');
        await setup();
        let descriptor = await detectQuestion(page);
        assert.equal(descriptor.kind, 'textbox');
        assert.deepEqual(descriptor.boxes.map(b => b.answer), ['beta', 'alpha']);
        assert.equal((await playTextboxRound(page, descriptor, { enter: true, timeout: 1000 })).status, 'advanced');
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.inputs.every(e => e.trusted), textboxFixture.submits]), [9, true, 1]);
        await setup();
        descriptor = await detectQuestion(page);
        let filled = false;
        assert.equal((await playTextboxRound(page, descriptor, { enter: false, timeout: 0, log: () => { filled = true; }, shouldStop: () => filled })).status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [9, 0]);
        for (const mutation of ['manual', 'assessment', 'numeric', 'long', 'duplicate', 'disabled', 'prefill', 'answer', 'missing-state', 'initial', 'readonly', 'pattern', 'wrong-element', 'unmarked', 'unicode-control', 'mixed-definition', 'stale-value', 'variable-mismatch', 'raw-option-change', 'editable-empty', 'editable-plain', 'editable-true']) {
            await setup();
            await page.evaluate(m => {
                const f = textboxFixture, c = f.base['box-b'][0], s = c.componentState;
                if (m.startsWith('editable-')) { const extra = document.createElement('div'); extra.textContent = 'Extra editable'; extra.setAttribute('contenteditable', m === 'editable-empty' ? '' : m === 'editable-plain' ? 'plaintext-only' : 'true'); f.group.append(extra); }
                if (m === 'manual') f.self.sectionData.activityGroup.isAutoMarked = false;
                if (m === 'assessment') f.self.model.gameMode = 4;
                if (m === 'numeric') f.q.questionDef.Components[0].ComponentTypeCode = 'NUMBER_BOX_COMPONENT';
                if (m === 'long') f.q.questionDef.Components[0].ComponentTypeCode = 'LONG_ANSWER_COMPONENT';
                if (m === 'duplicate') f.base['box-b'].push(c);
                if (m === 'disabled') c.textBox.disabled = true;
                if (m === 'prefill') { c.textBox.value = s.userAnswer = 'prefilled'; s.isUserAnswerSet = true; }
                if (m === 'answer') s.answerOptions = [];
                if (m === 'missing-state') delete c.componentState;
                if (m === 'initial') s.injectedInitialText = 'seed';
                if (m === 'readonly') c.textBox.readOnly = true;
                if (m === 'pattern') c.textBox.setAttribute('pattern', '[a-z]+');
                if (m === 'wrong-element') c.visualElement = document.body;
                if (m === 'unmarked') s.metadataInstance.Marked = 2;
                if (m === 'unicode-control') s.answerOptions = ['bad\u202e'];
                if (m === 'mixed-definition') f.q.questionDef.Components.push({ ComponentTypeCode: 'MULTICHOICE_COMPONENT' });
                if (m === 'stale-value') c.textBox.value = 'stale';
                if (m === 'variable-mismatch') s.answerOptions = ['resolved-different'];
                if (m === 'raw-option-change') f.q.questionDef.Components.find(d => d.ComponentID === 'box-b').Options = ['raw-different'];
            }, mutation);
            const d = await detectQuestion(page);
            assert.equal(d.kind, mutation === 'prefill' ? 'textbox' : 'unsupported', mutation);
            if (mutation === 'prefill') assert.equal(d.boxes[0].value, 'prefilled');
            const refused = await playTextboxRound(page, d, { enter: true, timeout: 200 });
            assert.equal(refused.status, 'stopped', mutation);
            assert.equal(refused.reason, 'unsafe-or-changed-state', mutation);
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [0, 0]);
        }
        for (const mutation of ['answer', 'question', 'focus']) {
            await setup();
            descriptor = await detectQuestion(page);
            await page.evaluate(m => { textboxFixture.afterInput = () => {
                if (m === 'answer') textboxFixture.base['box-b'][0].componentState.answerOptions = ['changed'];
                if (m === 'question') textboxFixture.q.questionIndex++;
                if (m === 'focus') document.querySelectorAll('input.text-box-component')[1].focus();
            }; }, mutation);
            const result = await playTextboxRound(page, descriptor, { enter: true, timeout: 200 });
            assert.equal(result.status, 'stopped', mutation);
            assert.equal(result.reason, 'unsafe-or-changed-state', mutation);
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [1, 0]);
        }
        await setup();
        descriptor = await detectQuestion(page);
        let cancelled = false;
        await page.exposeFunction('cancelTextboxTest', () => { cancelled = true; });
        await page.evaluate(() => { textboxFixture.afterInput = () => { window.cancelTextboxTest(); }; });
        const cancellation = await playTextboxRound(page, descriptor, { enter: true, timeout: 200, shouldStop: () => cancelled });
        assert.equal(cancellation.status, 'aborted');
        assert.equal(await page.evaluate(() => textboxFixture.submits), 0);
        await setup();
        descriptor = await detectQuestion(page);
        await page.evaluate(() => { textboxFixture.afterInput = () => {
            if (textboxFixture.inputs.length === 9) {
                const button = document.querySelector('#sa-navigation-controls button');
                button.parentElement.append(button.cloneNode(true));
            }
        }; });
        assert.equal((await playTextboxRound(page, descriptor, { enter: true, timeout: 200 })).status, 'stopped');
        assert.equal(await page.evaluate(() => textboxFixture.submits), 0);
        await setup();
        descriptor = await detectQuestion(page);
        await page.evaluate(() => { textboxFixture.afterInput = () => {
            if (textboxFixture.inputs.length === 9) {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent';
                window.overlayClicks = 0;
                overlay.addEventListener('click', () => { window.overlayClicks++; });
                document.body.append(overlay);
            }
        }; });
        assert.equal((await playTextboxRound(page, descriptor, { enter: true, timeout: 200 })).status, 'stopped');
        assert.deepEqual(await page.evaluate(() => [textboxFixture.submits, window.overlayClicks]), [0, 0]);
        await setup();
        descriptor = await detectQuestion(page);
        await page.evaluate(() => { textboxFixture.q.questionIndex++; });
        assert.equal((await playTextboxRound(page, descriptor, { enter: true, timeout: 200 })).status, 'stopped');
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [0, 0]);
        await setup();
        descriptor = await detectQuestion(page);
        let recomputedClicks = 0, pointClicks = 0;
        const guardedPage = new Proxy(page, { get(target, key) {
            if (key === 'mouse') return { click: async (...args) => { pointClicks++; return target.mouse.click(...args); } };
            if (key !== 'evaluateHandle') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
            return async (...args) => {
                const handle = await target.evaluateHandle(...args);
                if (args[2] !== 'submit') return handle;
                const getProperty = handle.getProperty.bind(handle);
                handle.getProperty = async name => {
                    const button = await getProperty(name), asElement = button.asElement.bind(button);
                    button.asElement = () => { const element = asElement(); element.click = async () => { recomputedClicks++; throw new Error('Must dispatch verified point'); }; return element; };
                    return button;
                };
                return handle;
            };
        } });
        assert.equal((await playTextboxRound(guardedPage, descriptor, { enter: true, timeout: 1000 })).status, 'advanced');
        assert.deepEqual([pointClicks, recomputedClicks, await page.evaluate(() => textboxFixture.submits)], [1, 0, 1]);
        await setup();
        descriptor = await detectQuestion(page);
        const uncertainPage = new Proxy(page, { get(target, key) {
            if (key === 'evaluateHandle') return async () => { throw new Error('PRIVATE synthetic exception'); };
            const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
        const uncertain = await playTextboxRound(uncertainPage, descriptor, { enter: true, timeout: 200 });
        assert.equal(uncertain.status, 'stopped');
        assert.equal(uncertain.reason, 'inspection-or-dispatch-uncertain');
        assert.equal(uncertain.message, 'Lesson textboxes stopped: inspection or input result uncertain; no retry.');
        assert.ok(!JSON.stringify(uncertain).includes('PRIVATE'));
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [0, 0]);
        console.log('Textbox source-derived browser fixtures PASS: DOM-order2fields/9trustedcharacters/1Submit; fill-only0Submit; 22 initial refusals; 3 mid-input stops after1character/0Submit. Not live proof.');
    } finally { try { if (browser) await browser.close(); } finally { await new Promise(r => server.close(r)); } }
})().catch(e => { console.error(e); process.exitCode = 1; });
