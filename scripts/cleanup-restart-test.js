// Gate actual run cleanup and press the real browser restart hotkey.
const assert = require('node:assert/strict');
const Module = require('node:module');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { boundedClose } = require('./packaged-test-cleanup');
const { finishFixtureCleanup } = require('./fixture-cleanup-errors');
(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const savedEnv = { ...process.env };
    Object.assign(process.env, { EP_TEST_BOOT: '1', EP_LOGIN_URL: origin + '/app/login', EP_LOGIN_HOST: '127.0.0.1' });
    delete process.env.EP_EMAIL; delete process.env.EP_PASSWORD;
    let browser, controls, loginReady = false, entries = 0, completed = false, held = false, releaseCleanup;
    const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
    let primaryFailure;
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
        assert.equal(await page.evaluate(() => window.fixtureExitClicks), 1, 'Natural completion must have clicked the fixture exit');
        await page.keyboard.down('Alt');
        try { await page.keyboard.press('s'); } finally { await page.keyboard.up('Alt'); }
        await wait(() => controls.status().state === 'stopping');
        releaseCleanup();
        await wait(() => entries >= 2 || !['running','stopping'].includes(controls.status().state));
        assert.equal(entries, 2, 'Hotkey during natural cleanup must start one fresh run after drain');
        await boundedClose(controls.stop(), 10000, 'Restarted run drain timed out');
        console.log('Actual-program cleanup gate preserves hotkey restart after draining.');
    } catch (error) { primaryFailure = error; throw error; } finally {
        releaseCleanup();
        Module._load = load; console.log = log;
        await finishFixtureCleanup(primaryFailure, [
            async () => { if (controls) await boundedClose(controls.close(), 10000, 'Cleanup restart fixture close timed out'); },
            async () => { if (browser) await boundedClose(browser.close(), 5000, 'Fixture browser close timed out'); },
            () => {
                for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
                Object.assign(process.env, savedEnv);
            },
            () => new Promise(resolve => server.close(resolve)),
        ]);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
