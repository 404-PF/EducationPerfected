// End-to-end test of the non-text question handlers (issues #33 and #32)
// against the fixtures in scripts/mock-ep.js, in two layers:
//
//   1. handler level: detection, option matching, the no-guessing refusals,
//      the auto-marking gate, click-time revalidation, and semi-auto behavior,
//      driven through the real lib/ modules.
//   2. integration level: the REAL index.js answer loop (spawned with
//      EP_TEST_BOOT=1 against the mock) over the adversarial routes - async
//      slide gaps and quiet rejections - asserting bounded submissions and no
//      false completion.
//
//   node scripts/handler-test.js                     launch the browser Puppeteer manages
//   HANDLER_EXECUTABLE_PATH=/path/to/chrome node scripts/handler-test.js
//   HANDLER_BROWSER_URL=http://127.0.0.1:9222 node scripts/handler-test.js
//
// Exits 0 when every check passes.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createServer, LESSON_ROUNDS, AUDIO_ROUNDS } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { matchChoiceOption, playChoiceRound } = require('../lib/choice-handler');

const CHECKS = [];
function check(name) {
    CHECKS.push(name);
    console.log(`  ok  ${name}`);
}

// ---------------------------------------------------------------------------
// handler-level tests (real lib/ modules against the fixtures)
// ---------------------------------------------------------------------------

async function testChoiceFlow(page, origin) {
    await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.multi-choice-component[role=radiogroup]', { timeout: 5000 });

    const first = await detectQuestion(page);
    assert.equal(first.kind, 'choice');
    assert.equal(first.key, `choice:${LESSON_ROUNDS[0].contentID}:${LESSON_ROUNDS[0].questionIndex}`);
    assert.deepEqual(first.options.map(o => o.text), LESSON_ROUNDS[0].options);
    assert.deepEqual(first.correct, [LESSON_ROUNDS[0].correct]);
    assert.equal(first.multi, false);
    assert.equal(first.autoMarked, true);
    check('choice slide detected with options and correct answer from scope state');

    // round 1: select + submit + Next Question, advancing to round 2
    const round1 = await playChoiceRound(page, first, { enter: true, timeout: 5000, shouldStop: () => false });
    assert.equal(round1.status, 'advanced', JSON.stringify(round1));
    const second = await detectQuestion(page);
    assert.equal(second.kind, 'choice');
    assert.equal(second.key, `choice:${LESSON_ROUNDS[1].contentID}:${LESSON_ROUNDS[1].questionIndex}`);
    check('first choice round answered and advanced');

    // round 2 (last): answering it reaches the completion control
    const round2 = await playChoiceRound(page, second, { enter: true, timeout: 5000, shouldStop: () => false });
    assert.equal(round2.status, 'complete', JSON.stringify(round2));
    check('final choice round reports completion');
}

function testChoiceRefusals() {
    // zero matches and multiple matches must refuse, never guess
    assert.ok(matchChoiceOption(['x'], ['a', 'b']).error);
    assert.ok(matchChoiceOption(['x'], ['x', 'x']).error);
    assert.ok(matchChoiceOption([], ['a']).error);
    // a single exact match wins even when a case variant also exists
    assert.deepEqual(matchChoiceOption(['x'], ['x', 'X', 'a']), { index: 0 });
    check('no-guess rule: zero/multiple/empty matches refuse, single exact match wins');
}

async function testOptionReorder(page, origin) {
    // the DOM is reordered AFTER detection but before the click: the handler
    // must re-match at click time, not trust the detection-time index
    await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.multi-choice-component[role=radiogroup]', { timeout: 5000 });
    const descriptor = await detectQuestion(page);
    const correct = LESSON_ROUNDS[0].correct;
    assert.notEqual(descriptor.options[0].text, correct);
    await page.evaluate(() => {
        const mc = document.querySelector('.multi-choice-component');
        const options = [...mc.querySelectorAll('.mcq-preview-option')];
        mc.insertBefore(options[0], null);   // move first option to the end
    });
    // semi-auto waits for the user indefinitely, so stop it once the
    // selection has had time to land
    let stop = false;
    setTimeout(() => { stop = true; }, 1200);
    const result = await playChoiceRound(page, descriptor, { enter: false, timeout: 5000, shouldStop: () => stop });
    // semi-auto: only the selection happened; the CHECKED option must be the correct one
    const checked = await page.evaluate(() => {
        const selected = [...document.querySelectorAll('.mcq-preview-option')]
            .find(o => o.querySelector('input').checked);
        return selected ? selected.querySelector('#render-group').textContent.trim() : null;
    });
    assert.equal(checked, correct);
    assert.equal(result.status, 'aborted'); // enter:false never submits; we stop the watch
    check('option reorder between detection and click still selects the correct option');
}

async function testSemiAutoControl(page, origin) {
    // semi-auto: select the option, but never click Submit or Next Question
    await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.multi-choice-component[role=radiogroup]', { timeout: 5000 });
    const descriptor = await detectQuestion(page);
    let stop = false;
    setTimeout(() => { stop = true; }, 800);
    const result = await playChoiceRound(page, descriptor, { enter: false, timeout: 5000, shouldStop: () => stop });
    assert.equal(result.status, 'aborted');
    const state = await page.evaluate(() => ({
        submitVisible: [...document.querySelectorAll('main button')]
            .filter(b => (b.innerText || '').trim() === 'Submit')
            .some(b => !b.hidden && (b.offsetParent !== null || b.getClientRects().length > 0)),
        nextVisible: [...document.querySelectorAll('main button')]
            .filter(b => (b.innerText || '').trim() === 'Next Question')
            .some(b => !b.hidden && (b.offsetParent !== null || b.getClientRects().length > 0)),
        questionIndex: window.angular ? 0 : null,
    }));
    assert.equal(state.submitVisible, true, 'semi-auto must not click Submit');
    assert.equal(state.nextVisible, false, 'semi-auto must not reach Next Question');
    check('semi-auto selects but never submits or advances');
}

async function testAutoMarkingGate(page, origin) {
    await page.goto(`${origin}/lesson`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.multi-choice-component[role=radiogroup]', { timeout: 5000 });

    // explicit false: manually marked
    await page.evaluate(() => { window.angular.element().scope().self.model.sectionData.activityGroup.isAutoMarked = false; });
    let descriptor = await detectQuestion(page);
    assert.equal(descriptor.autoMarked, false);
    let result = await playChoiceRound(page, descriptor, { enter: true, timeout: 1000, shouldStop: () => false });
    assert.equal(result.status, 'stopped');
    assert.match(result.message, /manually/);

    // missing field: unknown must also stop (fail closed)
    await page.evaluate(() => { delete window.angular.element().scope().self.model.sectionData.activityGroup.isAutoMarked; });
    descriptor = await detectQuestion(page);
    assert.equal(descriptor.autoMarked, 'unknown');
    result = await playChoiceRound(page, descriptor, { enter: true, timeout: 1000, shouldStop: () => false });
    assert.equal(result.status, 'stopped');
    assert.match(result.message, /did not confirm/);
    check('auto-marking gate: explicit false and unknown both stop the round');
}

async function testUnsupportedChoice(page, origin) {
    // the choice markup without the AngularJS scope state must be reported as
    // unsupported, never answered blindly. Navigate first so the lesson
    // fixture's angular stub is gone from the global.
    await page.goto(`${origin}/learning/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.setContent(`<main>
        <div class="multi-choice-component" role="radiogroup">
            <div class="mcq-preview-option" role="option"><span>lo</span></div>
        </div>
    </main>`);
    const descriptor = await detectQuestion(page);
    assert.equal(descriptor.kind, 'unsupported');
    assert.match(descriptor.reason, /scope unavailable/);
    check('choice markup without readable answer state stops and reports');
}

async function testAudioDetection(page, origin) {
    await page.goto(`${origin}/audio`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.voice-speaker', { timeout: 5000 });
    const first = await detectQuestion(page);
    assert.equal(first.kind, 'audio');
    assert.equal(first.key, `audio:${AUDIO_ROUNDS[0].contentID}:0:2`);
    assert.deepEqual(first.answers, [AUDIO_ROUNDS[0].answer]);
    // live-captured shape: no sectionData on list audio, so the marking flag
    // reads 'unknown'; the self-test list context is the positive signal
    assert.equal(first.autoMarked, 'unknown');
    assert.equal(first.selfTestList, true);
    check('audio task detected with identity, mode, accepted answers and list context');
}

async function testAudioGateSignals(page, origin) {
    await page.goto(`${origin}/audio`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.voice-speaker', { timeout: 5000 });
    const mutate = (fn, arg) => page.evaluate(fn, arg);

    // assigned task (_taskID set): the self-test signal must vanish
    await mutate(() => { window.angular.element().scope().self.model.contentSource.selectedActivity._taskID = 81234567; });
    let d = await detectQuestion(page);
    assert.equal(d.selfTestList, false);
    assert.equal(d.autoMarked, 'unknown');

    // selectedActivity missing entirely
    await mutate(() => { delete window.angular.element().scope().self.model.contentSource; });
    d = await detectQuestion(page);
    assert.equal(d.selfTestList, false);
    assert.equal(d.autoMarked, 'unknown');

    // wrong activity type (not a vocabulary list)
    await mutate(() => { window.angular.element().scope().self.model.contentSource = { selectedActivity: { _taskID: null, _activityType: 2, _contentType: 1 } }; });
    d = await detectQuestion(page);
    assert.equal(d.selfTestList, false);

    // explicit manual marking beats the list context
    await mutate(() => {
        const m = window.angular.element().scope().self.model;
        m.contentSource = { selectedActivity: { _taskID: null, _activityType: 1, _contentType: 1 } };
        m.sectionData = { activityGroup: { isAutoMarked: false } };
    });
    d = await detectQuestion(page);
    assert.equal(d.autoMarked, false);
    assert.equal(d.selfTestList, true);

    // sectionData PRESENT but malformed: flag unreadable even with list shape;
    // detection must mark it present so the gate refuses the list allowance
    await mutate(() => {
        const m = window.angular.element().scope().self.model;
        m.contentSource = { selectedActivity: { _taskID: null, _activityType: 1, _contentType: 1 } };
        m.sectionData = {};
    });
    d = await detectQuestion(page);
    assert.equal(d.autoMarked, 'unknown');
    assert.equal(d.sectionDataPresent, true);
    assert.equal(d.selfTestList, true);

    // null and numeric sectionData are NOT the captured absent shape
    for (const bad of [null, 0]) {
        await mutate((v) => { window.angular.element().scope().self.model.sectionData = v; }, bad);
        d = await detectQuestion(page);
        assert.equal(d.autoMarked, 'unknown');
        assert.equal(d.sectionDataPresent, true, `sectionData=${bad} must count as present`);
        assert.equal(d.selfTestList, true);
    }

    // an explicit auto-marked flag passes on its own
    await mutate(() => { window.angular.element().scope().self.model.sectionData = { activityGroup: { isAutoMarked: true } }; });
    d = await detectQuestion(page);
    assert.equal(d.autoMarked, true);

    // a speaker slide outside the two captured modes is unsupported
    await mutate(() => { window.angular.element().scope().self.model._currentQuestion.translationMode = 5; });
    d = await detectQuestion(page);
    assert.equal(d.kind, 'unsupported');
    assert.match(d.reason, /translationMode/);
    check('audio gate signals: assigned/missing/wrong-type/malformed/null/numeric contexts stop, manual beats list, explicit auto passes, unexpected mode unsupported');
}

// ---------------------------------------------------------------------------
// integration tests: the REAL index.js answer loop against the mock
// ---------------------------------------------------------------------------

async function bootRealProgram(origin) {
    const childEnv = { ...process.env };
    // never let real credentials reach the child: it would type them into the
    // local mock's login form. The manual-login path is driven below instead.
    delete childEnv.EP_EMAIL;
    delete childEnv.EP_PASSWORD;
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
        env: {
            ...childEnv,
            EP_TEST_BOOT: '1',
            EP_LOGIN_URL: `${origin}/app/login`,
            EP_LOGIN_HOST: '127.0.0.1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    const wsEndpoint = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`index.js did not print its endpoint. Output so far:\n${output}`)), 60000);
        child.stdout.on('data', () => {
            const match = output.match(/EP_WS_ENDPOINT=(\S+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.on('exit', code => reject(new Error(`index.js exited early (${code}). Output:\n${output}`)));
    });
    const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint, defaultViewport: null });
    const page = (await browser.pages())[0];

    // log in through the mock (any credentials pass), so the program finishes
    // startup and exposes its controls
    await page.waitForSelector('#loginId', { timeout: 15000 });
    await page.type('#loginId', 'someone@example.com');
    await page.type('#password', 'not-a-real-password');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => { }),
        page.evaluate(() => {
            const button = [...document.querySelectorAll('button')]
                .find(b => b.closest('form') && (b.innerText || '').trim() === 'Log in');
            button.click();
        }),
    ]);
    await page.waitForFunction(() => typeof window.startAnswer === 'function', { timeout: 15000 });
    return { child, browser, page, output: () => output };
}

async function drive(page, route, seconds, output) {
    await page.goto(`http://127.0.0.1:${ROUTE_PORT}${route}`, { waitUntil: 'domcontentloaded' });
    const mark = output().length;
    await page.evaluate(() => window.startAnswer());   // Alt+S equivalent
    await new Promise(r => setTimeout(r, seconds * 1000));
    // startAnswer() is a TOGGLE: stop only if the loop is actually still
    // running - after a self-stop (completion, a bound, a rejection) one more
    // call would RESTART it
    const log = output().slice(mark);
    const started = log.lastIndexOf('Starting answerLoop.');
    const stopped = Math.max(
        log.lastIndexOf('Stopping answerLoop.'),
        log.lastIndexOf('Lesson completed.'),
        log.lastIndexOf('stopping'),
        log.lastIndexOf('Stopping.'),
    );
    if (started > stopped) {
        await page.evaluate(() => window.startAnswer()).catch(() => { });
    }
}

let ROUTE_PORT = 0;

async function testRealLoopAsyncLesson(page, output) {
    // An 800ms slide gap between rounds must NOT be read as completion: both
    // rounds get answered, the hidden exit button is never clicked (the page
    // stays on the lesson), and the run ends with the real completion.
    await drive(page, '/lesson-async', 12, output);
    const url = page.url();
    assert.ok(url.includes('/lesson-async'), `hidden exit was clicked mid-lesson (landed on ${url})`);
    // a stall would keep the same URL too - only the real completion proves
    // both rounds were answered through the gaps
    assert.ok(output().includes('Lesson completed.'), `run did not complete. Program output:
${output()}`);
    check('real loop: 800ms slide gap is not mistaken for completion, and the run completes');
}

async function testRealLoopAssignedAudio(page, output) {
    // the same audio task but assigned (_taskID set): the gate must stop the
    // run before ANY submission
    const mark = output().length;
    await drive(page, '/audio-assigned', 10, output);
    const submissions = await page.evaluate(() => (window.__submissions || []).length);
    assert.equal(submissions, 0, `assigned audio task was answered (${submissions} submissions)`);
    assert.ok(output().slice(mark).includes('did not confirm this audio task'), `expected the gate stop message. Output:
${output().slice(mark)}`);
    check('real loop: assigned (non-self-test) audio task stops unanswered');
}

async function testRealLoopMalformedAudio(page, output) {
    // list-shaped audio tasks whose sectionData is PRESENT but wrong: only
    // `undefined` is the captured absent shape, so an empty object, null and
    // a number must each stop the run unanswered
    for (const variant of ['object', 'null', 'number']) {
        const mark = output().length;
        await drive(page, `/audio-malformed?sd=${variant}`, 8, output);
        const submissions = await page.evaluate(() => (window.__submissions || []).length);
        assert.equal(submissions, 0, `sectionData=${variant} audio task was answered (${submissions} submissions)`);
        assert.ok(output().slice(mark).includes('did not confirm this audio task'), `expected the gate stop message for sd=${variant}. Output:
${output().slice(mark)}`);
    }
    check('real loop: present-but-wrong sectionData (object, null, number) stops unanswered despite list shape');
}

async function testRealLoopQuietRejection(page, output) {
    // Every submission is quietly rejected (box cleared, no modal, same
    // question): submissions must be BOUNDED and the run must stop.
    await drive(page, '/audio-reject', 32, output);
    const submissions = await page.evaluate(() => (window.__submissions || []));
    assert.ok(submissions.length > 0, 'expected at least one submission attempt');
    assert.ok(submissions.length <= 3, `submissions unbounded: ${submissions.length} in 40s`);
    // the bounded retry must resubmit the exact answer, never an empty box
    // cleared by the quiet rejection
    for (const s of submissions) {
        assert.equal(s.value, 'Ho la febbre', `retry submitted "${s.value}" instead of the answer`);
    }
    check(`real loop: quiet rejection bounded at ${submissions.length} submission(s), each carrying the answer`);
}

async function main() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    ROUTE_PORT = server.address().port;
    const origin = `http://127.0.0.1:${ROUTE_PORT}`;

    let browser = null;
    let launched = false;
    let page = null;
    let program = null;
    try {
        if (process.env.HANDLER_BROWSER_URL) {
            browser = await puppeteer.connect({ browserURL: process.env.HANDLER_BROWSER_URL, defaultViewport: null });
        } else {
            browser = await puppeteer.launch({
                headless: process.env.HANDLER_HEADFUL ? false : 'shell',
                defaultViewport: null,
                ...(process.env.HANDLER_EXECUTABLE_PATH ? { executablePath: process.env.HANDLER_EXECUTABLE_PATH } : {}),
            });
            launched = true;
        }
        page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().startsWith(origin)) return request.continue();
            return request.abort();
        });

        const phase = process.argv[2] || 'all';
        if (phase === 'all' || phase === 'unit') {
            // handler level
            await testChoiceFlow(page, origin);
            testChoiceRefusals();
            await testOptionReorder(page, origin);
            await testSemiAutoControl(page, origin);
            await testAutoMarkingGate(page, origin);
            await testUnsupportedChoice(page, origin);
            await testAudioDetection(page, origin);
            await testAudioGateSignals(page, origin);
        }

        if (phase === 'all' || phase === 'integration') {
            // integration level: the real program's loop
            program = await bootRealProgram(origin);
            await testRealLoopAsyncLesson(program.page, program.output);
            await testRealLoopAssignedAudio(program.page, program.output);
            await testRealLoopMalformedAudio(program.page, program.output);
            await testRealLoopQuietRejection(program.page, program.output);
        }

        console.log(`\nAll ${CHECKS.length} checks passed.`);
    } finally {
        if (program) {
            try { program.child.kill('SIGKILL'); } catch { /* already gone */ }
            try { await program.browser.disconnect(); } catch { /* already gone */ }
        }
        if (page) { try { await page.close(); } catch { /* already gone */ } }
        if (browser) {
            try {
                if (launched) await browser.close();
                else await browser.disconnect();
            } catch { /* already gone */ }
        }
        server.close();
    }
}

main().catch(e => {
    console.error(`\nHandler test FAILED: ${e && e.stack || e}`);
    process.exitCode = 1;
});
