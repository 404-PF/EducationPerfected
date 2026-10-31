if (process.platform === 'win32' && process.argv.includes('--signal')) {
    console.log('SKIP: child.kill SIGINT is not graceful console delivery on Windows; native validation required.');
    process.exit(0);
}
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { cleanupTestProcess } = require('./test-process-cleanup');

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const env = { ...process.env, EP_TEST_BOOT: '1', EP_LOGIN_URL: origin + '/app/login', EP_LOGIN_HOST: '127.0.0.1' };
    delete env.EP_EMAIL; delete env.EP_PASSWORD;
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/cli.js')], { env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '', browser;
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    const wait = async predicate => {
        const limit = Date.now() + 15000;
        while (!predicate()) {
            if (child.exitCode !== null || Date.now() >= limit) throw new Error('CLI checkpoint failed: ' + output);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    };
    const command = async (text, expected) => {
        const offset = output.length;
        child.stdin.write(text + '\n');
        await wait(() => output.slice(offset).includes(expected));
    };
    try {
        await wait(() => /EP_WS_ENDPOINT=(\S+)/.test(output));
        browser = await puppeteer.connect({ browserWSEndpoint: output.match(/EP_WS_ENDPOINT=(\S+)/)[1] });
        await browser.waitForTarget(target => target.type() === 'page');
        const page = (await browser.pages())[0];
        await page.waitForSelector('#loginId');
        await page.type('#loginId', 'fixture-user');
        await page.type('#password', 'fixture-only');
        await page.click('form button');
        await wait(() => output.includes('Commands: start'));
        await page.goto(origin + '/lesson');
        await command('mode semi', '"mode":"semi"');
        await command('start', '"state":"running"');
        await page.waitForFunction(() => [...document.querySelectorAll('.mcq-preview-option input')].some(e => e.checked));
        const refreshMark = output.length;
        await page.evaluate(() => window.refresh());
        await wait(() => output.slice(refreshMark).includes('Word refresh failed or a run is still active'));
        const keyBefore = await page.evaluate(() => window.angular.element(document.querySelector('.multi-choice-component')).scope().self.model._currentQuestion.questionIndex);
        const stoppingMark = output.length;
        await page.evaluate(() => Promise.all([window.startAnswer(), window.startAnswer()]));
        await wait(() => output.slice(stoppingMark).includes('Answer control is stopping'));
        await command('stop', '"state":"stopped"');
        assert.equal(await page.evaluate(() => window.angular.element(document.querySelector('.multi-choice-component')).scope().self.model._currentQuestion.questionIndex), keyBefore);
        await command('stop', '"state":"stopped"');
        await command('start', '"state":"running"');
        await page.waitForFunction(async () => (await window.epTestState()).running);
        await page.evaluate(() => {
            window.fixtureContinueClicks = 0;
            const modal = document.createElement('div'); modal.setAttribute('uib-modal-window', 'modal-window');
            const button = document.createElement('button'); button.className = 'continue-button'; button.textContent = 'Continue';
            button.addEventListener('click', () => { window.fixtureContinueClicks += 1; });
            modal.append(button); document.body.append(modal);
        });
        assert.equal(await page.evaluate(async () => (await window.epTestState()).running), true, 'Modal-stop fixture must still have an active run');
        await command('stop', '"state":"stopped"');
        assert.equal(await page.evaluate(() => window.fixtureContinueClicks), 0, 'Stop must leave grading Continue alone');
        assert.equal(await page.evaluate(() => window.angular.element(document.querySelector('.multi-choice-component')).scope().self.model._currentQuestion.questionIndex), keyBefore);
        await page.goto(origin + '/lesson');
        await page.evaluate(() => {
            document.querySelector('.multi-choice-component').remove();
            const button = document.createElement('button'); button.className = 'continue-button'; button.textContent = 'Continue';
            document.body.append(button);
        });
        await command('start', '"state":"running"');
        await page.waitForFunction(async () => !(await window.epTestState()).running);
        await command('status', '"state":"stopped"');
        await page.goto(origin + '/lesson');
        await page.evaluate(() => {
            document.querySelector('.multi-choice-component').remove();
            const button = document.querySelector('button.exit-button'); button.hidden = false;
            button.click = () => { throw new Error('fixture exit dispatch failed'); };
        });
        await command('start', '"state":"running"');
        await page.waitForFunction(async () => !(await window.epTestState()).running);
        await command('status', '"state":"stopped"');
        await page.goto(origin + '/lesson-multi');
        await command('start', '"state":"running"');
        await page.waitForFunction(async () => !(await window.epTestState()).running);
        await command('status', '"state":"stopped"');
        await page.goto(origin + '/lesson');
        await command('mode auto', '"mode":"auto"');
        await command('start', '"state":"running"');
        await page.waitForFunction(() => !document.querySelector('.multi-choice-component'), { timeout: 15000 });
        await page.waitForFunction(async () => !(await window.epTestState()).running);
        await command('status', '"state":"completed"');
        if (process.argv.includes('--external-close')) {
            await browser.close();
            const closedDeadline = Date.now() + 5000;
            while (!output.includes('"state":"closed"') && Date.now() < closedDeadline) {
                child.stdin.write('status\n');
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            assert.ok(output.includes('"state":"closed"'));
            await command('start', '"state":"closed"');
            await command('quit', '"state":"closed"');
        } else if (process.argv.includes('--signal')) child.kill('SIGINT');
        else await command('quit', '"state":"closed"');
        if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
        assert.equal(child.exitCode, 0);
        console.log('CLI real-program fixture: sign-in, status, semi-auto stop without grade, idempotent stop, auto restart, close passed.');
    } finally {
        if (browser) await browser.close().catch(() => {});
        try {
            cleanupTestProcess(child);
        } catch {}
        server.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
