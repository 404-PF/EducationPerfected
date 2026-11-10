const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
const { collectSelfMarkDiagnostics } = require('../lib/self-mark-diagnostics');
async function install(page) {
    await page.evaluate(() => {
        const self = window.angular.element(document.querySelector('#slide-host')).scope().self;
        const q = self.model._currentQuestion;
        q.questionMarkingStyle = 3;
        self.sectionData.activityGroup.isAutoMarked = false;
        self.sectionData.activityGroup.isSelfMarked = true;
        q.questionDef.Components = [{ ComponentTypeCode: 'LONG_ANSWER_COMPONENT', ComponentID: 'private-id',
            CorrectOptions: ['private-answer'], ModelAnswer: 'private-model-answer', PrivateKey: 'private-value', InputType: 1 }];
        document.querySelector('.multi-choice-component')?.remove();
        const group = document.querySelector('#question-container-group');
        group.textContent = 'private-question';
        const input = document.createElement('textarea'); input.value = 'private-response'; input.className = 'private-class';
        const grade = document.createElement('select');
        grade.innerHTML = '<option>private-grade</option>';
        const button = document.createElement('button'); button.textContent = 'private-button';
        group.append(input, grade, button);
        window.inspectionCounts = { events: 0, getters: 0 };
        for (const name of ['click', 'keydown', 'input', 'change', 'focus']) document.addEventListener(name, () => window.inspectionCounts.events++, true);
        Object.defineProperty(q.questionDef.Components[0], 'Answers', { get() { window.inspectionCounts.getters++; throw new Error('private-error'); } });
    });
}
(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { page, child, origin, wait } = session;
    try {
        await page.goto(origin + '/lesson'); await install(page);
        const result = await collectSelfMarkDiagnostics(page);
        assert.equal(result.guard, 'captured');
        assert.equal(result.markingStyles.question, 3);
        assert.equal(result.isSelfMarked, true);
        assert.equal(result.components[0].type, 'LONG_ANSWER_COMPONENT');
        assert.equal(result.components[0].fields.CorrectOptions, 'array');
        assert.equal(result.components[0].fields.Answers, 'accessor');
        assert.deepEqual(result.dom.controls.map(c => c.tag), ['textarea', 'select', 'button']);
        assert.equal(result.dom.controls[1].optionCount, 1);
        assert.equal(JSON.stringify(result).includes('private-'), false);
        assert.equal(JSON.stringify(result).includes('PrivateKey'), false);
        assert.deepEqual(await page.evaluate(() => inspectionCounts), { events: 0, getters: 0 });
        // Explicit inspection, no start command and no automatic answer-loop path.
        let offset = session.output.length;
        child.stdin.write('inspect-self-mark\n');
        await wait(() => session.output.slice(offset).includes('EP_SELF_MARK_INSPECT '));
        let output = session.output.slice(offset);
        assert.equal(output.includes('LONG_ANSWER_COMPONENT'), true);
        assert.equal(output.includes('private-'), false);
        assert.equal(session.output.includes('answerLoop entered.'), false);
        assert.deepEqual(await page.evaluate(() => inspectionCounts), { events: 0, getters: 0 });
        await page.evaluate(() => {
            const host = document.querySelector('#ep-question-container');
            const paper = document.createElement('div'); paper.className = 'paper-mode-container';
            const message = document.createElement('div'); message.className = 'marking-message';
            const outside = document.createElement('input');
            host.prepend(paper, message, outside);
        });
        const markers = await collectSelfMarkDiagnostics(page);
        assert.equal(markers.dom.paperMode, true); assert.equal(markers.dom.markingMessage, true);
        assert.deepEqual(markers.dom.controls.map(c => c.tag), ['textarea', 'select', 'button']);
        // Unknown styles are reported as null, never coerced; unknown codes redacted.
        await page.evaluate(() => {
            const q = angular.element(document.querySelector('#slide-host')).scope().self.model._currentQuestion;
            q.questionMarkingStyle = '3'; q.questionDef.Components[0].ComponentTypeCode = 'PRIVATE_COMPONENT';
        });
        const unknown = await collectSelfMarkDiagnostics(page);
        assert.equal(unknown.markingStyles.question, null);
        assert.equal(unknown.components[0].type, 'UNLISTED_COMPONENT');
        await page.evaluate(() => {
            const group = document.querySelector('#question-container-group');
            const input = document.createElement('input'); group.append(input);
            const hidden = document.createElement('input'); hidden.style.visibility = 'hidden'; group.append(hidden);
            const collapse = document.createElement('button'); collapse.style.visibility = 'collapse'; group.append(collapse);
        });
        const visibility = await collectSelfMarkDiagnostics(page);
        assert.equal(visibility.dom.controls[3].type, 'text');
        assert.equal(visibility.dom.controls[3].visible, true);
        assert.equal(visibility.dom.controls[4].visible, false);
        assert.equal(visibility.dom.controls[5].visible, false);
        await page.evaluate(() => {
            const group = document.querySelector('#question-container-group');
            for (let i = 0; i < 2100; i++) group.append(document.createElement('input'));
        });
        const capped = await collectSelfMarkDiagnostics(page);
        assert.equal(capped.dom.controls.length, 40);
        assert.equal(capped.dom.controlsTruncated, true);
        assert.equal(capped.dom.traversalTruncated, true);
        // A throwing local scope must not select a readable ancestor model.
        await page.evaluate(() => {
            window.savedAngular = window.angular;
            const group = document.querySelector('#question-container-group');
            window.angular = { element(el) { if (el === group) throw new Error('private-scope'); return savedAngular.element(el); } };
        });
        assert.equal((await collectSelfMarkDiagnostics(page)).guard, 'not-lesson-mode');
        await page.evaluate(() => { window.angular = window.savedAngular; });
        // Assessment boundary before any question-property access.
        await page.evaluate(() => {
            const model = angular.element(document.querySelector('#slide-host')).scope().self.model;
            model.gameMode = 2;
            Object.defineProperty(model, '_currentQuestion', { get() { inspectionCounts.getters++; throw new Error('private-assessment'); } });
        });
        assert.equal((await collectSelfMarkDiagnostics(page)).guard, 'assessment-mode');
        assert.deepEqual(await page.evaluate(() => inspectionCounts), { events: 0, getters: 0 });
        child.stdin.write('quit\n'); await wait(() => child.exitCode !== null); assert.equal(child.exitCode, 0);
    } finally { await session.cleanup(); }
    // Bounded collector: pre-cancel, errors, timeout, late rejection handled.
    let reads = 0;
    assert.equal((await collectSelfMarkDiagnostics({ evaluate() { reads++; } }, { shouldStop: () => true })).guard, 'cancelled');
    assert.equal(reads, 0);
    assert.equal((await collectSelfMarkDiagnostics({ evaluate() { throw new Error('private-error'); } })).guard, 'inspection-unavailable');
    let reject;
    assert.equal((await collectSelfMarkDiagnostics({ evaluate() { return new Promise((_, no) => { reject = no; }); } }, { timeoutMs: 5 })).guard, 'timeout');
    reject(new Error('late-private-error')); await new Promise(resolve => setImmediate(resolve));
    console.log('Self-mark inspection PASS: explicit stopped CLI command, fixed structural fields, zero input/Submit/getters, assessment early stop, redaction, timeout/cancel/error. Synthetic only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
