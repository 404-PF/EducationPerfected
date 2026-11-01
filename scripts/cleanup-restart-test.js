// Gate actual run cleanup and press the real browser restart hotkey.
const assert = require('node:assert/strict');
const Module = require('node:module');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const savedEnv = { ...process.env };
    Object.assign(process.env, { EP_TEST_BOOT: '1', EP_LOGIN_URL: origin + '/app/login', EP_LOGIN_HOST: '127.0.0.1' });
    delete process.env.EP_EMAIL; delete process.env.EP_PASSWORD;
    let browser, controls, loginReady = false, entries = 0, completed = false, held = false, releaseCleanup;
    const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
    const load = Module._load, launchBrowser = puppeteer.launch.bind(puppeteer), log = console.log;
    Module._load = function (id, ...args) {
        const value = load.call(this, id, ...args);
        return id === 'puppeteer' ? new Proxy(value, { get(target, key) {
            return key === 'launch' ? async (...options) => { browser = await launchBrowser(...options); return browser; } : target[key];
        } }) : value;
    };
    console.log = (...args) => { const text = String(args[0]); if (text.includes('No credentials provided')) loginReady = true; if (text === 'answerLoop entered.') entries++; if (text.includes('task completion confirmed')) completed = true; log(...args); };
    try {
        let launchFailure;
        const launch = require('../index').launchProgram();
        launch.catch(error => { launchFailure = error; });
        const deadline = Date.now() + 12000;
        while (!browser || !loginReady) {
            if (launchFailure) throw launchFailure;
            if (Date.now() >= deadline) throw new Error('Local login checkpoint timed out');
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const page = (await browser.pages())[0];
        await page.type('#loginId', 'fixture-user');
        await page.type('#password', 'fixture-only');
        await page.click('form button');
        controls = await launch;
        await page.goto(origin + '/lesson');
        await page.evaluate(() => {
            document.querySelector('#ep-question-container').remove();
            const exit = document.createElement('button'); exit.className = 'exit-button'; document.body.append(exit);
            window.fixtureExitClicks = 0;
            exit.click = () => { window.fixtureExitClicks += 1; };
        });
        const evalAll = page.$$eval.bind(page);
        page.$$eval = async (...args) => {
            if (completed && !held) { held = true; await cleanupGate; }
            return evalAll(...args);
        };
        controls.start();
        const wait = async predicate => {
            const deadline = Date.now() + 10000;
            while (!predicate()) {
                if (Date.now() > deadline) throw Error('Cleanup restart checkpoint timed out');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        await wait(() => held);
        assert.equal(controls.status().state, 'running', 'The real run is still draining');
        const restart = page.evaluate(() => window.startAnswer());
        await wait(() => controls.status().state === 'stopping');
        releaseCleanup();
        await restart;
        await wait(() => entries >= 2 || !['running','stopping'].includes(controls.status().state));
        assert.equal(entries, 2, 'Hotkey during natural cleanup must start one fresh run after drain');
        await controls.stop();
        console.log('Actual-program cleanup gate preserves hotkey restart after draining.');
    } finally {
        releaseCleanup();
        Module._load = load; console.log = log;
        if (controls) await controls.close(); else if (browser) await browser.close();
        for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
        Object.assign(process.env, savedEnv);
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
