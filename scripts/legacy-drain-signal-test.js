// Node child.kill() force-terminates Windows children; it cannot test handler drain.
// Keep this explicit rather than treating an emulated kill as a graceful pass.
if (process.platform === 'win32') {
    console.log('SKIP: OS child-signal drain fixture is POSIX-only; Windows console shutdown needs native validation.');
    process.exit(0);
}
// Real legacy entrypoints + local browser, with a delayed active-run cleanup.
// The preload delays a browser operation, not the run-controls implementation.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { cleanupTestProcess } = require('./test-process-cleanup');
if (process.env.EP_DRAIN_PRELOAD === '1') {
    const Module = require('node:module'), load = Module._load;
    Module._load = function(id, ...args) {
        const value = load.call(this, id, ...args);
        if (id !== 'puppeteer') return value;
        return new Proxy(value, { get(target, key) {
            if (key !== 'launch') return target[key];
            return async (...options) => {
                const browser = await target.launch(...options);
                const pages = browser.pages.bind(browser);
                browser.pages = async (...args) => {
                    const result = await pages(...args), page = result[0], evaluate = page.$$eval.bind(page);
                    let delayed = false;
                    page.$$eval = async (selector, ...args) => {
                        if (!delayed && selector === 'div[uib-modal-window=modal-window]') {
                            delayed = true;
                            console.log('DRAIN_DELAY_ENTERED');
                            await (process.env.EP_DRAIN_HANG === '1' ? new Promise(() => {}) : new Promise(resolve => setTimeout(resolve, 4500)));
                            console.log('DRAIN_DELAY_FINISHED');
                        }
                        return evaluate(selector, ...args);
                    };
                    return result;
                };
                return browser;
            };
        } });
    };
} else (async () => {
    const force = process.argv.includes('--force');
    for (const entry of ['../index.js', '../bin/launch.js']) for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        const server = createServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const env = { ...process.env, EP_TEST_BOOT: '1', EP_LOGIN_URL: origin + '/app/login', EP_LOGIN_HOST: '127.0.0.1', EP_DRAIN_PRELOAD: '1', EP_DRAIN_HANG: force ? '1' : '0' };
        delete env.EP_EMAIL; delete env.EP_PASSWORD;
        const child = spawn(process.execPath, ['--require', __filename, path.join(__dirname, entry)], { env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
        let output = '', browser;
        child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
        const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
        const wait = async predicate => {
            const deadline = Date.now() + 15000;
            while (!predicate()) {
                if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) throw new Error('Legacy drain checkpoint failed: ' + output);
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        };
        try {
            await wait(() => output.includes('Log in manually in the opened browser window.'));
            const endpoint = /EP_WS_ENDPOINT=(\S+)/.exec(output)?.[1];
            browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
            const page = (await browser.pages())[0];
            await page.type('#loginId', 'fixture-user'); await page.type('#password', 'fixture-only'); await page.click('form button');
            await wait(() => output.includes('fully Loaded.'));
            await page.goto(origin + '/lesson');
            await page.evaluate(() => { void window.startAnswer(); });
            await wait(() => output.includes('answerLoop entered.'));
            // Explicit stop leaves the real run active until cleanup drains.
            await page.evaluate(() => { void window.epTestStop(); });
            await wait(() => output.includes('DRAIN_DELAY_ENTERED'));
            const signaledAt = Date.now(); child.kill(signal);
            await new Promise(resolve => setTimeout(resolve, 3300));
            assert.equal(child.exitCode, null, output); assert.equal(child.signalCode, null, output);
            assert.equal(browser.connected, true, 'Browser must remain alive beyond the old 3s deadline');
            if (force) child.kill(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT');
            const result = await Promise.race([closed, new Promise((_, reject) => {
                const timer = setTimeout(() => reject(new Error('Legacy drain did not exit: ' + output)), 10000); timer.unref();
            })]);
            assert.equal(result.signal, null, output); assert.equal(result.code, signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143, output);
            if (force) {
                assert.ok(output.includes('Second interrupt received; forcing browser shutdown.'), output);
                assert.ok(!output.includes('DRAIN_DELAY_FINISHED'), output);
            } else {
                assert.ok(Date.now() - signaledAt > 4000, output);
                assert.ok(output.includes('DRAIN_DELAY_FINISHED'), output); assert.ok(output.includes('answerLoop Exited.'), output);
            }
            await assert.rejects(() => puppeteer.connect({ browserWSEndpoint: endpoint }));
            console.log(`Legacy ${force ? 'hung drain forced only by second interrupt' : 'active drain >3s completed before browser close'}: ${entry} / ${signal}`);
        } finally {
            if (browser) await browser.close().catch(() => {});
            try { cleanupTestProcess(child); } catch {}
            server.close();
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
