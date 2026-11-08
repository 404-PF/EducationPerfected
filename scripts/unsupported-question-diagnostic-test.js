const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
const { detectQuestion } = require('../lib/detect-question');

async function installUnsupportedSlide(page, componentType, controlTag = 'input') {
    await page.evaluate(({ type, tag }) => {
        const self = window.angular.element(document.querySelector('#slide-host')).scope().self;
        const q = self.model._currentQuestion;
        q.questionType = 9;
        q.questionDef.Components = [{ ComponentTypeCode: type, ComponentID: 'unsupported-1', Marked: 1 }];
        document.querySelector('.multi-choice-component')?.remove();
        document.querySelector('.synthetic-unsupported-control')?.remove();
        const group = document.querySelector('#question-container-group');
        group.textContent = 'Private unsupported question content';
        const control = document.createElement(tag);
        control.className = 'synthetic-unsupported-control';
        group.append(control);
        window.unsupportedInputEvents = 0;
        window.unsupportedSubmits = 0;
        control.addEventListener('keydown', () => window.unsupportedInputEvents++);
        control.addEventListener('input', () => window.unsupportedInputEvents++);
        document.querySelector('#sa-navigation-controls button')?.addEventListener('click', () => window.unsupportedSubmits++);
    }, { type: componentType, tag: controlTag });
}

function expectedDiagnostic(componentTypes, controls) {
    return {
        modelReadable: true,
        gameMode: 3,
        questionType: 9,
        componentCount: 1,
        componentTypes,
        controls: {
            inputs: controls === 'input' ? 1 : 0,
            textareas: controls === 'textarea' ? 1 : 0,
            selects: 0,
            contentEditable: 0,
            canvases: 0,
            buttons: 0,
        },
    };
}

(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin + '/lesson');
        await installUnsupportedSlide(page, 'FILE_UPLOADER_COMPONENT');
        let descriptor = await detectQuestion(page);
        assert.equal(descriptor.kind, 'unsupported');
        assert.equal(descriptor.reason, 'lesson slide with an unsupported question type (not text, choice, or audio)');
        assert.deepEqual(descriptor.diagnostic, expectedDiagnostic(['FILE_UPLOADER_COMPONENT'], 'input'));

        await page.goto(origin + '/lesson');
        await installUnsupportedSlide(page, 'LONG_ANSWER_COMPONENT', 'textarea');
        descriptor = await detectQuestion(page);
        assert.deepEqual(descriptor.diagnostic, expectedDiagnostic(['LONG_ANSWER_COMPONENT'], 'textarea'));

        await page.goto(origin + '/lesson');
        await installUnsupportedSlide(page, 'PRIVATE_TYPE_WITH_ANSWER');
        descriptor = await detectQuestion(page);
        assert.deepEqual(descriptor.diagnostic, expectedDiagnostic(['UNLISTED_COMPONENT'], 'input'));
        assert.equal(JSON.stringify(descriptor.diagnostic).includes('PRIVATE_TYPE_WITH_ANSWER'), false);
        assert.equal(JSON.stringify(descriptor.diagnostic).includes('Private unsupported question content'), false);

        await page.goto(origin + '/lesson');
        await installUnsupportedSlide(page, 'FILE_UPLOADER_COMPONENT');
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('lesson slide with an unsupported question type (not text, choice, or audio)'));
        const diagnosticLine = 'Unsupported question diagnostic ' + JSON.stringify(expectedDiagnostic(['FILE_UPLOADER_COMPONENT'], 'input'));
        assert.equal(session.output.slice(offset).includes(diagnosticLine), true);
        assert.deepEqual(await page.evaluate(() => [window.unsupportedInputEvents, window.unsupportedSubmits]), [0, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session.cleanup();
    }
    console.log('Unsupported question diagnostic PASS: file-uploader and long-answer component types are named, unlisted types and question content stay redacted, and the real CLI stops with zero input or Submit. Synthetic only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
