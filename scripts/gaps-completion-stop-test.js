// Inject a stop at the awaited browser proof response, using the real program.
const assert = require('node:assert/strict');
const Module = require('node:module');
const puppeteer = require('puppeteer');
const { installGapsFixture } = require('./gaps-fixture');
const { createServer } = require('./mock-ep');
(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const savedEnv = { ...process.env };
    Object.assign(process.env, { EP_TEST_BOOT: '1', EP_LOGIN_URL: origin + '/app/login', EP_LOGIN_HOST: '127.0.0.1' });
    delete process.env.EP_EMAIL; delete process.env.EP_PASSWORD;
    let browser, controls, stopPromise, intercepted = false, loginReady = false;
    const errors = []; const originalError = console.error;
    console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
    const load = Module._load, launchBrowser = puppeteer.launch.bind(puppeteer), log = console.log;
    Module._load = function (id, ...args) {
        const value = load.call(this, id, ...args);
        return id === 'puppeteer' ? new Proxy(value, { get(target, key) {
            return key === 'launch' ? async (...options) => { browser = await launchBrowser(...options); return browser; } : target[key];
        } }) : value;
    };
    console.log = (...args) => { if (String(args[0]).includes('No credentials provided')) loginReady = true; log(...args); };
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
        await page.evaluate(installGapsFixture);
        await page.evaluate(() => {
            gapsFixture.complete = true;
            document.querySelector('#sa-navigation-controls button').addEventListener('click', () => {
                gapsFixture.group.remove();
                document.querySelector('#question-container-group')?.remove();
                gapsFixture.self.model._currentQuestion = null;
            });
        });
        const evaluate = page.evaluate.bind(page);
        page.evaluate = async (fn, ...args) => {
            const result = await evaluate(fn, ...args);
            if (!intercepted && String(fn).includes('const button = document.querySelector(css)')) {
                intercepted = true;
                stopPromise = controls.stop();
            }
            return result;
        };
        controls.start();
        const finishBy = Date.now() + 12000;
        while (!intercepted || ['running', 'stopping'].includes(controls.status().state)) {
            if (Date.now() >= finishBy) throw new Error('Completion stop checkpoint timed out');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        await stopPromise;
        assert.equal(intercepted, true);
        assert.equal(await evaluate(() => gapsFixture.submits), 1);
        assert.ok(!errors.some(s => s.includes('without proof of task completion')), 'user stop must not emit an unproven-completion warning');
        assert.equal(controls.status().state, 'stopped');
        console.log('Stop during gaps completion proof stops quietly without an unproven-completion warning.');
    } finally {
        Module._load = load; console.log = log; console.error = originalError;
        if (controls) await controls.close(); else if (browser) await browser.close();
        for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
        Object.assign(process.env, savedEnv);
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
