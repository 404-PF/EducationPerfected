const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');
const { installDropdownFixture } = require('./dropdown-fixture');
(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start', { EP_DROPDOWN_INPUT: 'f4-popup' });
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
        console.log('Dropdown F4 normal CLI PASS: opt-in env, owned trace, one dropdown, terminal approval before one trusted Submit, proven completion, no Next, clean quit. Synthetic Linux only.');
    } finally { await session.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
