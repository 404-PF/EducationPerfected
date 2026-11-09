const { guardVerifiedPointDispatch } = require('./verified-point-dispatch-fixture');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playTextboxRound, playNumberBoxRound } = require('../lib/textbox-handler');
(async () => {
    const server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage(), origin = 'http://127.0.0.1:' + server.address().port;
        const setup = () => page.goto(origin + '/lesson-textbox');
        const unmarkAll = fixtureName => page.evaluate(name => {
            const f = window[name];
            for (const def of f.q.questionDef.Components) def.Marked = 0;
            for (const entry of Object.values(f.base)) entry[0].componentState.metadataInstance.Marked = 0;
        }, fixtureName);
        const fillTextboxRound = async () => {
            const d = await detectQuestion(page);
            assert.equal(d.kind, 'textbox');
            assert.equal((await playTextboxRound(page, d, { enter: true, timeout: 1000 })).status, 'advanced');
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.inputs.every(e => e.trusted), textboxFixture.submits]), [9, true, 1]);
            return d;
        };
        await setup();
        let descriptor = await fillTextboxRound();
        assert.deepEqual(descriptor.boxes.map(b => b.answer), ['beta', 'alpha']);
        await setup();
        await unmarkAll('textboxFixture');
        await fillTextboxRound();
        await setup();
        descriptor = await detectQuestion(page);
        let filled = false;
        assert.equal((await playTextboxRound(page, descriptor, { enter: false, timeout: 0, log: () => { filled = true; }, shouldStop: () => filled })).status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [9, 0]);
        for (const mutation of ['manual', 'assessment', 'unsupported-mode', 'numeric', 'long', 'duplicate', 'disabled', 'prefill', 'answer', 'missing-state', 'initial', 'readonly', 'pattern', 'wrong-element', 'unmarked', 'mixed-marking', 'invalid-marked-def', 'unicode-control', 'mixed-definition', 'stale-value', 'variable-mismatch', 'raw-option-change', 'editable-empty', 'editable-plain', 'editable-true']) {
            await setup();
            await page.evaluate(m => {
                const f = textboxFixture, c = f.base['box-b'][0], s = c.componentState;
                if (m.startsWith('editable-')) { const extra = document.createElement('div'); extra.textContent = 'Extra editable'; extra.setAttribute('contenteditable', m === 'editable-empty' ? '' : m === 'editable-plain' ? 'plaintext-only' : 'true'); f.group.append(extra); }
                if (m === 'manual') f.self.sectionData.activityGroup.isAutoMarked = false;
                if (m === 'assessment') f.self.model.gameMode = 2;
                if (m === 'unsupported-mode') f.self.model.gameMode = 4;
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
                if (m === 'mixed-marking') f.q.questionDef.Components.find(d => d.ComponentID === 'box-b').Marked = 0;
                if (m === 'invalid-marked-def') f.q.questionDef.Components.find(d => d.ComponentID === 'box-b').Marked = 'MARKED_PRIVATE_SENTINEL';
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
        const expectedActionGuards = { answer: 'state-shape', question: 'baseline-changed' };
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
            assert.equal(result.diagnostic?.guard, expectedActionGuards[mutation], mutation);
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
        const duplicateSubmit = await playTextboxRound(page, descriptor, { enter: true, timeout: 200 });
        assert.equal(duplicateSubmit.status, 'stopped');
        assert.equal(duplicateSubmit.diagnostic?.guard, 'submit-controls');
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
        const changedBeforeStart = await playTextboxRound(page, descriptor, { enter: true, timeout: 200 });
        assert.equal(changedBeforeStart.status, 'stopped');
        assert.equal(changedBeforeStart.diagnostic, undefined);
        assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [0, 0]);
        await setup();
        descriptor = await detectQuestion(page);
        const dispatch = guardVerifiedPointDispatch(page), guardedPage = dispatch.page;
        assert.equal((await playTextboxRound(guardedPage, descriptor, { enter: true, timeout: 1000 })).status, 'advanced');
        assert.equal(dispatch.targetPaths(), 1);
        assert.deepEqual([...dispatch.counts(), await page.evaluate(() => textboxFixture.submits)], [1, 0, 1]);
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
        for (const selection of ['caret', 'range']) {
            await setup(); descriptor = await detectQuestion(page);
            await page.evaluate(selection => { textboxFixture.afterInput = () => {
                const box = textboxFixture.base['box-b'][0].textBox;
                box.setSelectionRange(0, selection === 'range' ? 1 : 0);
            }; }, selection);
            const result = await playTextboxRound(page, descriptor, { enter: true, timeout: 200 });
            assert.equal(result.reason, 'unsafe-or-changed-state', selection);
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits, textboxFixture.base['box-b'][0].textBox.value]), [1, 0, 'b']);
        }
        for (const transition of ['unsupported', 'modal', 'unsupported-modal']) {
            await setup(); descriptor = await detectQuestion(page);
            let armed = false, transitionReads = 0;
            const transitionPage = new Proxy(page, { get(target, key) {
                if (key !== 'evaluate') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
                return async (...args) => {
                    if (armed) {
                        armed = false; transitionReads++;
                        await target.evaluate(transition => {
                            if (transition.includes('unsupported')) textboxFixture.self.sectionData.activityGroup.isAutoMarked = false;
                            else textboxFixture.q.questionIndex++;
                            if (transition.includes('modal')) { const modal = document.createElement('div'); modal.setAttribute('uib-modal-window', 'modal-window'); document.body.append(modal); }
                        }, transition);
                    }
                    return target.evaluate(...args);
                };
            } });
            let timer;
            try {
                const result = await Promise.race([playTextboxRound(transitionPage, descriptor, { enter: false, timeout: 0, log: () => { armed = true; } }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Transition not reported')), 1500); })]);
                assert.equal(result.status, transition.includes('modal') ? 'modal' : 'stopped', transition);
                if (transition === 'unsupported') { assert.equal(result.reason, 'unsupported'); assert.match(result.message, /outcome not verified/); }
                assert.equal(transitionReads, 1);
                assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [9, 0]);
            } finally { clearTimeout(timer); }
        }
        await page.goto(origin + '/lesson-number-box');
        let numberDescriptor = await detectQuestion(page);
        assert.equal(numberDescriptor.kind, 'numberbox');
        assert.deepEqual(numberDescriptor.boxes.map(b => b.answer), ['30', '30', '30', '94.20']);
        let approvals = [];
        let result = await playNumberBoxRound(page, numberDescriptor, {
            enter: true,
            timeout: 200,
            requireSubmitApproval: true,
            approveSubmit: async request => { approvals.push(request); return false; },
        });
        assert.equal(result.status, 'stopped');
        assert.equal(approvals.length, 1);
        assert.equal(approvals[0].key, numberDescriptor.key);
        assert.equal(approvals[0].boxCount, 4);
        assert.deepEqual(await page.evaluate(() => numberBoxFixture.inputs.map(e => e.id)), ['box-c', 'box-c', 'box-a', 'box-a', 'box-d', 'box-d', 'box-b', 'box-b', 'box-b', 'box-b', 'box-b']);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits]), [11, true, 0]);

        const approvedNumberRound = async () => {
            numberDescriptor = await detectQuestion(page);
            assert.equal(numberDescriptor.kind, 'numberbox');
            approvals = [];
            result = await playNumberBoxRound(page, numberDescriptor, {
                enter: true,
                timeout: 1000,
                requireSubmitApproval: true,
                approveSubmit: async request => { approvals.push(request); return true; },
            });
            assert.equal(result.status, 'advanced');
            assert.equal(approvals.length, 1);
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits]), [11, true, 1]);
        };
        await page.goto(origin + '/lesson-number-box');
        await approvedNumberRound();

        await page.goto(origin + '/lesson-number-box');
        await unmarkAll('numberBoxFixture');
        await approvedNumberRound();

        await page.goto(origin + '/lesson-number-box');
        numberDescriptor = await detectQuestion(page);
        let numberFilled = false;
        result = await playNumberBoxRound(page, numberDescriptor, {
            enter: false,
            timeout: 0,
            requireSubmitApproval: true,
            approveSubmit: async () => { throw new Error('fill-only must not ask'); },
            log: () => { numberFilled = true; },
            shouldStop: () => numberFilled,
        });
        assert.equal(result.status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits]), [11, 0]);

        await page.goto(origin + '/lesson-number-box');
        numberDescriptor = await detectQuestion(page);
        let stopChecks = 0, submittedAt = 0, semiFilled = false;
        const semiResultPromise = playNumberBoxRound(page, numberDescriptor, {
            enter: false,
            timeout: 0,
            requireSubmitApproval: true,
            approveSubmit: async () => { throw new Error('semi-auto must not ask'); },
            // The user Submit must wait for the round's fill-complete log:
            // clicking earlier lands inside the round's post-fill state
            // checks, whose baseline-changed guard correctly refuses the
            // already-advanced question. The deadline runs from the click,
            // not the round start, so a slow trusted fill cannot consume
            // the advance-detection budget.
            log: () => { semiFilled = true; },
            shouldStop: () => { stopChecks++; return submittedAt > 0 && Date.now() - submittedAt >= 2000; },
        });
        await page.waitForFunction(() => numberBoxFixture.inputs.length === 11);
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('input.number-box-component')].map(input => input.value)), ['30', '30', '30', '94.20']);
        await new Promise(resolve => { const poll = () => semiFilled ? resolve() : setTimeout(poll, 25); poll(); });
        await page.evaluate(() => document.querySelector('#sa-navigation-controls button').click());
        submittedAt = Date.now();
        result = await semiResultPromise;
        assert.equal(result.status, 'advanced');
        assert.equal(stopChecks > 0, true);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.submits, numberBoxFixture.nexts]), [1, 0]);

        const expectedRefusalGuards = {
            manual: 'model-or-auto-mark',
            duplicate: 'component-association',
            nonnumeric: 'numeric-metadata',
            rounding: 'numeric-metadata',
            error: 'numeric-metadata',
            'private-error': 'numeric-metadata',
            'circular-options': 'state-shape',
            'bigint-options': 'state-shape',
            'private-marked': 'state-shape',
            'private-mode': 'state-shape',
            'private-game-mode': 'model-or-auto-mark',
            'unrounded-sf': 'answer-acceptance',
            'plus-sf': 'numeric-metadata',
            'negative-percent': 'numeric-metadata',
            'raw-option': 'state-shape',
            'resolved-option': 'state-shape',
            'missing-state': 'state-shape',
            initial: 'state-shape',
            readonly: 'box-shape',
            'wrong-element': 'state-shape',
            'unwrapped-element': 'state-shape',
            'wrapper-tag': 'state-shape',
            'extra-wrapper-child': 'state-shape',
            'wrapper-text-node': 'state-shape',
            unmarked: 'state-shape',
            'mixed-definition': 'component-count',
            'private-definition': 'component-count',
            'many-definitions': 'component-count',
            'mixed-type': 'component-types',
            'duplicate-ids': 'component-ids',
            'unmarked-definition': 'mixed-definition-marking',
            'invalid-marked': 'component-marked',
            'mismatched-marked': 'state-shape',
            'runtime-unmarked': 'state-shape',
            'stale-value': 'stored-value',
        };
        for (const mutation of ['manual', 'assessment', 'duplicate', 'nonnumeric', 'rounding', 'error', 'private-error', 'circular-options', 'bigint-options', 'private-marked', 'private-mode', 'private-game-mode', 'unrounded-sf', 'plus-sf', 'negative-percent', 'raw-option', 'resolved-option', 'missing-state', 'initial', 'readonly', 'wrong-element', 'unwrapped-element', 'wrapper-tag', 'extra-wrapper-child', 'wrapper-text-node', 'unmarked', 'mixed-definition', 'private-definition', 'many-definitions', 'mixed-type', 'duplicate-ids', 'unmarked-definition', 'invalid-marked', 'mismatched-marked', 'runtime-unmarked', 'stale-value', 'prefill']) {
            await page.goto(origin + '/lesson-number-box');
            await page.evaluate(m => {
                const f = numberBoxFixture, c = f.base['box-c'][0], s = c.componentState;
                if (m === 'manual') f.self.sectionData.activityGroup.isAutoMarked = false;
                if (m === 'assessment') f.self.model.gameMode = 2;
                if (m === 'duplicate') f.base['box-c'].push(c);
                if (m === 'nonnumeric') {
                    const d = f.q.questionDef.Components.find(def => def.ComponentID === 'box-c');
                    d.Options = ['pi'];
                    s.metadataInstance.Options = ['pi'];
                    s.answerOptions = ['pi'];
                    s.optionsInjector = [{ parts: [{ text: 'pi' }] }];
                }
                if (m === 'rounding') s.metadataInstance.RoundingTypeCode = 'ROUNDING_PRIVATE_SENTINEL';
                if (m === 'error') s.metadataInstance.AcceptableErrorValue = -1;
                if (m === 'private-error') s.metadataInstance.AcceptableErrorTypeCode = 'ERROR_PRIVATE_SENTINEL';
                if (m === 'circular-options') s.answerOptions = [s];
                if (m === 'bigint-options') s.answerOptions = [1n];
                if (m === 'private-marked') { c.marked = 'MARKED_PRIVATE_SENTINEL'; s.metadataInstance.Marked = 'MARKED_PRIVATE_SENTINEL'; }
                if (m === 'private-mode') c.renderingParameters.mode = 'MODE_PRIVATE_SENTINEL';
                if (m === 'private-game-mode') f.self.model.gameMode = 'GAME_MODE_PRIVATE_SENTINEL';
                if (m === 'unrounded-sf') {
                    const d = f.q.questionDef.Components.find(def => def.ComponentID === 'box-c');
                    for (const record of [d, s.metadataInstance]) {
                        record.Options = ['3.142'];
                        record.RoundingTypeCode = 'SF';
                        record.RoundingAmount = 2;
                    }
                    s.answerOptions = ['3.142'];
                    s.optionsInjector = [{ parts: [{ text: '3.142' }] }];
                }
                if (m === 'plus-sf' || m === 'negative-percent') {
                    const d = f.q.questionDef.Components.find(def => def.ComponentID === 'box-c');
                    const answer = m === 'plus-sf' ? '+30' : '-30';
                    for (const record of [d, s.metadataInstance]) {
                        record.Options = [answer];
                        record.RoundingTypeCode = m === 'plus-sf' ? 'SF' : 'NONE';
                        record.RoundingAmount = m === 'plus-sf' ? 2 : 0;
                        record.AcceptableErrorTypeCode = m === 'plus-sf' ? 'ABS' : '%';
                        record.AcceptableErrorValue = m === 'plus-sf' ? 0 : 10;
                    }
                    s.answerOptions = [answer];
                    s.optionsInjector = [{ parts: [{ text: answer }] }];
                }
                if (m === 'raw-option') f.q.questionDef.Components.find(d => d.ComponentID === 'box-c').Options = ['31'];
                if (m === 'resolved-option') s.answerOptions = ['31'];
                if (m === 'missing-state') delete c.componentState;
                if (m === 'initial') s.injectedInitialText = '3';
                if (m === 'readonly') c.textBox.readOnly = true;
                if (m === 'wrong-element') c.visualElement = document.body;
                if (m === 'unwrapped-element') c.visualElement = c.textBox;
                if (m === 'wrapper-tag') { const div = document.createElement('div'); c.visualElement.replaceWith(div); div.appendChild(c.textBox); c.visualElement = div; }
                if (m === 'extra-wrapper-child') c.visualElement.appendChild(document.createElement('span'));
                if (m === 'wrapper-text-node') c.visualElement.appendChild(document.createTextNode('x'));
                if (m === 'unmarked') s.metadataInstance.Marked = 2;
                if (m === 'mixed-definition') f.q.questionDef.Components.push({ ComponentTypeCode: 'TEXT_BOX_COMPONENT' });
                if (m === 'mixed-type') f.q.questionDef.Components.find(d => d.ComponentID === 'box-d').ComponentTypeCode = 'PRIVATE_TYPE_WITH_ANSWER';
                if (m === 'duplicate-ids') f.q.questionDef.Components.find(d => d.ComponentID === 'box-d').ComponentID = 'box-c';
                if (m === 'unmarked-definition') {
                    const d = f.q.questionDef.Components.find(def => def.ComponentID === 'box-d');
                    d.Marked = 0;
                    f.base['box-d'][0].marked = 0;
                    f.base['box-d'][0].componentState.metadataInstance.Marked = 0;
                }
                if (m === 'invalid-marked') f.q.questionDef.Components.find(d => d.ComponentID === 'box-d').Marked = 'MARKED_PRIVATE_SENTINEL';
                if (m === 'mismatched-marked') s.metadataInstance.Marked = 0;
                if (m === 'runtime-unmarked') {
                    for (const def of f.q.questionDef.Components) def.Marked = 0;
                    for (const entry of Object.values(f.base)) { entry[0].marked = 0; entry[0].componentState.metadataInstance.Marked = 0; }
                }
                if (m === 'private-definition') f.q.questionDef.Components.push({ ComponentTypeCode: 'PRIVATE_TYPE_WITH_ANSWER', ComponentID: 'private-id', Marked: 1 });
                if (m === 'many-definitions') for (let i = 0; i < 30; i++) f.q.questionDef.Components.push({ ComponentTypeCode: 'PRIVATE_TYPE_WITH_ANSWER', ComponentID: 'private-id-' + i, Marked: 1 });
                if (m === 'stale-value') c.textBox.value = '31';
                if (m === 'prefill') { c.textBox.value = '30'; s.userAnswer = '30'; s.isUserAnswerSet = true; }
            }, mutation);
            const d = await detectQuestion(page);
            assert.equal(d.kind, mutation === 'prefill' ? 'numberbox' : 'unsupported', mutation);
            if (expectedRefusalGuards[mutation]) {
                assert.equal(d.diagnostic?.guard, expectedRefusalGuards[mutation], mutation);
                assert.equal(['30', '94.2', '3.142', '+30', '-30', 'pi', 'box-a', 'box-b', 'box-c', 'box-d', 'PRIVATE_TYPE_WITH_ANSWER', 'private-id', 'ROUNDING_PRIVATE_SENTINEL', 'ERROR_PRIVATE_SENTINEL', 'MARKED_PRIVATE_SENTINEL', 'MODE_PRIVATE_SENTINEL', 'GAME_MODE_PRIVATE_SENTINEL', 'Select the correct definite article', 'armadietto', 'scuola'].some(text => JSON.stringify(d.diagnostic).includes(text)), false, mutation);
                assert.equal(d.diagnostic.componentTypes.length <= 20, true, mutation);
                if (mutation === 'circular-options' || mutation === 'bigint-options') assert.equal(d.diagnostic.answerOptionsValid, false, mutation);
                if (mutation === 'resolved-option') assert.equal(d.diagnostic.literalOptionsMatch, false, mutation);
                if (mutation === 'rounding') assert.deepEqual([d.diagnostic.roundingType, d.diagnostic.roundingTypeValid], [null, false], mutation);
                if (mutation === 'private-error') assert.deepEqual([d.diagnostic.acceptableErrorType, d.diagnostic.acceptableErrorTypeValid], [null, false], mutation);
                if (mutation === 'private-marked') assert.deepEqual([d.diagnostic.componentMarked, d.diagnostic.metadataMarked, d.diagnostic.componentMarkedValid, d.diagnostic.metadataMarkedValid], [null, null, false, false], mutation);
                if (mutation === 'private-mode') assert.deepEqual([d.diagnostic.renderingMode, d.diagnostic.renderingModeValid], [null, false], mutation);
                if (mutation === 'private-game-mode') assert.equal(d.diagnostic.gameMode, null, mutation);
                if (mutation === 'unrounded-sf') assert.deepEqual([d.diagnostic.roundingType, d.diagnostic.acceptableErrorType], ['SF', 'ABS'], mutation);
                if (mutation === 'mixed-type') assert.deepEqual([d.diagnostic.componentTypes.filter(t => t === 'UNLISTED_COMPONENT').length, d.diagnostic.componentIdsValid], [1, true], mutation);
                if (mutation === 'duplicate-ids') assert.deepEqual([d.diagnostic.componentCount, d.diagnostic.uniqueComponentIds], [4, 3], mutation);
                if (mutation === 'unmarked-definition') assert.deepEqual([d.diagnostic.markedDefCount, d.diagnostic.unmarkedDefCount], [3, 1], mutation);
                if (mutation === 'invalid-marked') assert.deepEqual([d.diagnostic.markedDefCount, d.diagnostic.unmarkedDefCount, d.diagnostic.invalidMarkedDefCount, d.diagnostic.invalidMetadataMarkedZeroCount, d.diagnostic.invalidMetadataMarkedOneCount], [3, 0, 1, 0, 1], mutation);
                if (mutation === 'mismatched-marked') assert.deepEqual([d.diagnostic.metadataMarked, d.diagnostic.metadataMarkedValid, d.diagnostic.definitionMarkedMatches], [0, true, false], mutation);
                if (mutation === 'runtime-unmarked') assert.deepEqual([d.diagnostic.componentMarked, d.diagnostic.componentMarkedValid, d.diagnostic.metadataMarked, d.diagnostic.definitionMarkedMatches], [0, false, 0, true], mutation);
            } else assert.equal(d.diagnostic, undefined, mutation);
            const refused = await playNumberBoxRound(page, d, {
                enter: true,
                timeout: 200,
                requireSubmitApproval: true,
                approveSubmit: async () => { throw new Error('refusal must not ask'); },
            });
            assert.equal(refused.status, 'stopped', mutation);
            assert.equal(refused.reason, 'unsafe-or-changed-state', mutation);
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits]), [0, 0], mutation);
        }
        // Variable-bearing option templates (EP BasicVariableInjector): raw
        // def and metadata keep {expression} templates; answerOptions carry
        // the resolved values. The injector record proves raw agreement.
        await page.goto(origin + '/lesson-number-box-variables');
        {
            const vd = await detectQuestion(page);
            assert.equal(vd.kind, 'numberbox', JSON.stringify(vd));
            assert.deepEqual(vd.boxes.map(b => b.answer), ['42']);
            const vr = await playNumberBoxRound(page, vd, { enter: true, timeout: 1000, requireSubmitApproval: true, approveSubmit: async () => true });
            assert.equal(vr.status, 'advanced');
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits]), [2, true, 1]);
        }
        await page.goto(origin + '/lesson-textbox-variables');
        {
            const vd = await detectQuestion(page);
            assert.equal(vd.kind, 'textbox', JSON.stringify(vd));
            assert.deepEqual(vd.boxes.map(b => b.answer), ['armadietto']);
            const vr = await playTextboxRound(page, vd, { enter: true, timeout: 1000 });
            assert.equal(vr.status, 'advanced');
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [10, 1]);
        }
        const variableRefusal = async (mutate, facts) => {
            await page.goto(origin + '/lesson-number-box-variables');
            await page.evaluate(mutate);
            const bad = await detectQuestion(page);
            assert.equal(bad.kind, 'unsupported');
            assert.equal(bad.diagnostic.guard, 'state-shape');
            for (const [key, value] of Object.entries(facts)) assert.equal(bad.diagnostic[key], value, key);
            assert.equal(JSON.stringify(bad.diagnostic).includes('42'), false);
            const refused = await playNumberBoxRound(page, bad, { enter: true, timeout: 200, requireSubmitApproval: true, approveSubmit: async () => { throw new Error('refusal must not ask'); } });
            assert.equal(refused.status, 'stopped');
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits]), [0, 0]);
        };
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector[0].parts[0].text = 'tampered'; }, { optionTemplatesMatch: false, literalOptionsMatch: true });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector[0].parts = [{ text: '{n}' }]; }, { optionTemplatesMatch: false });
        await variableRefusal(() => { delete numberBoxFixture.base['box-v'][0].componentState.optionsInjector; }, { optionInjectorCount: null, optionTemplatesMatch: false });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector.push({ parts: [{ text: 'x' }] }); }, { optionInjectorCount: 2, optionTemplatesMatch: false });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector[0].parts[1].temporaryVariable = {}; }, { optionTemplatesMatch: false });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector[0].parts[1].temporaryVariable.expression = ''; }, { optionTemplatesMatch: false });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector = new Array(1); }, { optionInjectorCount: 1, optionTemplatesMatch: false });
        await variableRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.answerOptions = ['42', '43']; }, { literalOptionsMatch: false });
        await variableRefusal(() => { const d = numberBoxFixture.q.questionDef.Components.find(d => d.ComponentID === 'box-v'); window.__toJsonCalls = 0; d.Options.toJSON = () => { window.__toJsonCalls++; return ['42']; }; }, { definitionOptionsMatch: false });
        assert.equal(await page.evaluate(() => window.__toJsonCalls), 0);
        await variableRefusal(() => { const d = numberBoxFixture.q.questionDef.Components.find(d => d.ComponentID === 'box-v'); d.Options['4294967295'] = 'smuggled'; }, { definitionOptionsMatch: false });
        await page.goto(origin + '/lesson-textbox-variables');
        await page.evaluate(() => { textboxFixture.base['box-v'][0].componentState.optionsInjector[0].parts.push({ text: 'extra' }); });
        {
            const bad = await detectQuestion(page);
            assert.equal(bad.kind, 'unsupported');
            assert.equal(bad.diagnostic.guard, 'state-shape');
            assert.equal(bad.diagnostic.optionTemplatesMatch, false);
            const refused = await playTextboxRound(page, bad, { enter: true, timeout: 200 });
            assert.equal(refused.status, 'stopped');
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits]), [0, 0]);
        }
        // Mixed-component slide: one text box beside a MULTICHOICE component
        // (three radio option inputs) must keep refusing at lesson-dom, and the
        // refusal identifies the component mix and control shapes it saw.
        await page.goto(origin + '/lesson-textbox-mixed');
        {
            const bad = await detectQuestion(page);
            assert.equal(bad.kind, 'unsupported');
            const d = bad.diagnostic;
            assert.equal(d.kind, 'textbox-refusal');
            assert.equal(d.guard, 'lesson-dom');
            assert.equal(d.componentCount, 2);
            assert.deepEqual(d.componentTypes, ['UNLISTED_COMPONENT', 'TEXT_BOX_COMPONENT']);
            assert.equal(d.editableControlCount, 4);
            assert.deepEqual(d.editableControlShapes, { 'input:text': 1, 'input:radio': 3 });
            assert.equal(JSON.stringify(d).includes('alpha'), false);
            assert.equal(JSON.stringify(d).includes('invented-zeta'), false);
            const refused = await playTextboxRound(page, bad, { enter: true, timeout: 200 });
            assert.equal(refused.status, 'stopped');
            assert.deepEqual(await page.evaluate(() => [textboxFixture.inputs.length, textboxFixture.submits, document.querySelectorAll('input[type="radio"]:checked').length]), [0, 0, 0]);
        }
        console.log('Textbox source-derived browser fixtures PASS: DOM-order2fields/9trustedcharacters/1Submit; fill-only0Submit; 25 initial refusals; 5 mid-input stops after1character/0Submit;3 deterministic unsupported/modal transitions. Number boxes: DOM-order4fields/11trustedcharacters, DP-format answer validation, one approval gate, 1Submit, fill-only0Submit, semi-auto advance after user Submit, authored-unmarked textbox and number-box rounds complete with 1Submit each, 31 sanitized guard diagnostics and33refusals; variable-template number-box and textbox slides fill+submit, eleven injector tamper refusals0input; mixed textbox+multichoice slide refuses with component-mix diagnostic0input. Not live proof.');
    } finally { try { if (browser) await browser.close(); } finally { await new Promise(r => server.close(r)); } }
})().catch(e => { console.error(e); process.exitCode = 1; });
