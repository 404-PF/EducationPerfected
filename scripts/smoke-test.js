// Smoke test for the pinned Puppeteer setup: launches (or connects to) a browser and
// drives the EP mock in scripts/mock-ep.js through the same Puppeteer APIs index.js
// relies on. It does not run index.js itself (that would need EP credentials), so it
// validates the dependency setup, not the live site.
//
//   node scripts/smoke-test.js                 launch the browser Puppeteer manages
//   SMOKE_EXECUTABLE_PATH=/path/to/chrome node scripts/smoke-test.js
//                                              launch a browser you already have
//   SMOKE_BROWSER_URL=http://127.0.0.1:9222 node scripts/smoke-test.js
//                                              drive an already-running browser
//
// Exits 0 when every check passes.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { execFileSync } = require('node:child_process');
const { createServer, WORDS } = require('./mock-ep');

const CHECKS = [];
function check(name) {
    CHECKS.push(name);
    console.log(`  ok  ${name}`);
}

async function loginAndReachDashboard(page, origin) {
    await page.goto(`${origin}/app/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginId', { timeout: 5000 });
    const buttons = await page.$$('button');
    let loginButton = null;
    for (const handle of buttons) {
        const label = await handle.evaluate(el => (el.closest('form') ? el.innerText.trim() : null));
        if (label === 'Log in') loginButton = handle;
        else await handle.dispose();
    }
    assert.ok(loginButton, 'login button resolved by label');
    check('waitForSelector + $$ + ElementHandle.evaluate');

    await page.type('#loginId', 'someone@example.com');
    await page.type('#password', 'not-a-real-password');
    const fields = await page.evaluate((u, p) => {
        const user = document.querySelector(u);
        const pass = document.querySelector(p);
        return { user: user && user.value, pass: pass && pass.value, enabled: !user.disabled && !pass.disabled };
    }, '#loginId', '#password');
    assert.equal(fields.user, 'someone@example.com');
    assert.equal(fields.pass, 'not-a-real-password');
    check('page.type fills the login fields');

    const navigation = page.waitForNavigation({ timeout: 5000 }).catch(() => null);
    await loginButton.click();
    await navigation;
    await page.waitForSelector('main #single-spa-application\\:mfeGlobalNavigation\\:Tertiary', { timeout: 5000 });
    check('ElementHandle.click navigates, escaped #home_css selector matches');
}

async function readWordLists(page, origin) {
    await page.goto(`${origin}/task`, { waitUntil: 'domcontentloaded' });
    const readList = selector => page.$$eval(selector, els => els.map(el => el.innerText));
    const base = await readList('div.baseLanguage span');
    const target = await readList('div.targetLanguage span');
    assert.deepEqual(base, WORDS.map(w => w[0]));
    assert.deepEqual(target, WORDS.map(w => w[1]));
    check('$$eval reads the word lists');
}

async function testWrongAnswerModal(page) {
    await page.keyboard.type('wrong', { delay: 20 });
    assert.equal(await boxValue(), 'wrong');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[uib-modal-window=modal-window]', { timeout: 2000 });
    assert.equal(await page.$eval('#correct-answer-field', el => el.textContent), 'eins');
    check('keyboard.type/press + modal waitForSelector');

    await page.waitForFunction((q, a) => {
        const question = document.querySelector(q);
        const answer = document.querySelector(a);
        return !!question && !!answer && question.textContent.trim() !== '' && answer.textContent.trim() !== '';
    }, { timeout: 2000 }, '#question-field', '#correct-answer-field');
    check('waitForFunction reads the correction');

    const continued = await page.evaluate(css => {
        const button = document.querySelector(css);
        if (!button) return false;
        button.disabled = false;
        button.click();
        return true;
    }, '#continue-button');
    assert.equal(continued, true);
    await page.waitForFunction(() => document.querySelectorAll('[uib-modal-window]').length === 0, { timeout: 2000 });
    check('evaluate re-enables and clicks Continue');
}

async function testCorrectAnswers(page) {
    // Wait for the next question to appear after the modal is dismissed
    await page.waitForFunction(expected => document.querySelector('#question-text').textContent === expected,
        { timeout: 2000 }, WORDS[1][0]);

    for (const [base, answer] of WORDS.slice(1)) {
        const last = base === WORDS[WORDS.length - 1][0];
        assert.equal(await question(), base);
        await clearBox();
        await page.keyboard.type(answer, { delay: 20 });
        assert.equal(await boxValue(), answer);
        await page.keyboard.press('Enter');

        const advanced = await page.waitForFunction(isLast => {
            const questionEl = document.querySelector('#question-text');
            if (document.querySelectorAll('[uib-modal-window]').length > 0) return false;
            if (isLast) return questionEl === null && !document.querySelector('#answer-text');
            return questionEl !== null && questionEl.textContent !== '';
        }, { timeout: 2000 }, last).then(() => true).catch(() => false);

        assert.ok(advanced, last
            ? `round "${answer}" is the last one and reaches the completion state`
            : `round "${answer}" advances`);
    }
    check(`typed answers advance all ${WORDS.length} rounds`);
}

async function testCompletionExit(page, origin) {
    // Completion state: the question disappears and the exit button is clickable.
    assert.equal(await boxValue(), null);
    await page.waitForSelector('button.exit-button', { timeout: 2000 });
    const exit = await page.$('button.exit-button');
    const exitNav = page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' }).catch(() => null);
    await exit.click();
    await exitNav;
    // After clicking Exit, we should be on the dashboard (main with the shell selector).
    await page.waitForSelector('main #single-spa-application\\:mfeGlobalNavigation\\:Tertiary', { timeout: 2000 });
    check('completion exit button resolves and clicks to dashboard');
}

async function testHotkeyPreloadSurvival(page, origin) {
    let refreshed = 0;
    const doRefresh = async () => { refreshed += 1; };
    await page.exposeFunction('refresh', doRefresh);
    await page.evaluateOnNewDocument(() => {
        if (window.top !== window || window.__epHotkeysInstalled) return;
        window.__epHotkeysInstalled = true;
        document.addEventListener('keyup', event => {
            if (event.altKey && event.key.toLowerCase() === 'r') window.refresh();
        });
    });
    await page.goto(`${origin}/task`, { waitUntil: 'domcontentloaded' });
    await page.keyboard.down('Alt');
    await page.keyboard.press('r');
    await page.keyboard.up('Alt');

    const deadline = Date.now() + 2000;
    while (refreshed === 0 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 25));
    }
    assert.equal(refreshed, 1);
    check('exposeFunction survives navigation via evaluateOnNewDocument');
}

async function testPageGoneError(page) {
    await page.close();
    const closed = await page.evaluate(() => 1).then(() => null).catch(e => e);
    const pageGone = /detached Frame|Execution context was destroyed|Cannot find context|Target closed|Session closed|Browser has been closed|Navigating was not successful/i;
    assert.ok(closed && pageGone.test(closed.message),
        `closing the page yields a recognisable error, got: ${closed && closed.message}`);
    check(`closing the page produces an isPageGoneError-style message ("${closed.message}")`);
}

let question, boxValue, clearBox;

async function main() {
    console.log(`Puppeteer executablePath: ${await puppeteer.executablePath()}`);
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    console.log(`Mock EP: ${origin}`);
    console.log(`Puppeteer ${require('puppeteer/package.json').version}, puppeteer-core ` +
        `${require('puppeteer-core/package.json').version}, Node ${process.version}`);

    let browser;
    let page;
    let launched = false;
    try {
        if (process.env.SMOKE_BROWSER_URL) {
            browser = await puppeteer.connect({ browserURL: process.env.SMOKE_BROWSER_URL, defaultViewport: null });
            console.log(`Connected to ${process.env.SMOKE_BROWSER_URL}`);
        } else {
            browser = await puppeteer.launch({
                headless: process.env.SMOKE_HEADFUL ? false : 'shell',
                defaultViewport: null,
                handleSIGINT: false,
                executablePath: process.env.SMOKE_EXECUTABLE_PATH || undefined,
            });
            launched = true;
        }
        const version = await browser.version();
        console.log(`Browser: ${version}`);
        check('browser started');

        // Always create a dedicated page; don't reuse the browser's first tab.
        page = await browser.newPage();

        // Host the mock under the origin index.js expects for the login form, using
        // request interception so the checks run against the same selectors as EP.
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.startsWith(origin)) return request.continue();
            return request.abort();
        });

        // Helpers that close over `page` and `origin`.
        question = () => page.$eval('#question-text', el => el.textContent).catch(() => null);
        boxValue = () => page.$eval('#answer-text', el => el.value).catch(() => null);
        clearBox = async () => {
            await page.click('#answer-text', { clickCount: 3 });
            await page.keyboard.press('Backspace');
            assert.equal(await boxValue(), '');
        };

        // --- login flow ---
        await loginAndReachDashboard(page, origin);

        // --- word lists ---
        await readWordLists(page, origin);

        // --- task page ---
        await page.goto(`${origin}/task/play`, { waitUntil: 'domcontentloaded' });
        assert.equal(await question(), 'one');
        check('$eval reads the question');

        // Wrong answer -> correction modal
        await testWrongAnswerModal(page);

        // Right answers advance through every remaining round.
        await testCorrectAnswers(page);

        // Completion exit
        await testCompletionExit(page, origin);

        // --- host bindings + preload ---
        await testHotkeyPreloadSurvival(page, origin);

        // --- page-gone error classification ---
        await testPageGoneError(page);

        console.log(`\nAll ${CHECKS.length} checks passed.`);
    } finally {
        if (page) {
            try { await page.close(); } catch { /* already closed */ }
        }
        if (browser) {
            try {
                if (launched) await browser.close();
                else await browser.disconnect();
            } catch { /* already gone */ }
        }
        server.close();
    }
}

// Report which browser Puppeteer itself would launch when no path is given.
function describeManagedBrowser() {
    if (process.env.SMOKE_EXECUTABLE_PATH || process.env.SMOKE_BROWSER_URL) return;
    try {
        const cli = require.resolve('puppeteer/lib/puppeteer/node/cli.js');
        const out = execFileSync(process.execPath, [cli, 'browsers', 'list'], { encoding: 'utf8' });
        console.log(`Puppeteer-managed browsers:\n${out.trim() || '  (none)'}`);
    } catch (e) {
        console.log(`Could not list Puppeteer-managed browsers: ${e.message}`);
    }
}

describeManagedBrowser();
main().catch(e => {
    console.error(`\nSmoke test FAILED: ${e && e.stack || e}`);
    process.exitCode = 1;
});