const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');

async function bootNumberBoxCli() {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    await session.page.goto(session.origin + '/lesson-number-box');
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

async function run(approval, succeed) {
    let session;
    try {
        session = await bootNumberBoxCli();
        const { child, page, wait } = session;
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Number-box Submit approval required for numberbox:'));
        const promptOutput = session.output.slice(offset);
        assert.equal(promptOutput.split('Number-box Submit approval required for numberbox:').length - 1, 1);
        assert.equal(promptOutput.includes('(4 boxes).'), true);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits, numberBoxFixture.nexts]), [11, true, 0, 0]);
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

(async () => {
    await run('yes', true);
    await run('no', false);

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
    session = undefined;
    try {
        session = await bootNumberBoxCli();
        const { child, page, wait } = session;
        await page.evaluate(() => { numberBoxFixture.self.sectionData.activityGroup.isAutoMarked = false; });
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Unsupported question diagnostic '));
        const output = String(session.output.slice(offset));
        assert.equal(output.includes('"guard":"model-or-auto-mark"'), true);
        assert.equal(output.includes('30') || output.includes('94.2'), false);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits, numberBoxFixture.nexts]), [0, 0, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
    session = undefined;
    try {
        session = await bootNumberBoxCli();
        const { child, page, wait } = session;
        await page.evaluate(() => { numberBoxFixture.afterInput = () => {
            if (numberBoxFixture.inputs.length === 11) {
                const button = document.querySelector('#sa-navigation-controls button');
                button.parentElement.append(button.cloneNode(true));
            }
        }; });
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Unsupported question diagnostic '));
        const output = String(session.output.slice(offset));
        assert.equal(output.includes('"guard":"submit-controls"'), true);
        assert.equal(output.includes('30') || output.includes('94.2'), false);
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.submits, numberBoxFixture.nexts]), [11, 0, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
    session = undefined;
    try {
        session = await bootNumberBoxCli();
        const { child, page, wait } = session;
        await page.evaluate(() => {
            for (const def of numberBoxFixture.q.questionDef.Components) def.Marked = 0;
            for (const entry of Object.values(numberBoxFixture.base)) entry[0].componentState.metadataInstance.Marked = 0;
        });
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Number-box Submit approval required for numberbox:'));
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.inputs.length, numberBoxFixture.inputs.every(e => e.trusted), numberBoxFixture.submits, numberBoxFixture.nexts]), [11, true, 0, 0]);
        child.stdin.write('yes\n');
        await wait(() => session.output.slice(offset).includes('Lesson completed.'));
        assert.deepEqual(await page.evaluate(() => [numberBoxFixture.submits, numberBoxFixture.nexts]), [1, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally {
        await session?.cleanup();
    }
    console.log('Number-box normal CLI PASS: DOM-order four boxes, 11 trusted characters, one typed-yes approval before one trusted Submit, non-yes denial stops without Submit, browser stop cancels pending approval without Submit, detection and Submit refusal diagnostics, authored-unmarked slide completes, proven completion, no Next, clean quit. Synthetic only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
