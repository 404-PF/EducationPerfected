const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { cleanupTestProcess } = require('./test-process-cleanup');
(async () => {
    for (const scenario of ['invalid-url', 'connection-refused']) {
        for (const entry of ['index.js', 'bin/launch.js', 'bin/cli.js']) {
            const env = { ...process.env, EP_TEST_BOOT: '1', EP_LOGIN_URL: scenario === 'connection-refused' ? 'http://127.0.0.1:9/app/login' : 'http://sensitive-user:sensitive-pass@127.0.0.1:bad-port/', EP_LOGIN_HOST: '127.0.0.1' };
            delete env.EP_EMAIL; delete env.EP_PASSWORD;
            const child = spawn(process.execPath, [path.join(__dirname, '..', entry)], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
            let output = '';
            child.stdout.on('data', d => { output += d; });
            child.stderr.on('data', d => { output += d; });
            try {
                const code = await Promise.race([
                    new Promise(resolve => child.once('close', resolve)),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup child failed to exit: ' + entry)), 15000).unref()),
                ]);
                assert.equal(code, 1, entry);
                assert.doesNotMatch(output, /sensitive-user|sensitive-pass|bad-port/);
                const endpoint = output.match(/EP_WS_ENDPOINT=(\S+)/)?.[1];
                assert.ok(endpoint, 'Must fail after browser launch, not before');
                await assert.rejects(async () => { const b = await puppeteer.connect({ browserWSEndpoint: endpoint }); await b.disconnect(); });
                console.log('Partial startup closes browser and exits safely: ' + entry + ' / ' + scenario);
            } finally {
                try {
                    cleanupTestProcess(child);
                } catch {}
            }
        }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
