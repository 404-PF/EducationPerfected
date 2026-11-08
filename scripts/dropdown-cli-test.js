const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
const { expectedPopupChanges, expectedPopupKeys, installPopupEmulation } = require('./dropdown-popup-test-helpers');

async function installSubmitCompletion(page) {
    await page.evaluate(() => {
        const submit = document.querySelector('#sa-navigation-controls button');
        submit.addEventListener('click', () => {
            dropdownFixture.group.remove();
            document.querySelector('#question-container-group').remove();
            dropdownFixture.self.model._currentQuestion = null;
            const exit = document.querySelector('button.exit-button');
            exit.hidden = false;
            exit.style.display = '';
        });
    });
}

async function bootDropdownCli(count, extraEnv = {}) {
    const session = await bootFixtureCli('cli.js', 'Commands: start', extraEnv);
    await session.page.goto(session.origin + '/lesson-dropdown?count=' + count);
    return session;
}

async function assertMultiDropdownSuccess(count, extraEnv = {}) {
    const session = await bootDropdownCli(count, extraEnv);
    const { child, page, wait } = session;
    try {
        await installPopupEmulation(page);
        await installSubmitCompletion(page);
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Dropdown Submit approval required for dropdown:'));
        const promptOutput = session.output.slice(offset);
        assert.equal(promptOutput.split('Dropdown Submit approval required for dropdown:').length - 1, 1, count);
        assert.equal(promptOutput.includes('(' + count + ' dropdown).'), true, count);
        assert.deepEqual(await page.evaluate(() => dropdownFixture.keys), expectedPopupKeys(count), count);
        assert.deepEqual(await page.evaluate(() => dropdownFixture.changes), expectedPopupChanges(count), count);
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.submits, dropdownFixture.nexts]), [0, 0], count);
        child.stdin.write('yes\n');
        await wait(() => session.output.slice(offset).includes('Lesson completed.'));
        assert.equal(session.output.slice(offset).split('Selected exact lesson dropdown answers.').length - 1, 1, count);
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.submits, dropdownFixture.nexts]), [1, 0], count);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0, count);
    } finally {
        await session.cleanup();
    }
}

async function assertMidSequenceFailure() {
    const session = await bootDropdownCli(3);
    const { child, page, wait } = session;
    try {
        await installPopupEmulation(page, { closeOnArrowAt: 1 });
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Lesson dropdowns stopped: changed or unsupported state; no retry.'));
        const refusalOutput = session.output.slice(offset);
        const refusalLines = new Set(refusalOutput.split('\n'));
        assert.equal(refusalLines.has('Dropdown refusal diagnostic {"phase":"after-popup-arrow","dropdownIndex":1,"keyDispatchesReturned":6,"guard":"popup-closed-before-commit","dropdownCount":3}'), true);
        assert.equal(refusalOutput.includes('Dropdown Submit approval required'), false);
        assert.equal(refusalOutput.includes('Selected exact lesson dropdown answers.'), false);
        assert.deepEqual(await page.evaluate(() => dropdownFixture.keys), expectedPopupKeys(3, true));
        assert.deepEqual(await page.evaluate(() => dropdownFixture.changes), expectedPopupChanges(1));
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.submits, dropdownFixture.nexts]), [0, 0]);
        child.stdin.write('status\nquit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session.cleanup();
    }
}

(async () => {
    await assertMultiDropdownSuccess(2);
    await assertMultiDropdownSuccess(3);
    await assertMultiDropdownSuccess(5, { EP_DROPDOWN_INPUT: 'legacy' });
    await assertMidSequenceFailure();
    console.log('Dropdown normal CLI PASS: F4 popup handles two, three and five dropdowns in order, ignores EP_DROPDOWN_INPUT=legacy, asks once before one Submit, stops a mid-sequence failure without Submit, and prints the sanitized refusal diagnostic. Synthetic Linux only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
