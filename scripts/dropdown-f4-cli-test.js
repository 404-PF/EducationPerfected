const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
const { installDropdownFixture } = require('./dropdown-fixture');
(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin + '/lesson');
        await page.evaluate(installDropdownFixture, 1);
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
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes('Dropdown Submit approval required for dropdown:'));
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.keys.map(event => event.key), dropdownFixture.submits, dropdownFixture.nexts]), [['F4'], 0, 0]);
        child.stdin.write('yes\n');
        await wait(() => session.output.slice(offset).includes('Lesson completed.'));
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.keys.map(event => event.key), dropdownFixture.keys.every(event => event.trusted), dropdownFixture.changes.map(event => event.index), dropdownFixture.submits, dropdownFixture.nexts]), [['F4'], true, [2], 1, 0]);
        child.stdin.write('quit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
    } finally { await session.cleanup(); }
    for (const deniedInput of ['yes please', 'no']) {
        const deniedSession = await bootFixtureCli('cli.js', 'Commands: start');
        const { child: deniedChild, page: deniedPage, origin: deniedOrigin, wait: deniedWait } = deniedSession;
        try {
            await deniedPage.goto(deniedOrigin + '/lesson');
            await deniedPage.evaluate(installDropdownFixture, 1);
            deniedChild.stdin.write('mode auto\n');
            await deniedWait(() => deniedSession.output.includes('"mode":"auto"'));
            const deniedOffset = deniedSession.output.length;
            deniedChild.stdin.write('start\n');
            await deniedWait(() => deniedSession.output.slice(deniedOffset).includes('Dropdown Submit approval required for dropdown:'));
            assert.deepEqual(await deniedPage.evaluate(() => [dropdownFixture.keys.map(event => event.key), dropdownFixture.submits, dropdownFixture.nexts]), [['F4'], 0, 0]);
            deniedChild.stdin.write(deniedInput + '\n');
            await deniedWait(() => deniedSession.output.slice(deniedOffset).includes('Dropdown Submit not approved; stopping without Submit.'));
            await deniedWait(() => deniedSession.output.slice(deniedOffset).includes('answerLoop Exited.'));
            assert.deepEqual(await deniedPage.evaluate(() => [dropdownFixture.keys.map(event => event.key), dropdownFixture.submits, dropdownFixture.nexts]), [['F4'], 0, 0]);
            deniedChild.stdin.write('quit\n');
            await deniedWait(() => deniedChild.exitCode !== null);
            assert.equal(deniedChild.exitCode, 0, deniedInput);
        } finally { await deniedSession.cleanup(); }
    }
    console.log('Dropdown F4 normal CLI PASS: default input, owned trace, one dropdown, terminal approval before one trusted Submit, two non-yes denials stop without Submit, proven completion, no Next, clean quit. Synthetic Linux only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
