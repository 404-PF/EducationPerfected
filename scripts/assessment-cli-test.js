const assert = require('node:assert/strict');
const { bootFixtureCli } = require('./fixture-cli-session');

const REASON = 'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled';

(async () => {
    const session = await bootFixtureCli('cli.js', 'Commands: start');
    const { child, page, origin, wait } = session;
    try {
        await page.goto(origin + '/lesson-assessment', { waitUntil: 'domcontentloaded' });
        child.stdin.write('mode auto\n');
        await wait(() => session.output.includes('"mode":"auto"'));
        const offset = session.output.length;
        child.stdin.write('start\n');
        await wait(() => session.output.slice(offset).includes(REASON));
        await wait(() => session.output.slice(offset).includes('answerLoop Exited.'));
        assert.deepEqual(await page.evaluate(() => window.assessmentCounts), { clicks: 0, inputs: 0, keys: 0, submits: 0, answerReads: 0 });
        assert.equal(session.output.slice(offset).includes('Lesson completed.'), false);
        child.stdin.write('status\nquit\n');
        await wait(() => child.exitCode !== null);
        assert.equal(child.exitCode, 0);
        console.log('Assessment real CLI PASS: source shell stops the full loop before answer reads, clicks, text input, keys or submits; clean quit. Synthetic only, no live Assessment.');
    } finally {
        await session.cleanup();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
