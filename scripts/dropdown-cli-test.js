const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');

async function assertF4OnlyBoot(label, extraEnv) {
    const session = await bootFixtureCli('cli.js', 'Commands: start', extraEnv);
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin + '/lesson-dropdown');
        child.stdin.write('mode semi\n');
        await wait(() => session.output.includes('"mode":"semi"'));
        const offset = session.output.length;
        await page.keyboard.down('Alt');
        await page.keyboard.press('s');
        await page.keyboard.up('Alt');
        await wait(() => session.output.slice(offset).includes('Lesson dropdowns stopped: changed or unsupported state; no retry.'));
        assert.equal(session.output.slice(offset).includes('Selected exact lesson dropdown answers.'), false, label);
        assert.equal(session.output.slice(offset).includes('Dropdown Submit approval required'), false, label);
        assert.deepEqual(await page.evaluate(() => [dropdownFixture.keys.length, dropdownFixture.changes.length, dropdownFixture.submits, dropdownFixture.nexts]), [0, 0, 0, 0], label);
        child.stdin.write('status\nquit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0, label);
    } finally {
        await session.cleanup();
    }
}

(async () => {
    await assertF4OnlyBoot('default', {});
    await assertF4OnlyBoot('legacy-env-ignored', { EP_DROPDOWN_INPUT: 'legacy' });
    console.log('Dropdown normal CLI boundary PASS: F4-only single-dropdown guard refuses the five-dropdown fixture before input, and EP_DROPDOWN_INPUT=legacy no longer restores Home/ArrowDown. Synthetic Linux only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
