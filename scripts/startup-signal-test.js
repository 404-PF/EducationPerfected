// Real child + local login fixture. Never signs in to the live service.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { cleanupTestProcess } = require('./test-process-cleanup');
(async () => {
    const signal = process.argv.includes('--term') ? 'SIGTERM' : 'SIGINT';
    const legacy = process.argv.includes('--legacy');
    const entry = process.argv.includes('--launcher') ? '../bin/launch.js' : legacy ? '../index.js' : '../bin/cli.js';
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = { ...process.env, EP_TEST_BOOT: '1', EP_LOGIN_URL: `http://127.0.0.1:${server.address().port}/app/login`, EP_LOGIN_HOST: '127.0.0.1' };
    delete env.EP_EMAIL; delete env.EP_PASSWORD;
    const child = spawn(process.execPath, [path.join(__dirname, entry)], { env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '', browser;
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    let timer;
    try {
        await new Promise((resolve, reject) => {
            const deadline = Date.now() + 12000;
            timer = setInterval(() => {
                if (output.includes('Log in manually in the opened browser window.')) { clearInterval(timer); resolve(); }
                else if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) { clearInterval(timer); reject(new Error('Startup checkpoint failed: ' + output)); }
            }, 20);
        });
        assert.equal(output.includes('Commands: start'), false);
        const endpoint = /EP_WS_ENDPOINT=(\S+)/.exec(output)?.[1];
        assert.ok(endpoint);
        if (legacy) {
            browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
            const page = (await browser.pages())[0];
            await page.type('#loginId', 'fixture-user');
            await page.type('#password', 'fixture-only');
            await page.click('form button');
            await new Promise((resolve, reject) => {
                const deadline = Date.now() + 12000;
                timer = setInterval(() => {
                    if (output.includes('fully Loaded.')) { clearInterval(timer); resolve(); }
                    else if (child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) { clearInterval(timer); reject(new Error('Legacy ready checkpoint failed: ' + output)); }
                }, 20);
            });
            await browser.disconnect(); browser = null;
        }
        const closed = new Promise(resolve => child.once('close', (code, sig) => resolve({ code, signal: sig })));
        child.kill(signal);
        const result = await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Startup signal did not exit')), 8000); })]);
        assert.equal(result.signal, null, 'Signal must be handled rather than kill the child');
        assert.equal(result.code, signal === 'SIGINT' ? 130 : 143);
        await assert.rejects(async () => {
            browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
            await browser.disconnect();
        });
        console.log((legacy ? 'Legacy signal closes browser after sign-in: ' : 'Startup signal closes browser before sign-in: ') + entry + ' / ' + signal);
    } finally {
        clearInterval(timer); clearTimeout(timer);
        if (browser) await browser.close().catch(() => {});
        try { cleanupTestProcess(child); } catch {}
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
