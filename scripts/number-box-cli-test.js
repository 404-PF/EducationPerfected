const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');

async function bootNumberBoxCli(path = '/lesson-number-box') {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    await session.page.goto(session.origin + path);
    await session.page.evaluate(() => {
        document.querySelector('#sa-navigation-controls button').addEventListener('click', () => {
            numberBoxFixture.group.remove();
            document.querySelector('#question-container-group').remove();
            numberBoxFixture.self.model._currentQuestion = null;
            const exit = document.querySelector('button.exit-button');
            exit.hidden = false;
            exit.style.display = '';
        });
    });
    return session;
}

async function run(approval, succeed, options = {}) {
    const { prepare, path, prompt = '(4 boxes).', expectedInputs = 11, expectedValues } = options;
    let session;
    try {
        session = await bootNumberBoxCli(path);
        const { child, page, wait } = session;
        if (prepare) await page.evaluate(prepare);
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Number-box Submit approval required for numberbox:'));
        const promptOutput = session.output.slice(offset);
        assert.equal(promptOutput.split('Number-box Submit approval required for numberbox:').length - 1, 1);
        assert.equal(promptOutput.includes(prompt), true);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits, numberBoxFixture.nexts]), [expectedInputs, true, 0, 0]);
        if (expectedValues) assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('input.number-box-component')].map(input => input.value)), expectedValues);
        child.stdin.write(approval + '\n');
        if (succeed) {
            await wait(() => session.output.slice(offset).includes('Lesson completed.'));
            assert.equal(session.output.slice(offset).split('Filled exact lesson number-box answers.').length - 1, 1);
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.submits, numberBoxFixture.nexts]), [1, 0]);
        } else {
            await wait(() => session.output.slice(offset).includes('Number-box Submit not approved; stopping without Submit.'));
            await wait(() => session.output.slice(offset).includes('Lesson number boxes stopped: changed or unsupported state; no retry.'));
            assert.deepEqual(await page.evaluate(() => [numberBoxFixture.submits, numberBoxFixture.nexts]), [0, 0]);
        }
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
}

const unmarkAllBoxes = () => {
    for (const def of numberBoxFixture.q.questionDef.Components) def.Marked = 0;
    for (const entry of Object.values(numberBoxFixture.base)) entry[0].componentState.metadataInstance.Marked = 0;
};

async function expectRefusal(prepare, guard, expectedInputs, options = {}) {
    const { path, forbidden = ['30', '94.2'] } = options;
    let session;
    try {
        session = await bootNumberBoxCli(path);
        const { child, page, wait } = session;
        await page.evaluate(prepare);
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Unsupported question diagnostic '));
        const output = String(session.output.slice(offset));
        assert.equal(output.includes(`"guard":"${guard}"`), true);
        assert.equal(forbidden.some(text => output.includes(text)), false);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits, numberBoxFixture.nexts]), [expectedInputs, 0, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
}

(async () => {
    await run('yes', true);
    await run('no', false);
    await run('yes', true, { prepare: unmarkAllBoxes });
    await run('yes', true, { path: '/lesson-number-box-variables', prompt: '(1 boxes).', expectedInputs: 2, expectedValues: ['42'] });

    let session;
    try {
        session = await bootNumberBoxCli();
        const { child, page, wait } = session;
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Number-box Submit approval required for numberbox:'));
        const stopped = await page.evaluate(() => window.epTestStop());
        assert.equal(stopped.state, 'stopped');
        await wait(() => session.output.slice(offset).includes('Number-box Submit approval cancelled; stopping without Submit.'));
        assert.equal(session.output.slice(offset).includes('Lesson number boxes stopped: changed or unsupported state'), false);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits, numberBoxFixture.nexts]), [11, true, 0, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
    await expectRefusal(() => { numberBoxFixture.self.sectionData.activityGroup.isAutoMarked = false; }, 'model-or-auto-mark', 0);
    await expectRefusal(() => {
        numberBoxFixture.afterInput = () => {
            if (numberBoxFixture.inputs.length === 11) {
                const button = document.querySelector('#sa-navigation-controls button');
                button.parentElement.append(button.cloneNode(true));
            }
        };
    }, 'submit-controls', 11);
    await expectRefusal(() => { numberBoxFixture.base['box-c'][0].marked = 0; }, 'state-shape', 0);
    await expectRefusal(() => { const c = numberBoxFixture.base['box-c'][0]; c.visualElement = c.textBox; }, 'state-shape', 0);
    await expectRefusal(() => { numberBoxFixture.base['box-v'][0].componentState.optionsInjector[0].parts[0].text = 'tampered'; }, 'state-shape', 0, { path: '/lesson-number-box-variables', forbidden: ['42'] });
    console.log('Number-box normal CLI PASS: DOM-order four boxes, 11 trusted characters, one typed-yes approval before one trusted Submit, non-yes denial stops without Submit, browser stop cancels pending approval without Submit, detection, Submit, runtime-marked, visual-element and injector refusal diagnostics, authored-unmarked slide completes, variable-template slide completes with one approval and one Submit, proven completion, no Next, clean quit. Synthetic only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
