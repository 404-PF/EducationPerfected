// Multiple-choice rounds (Smart Lessons / Assessments), one of the question
// handlers dispatched from answerQuestions (issue #33).
//
// The answer source is EP's own client-side question state: detection has
// already extracted the options and the correct answer text(s), so a round is
// "find the one option matching the shipped correct answer, click it, submit,
// advance". No dictionary, no guessing: zero or multiple matches stop the run
// and report, per the issue's no-guessing rule.
//
// Live-audited 2026-10-30: the visible Submit button grades the slide (several
// hidden "Submit" buttons exist in the DOM; only one is visible), after which
// a "Next Question" button appears and must be clicked to advance. The
// select/submit/advance cycle itself has only been exercised against the
// fixtures in scripts/mock-ep.js, not the live site.

const { detectQuestion } = require('./detect-question');

const CHOICE_OPTION_CSS = 'div.mcq-preview-option';
const MODAL_CSS = 'div[uib-modal-window=modal-window]';
const EXIT_BUTTON_CSS = 'button.exit-button';
const EXIT_CONTINUE_CSS = 'button.continue-button';

/**
 * Picks the option to click. Exact text match first, then a case-insensitive
 * pass (EP's template text and rendered text can differ in case on accented
 * words). Anything but exactly one match is a refusal: the caller stops and
 * reports instead of clicking a guess.
 * @param {string[]} wanted - correct answer texts from EP's question state
 * @param {string[]} options - rendered option texts (click-time, visible only)
 * @returns {{index:number}|{error:string}}
 */
function matchChoiceOption(wanted, options) {
    const correct = (wanted || []).filter(t => t !== '');
    if (correct.length === 0) return { error: 'EP shipped no correct option for this slide' };
    if (!options || options.length === 0) return { error: 'no clickable options rendered' };

    let matches = [];
    for (let i = 0; i < options.length; i++) {
        if (correct.includes(options[i])) matches.push(i);
    }
    if (matches.length !== 1) {
        const folded = [];
        for (let i = 0; i < options.length; i++) {
            if (correct.some(w => w.toLocaleLowerCase() === options[i].toLocaleLowerCase())) folded.push(i);
        }
        if (folded.length === 1) matches = folded;
    }
    if (matches.length === 0) {
        return { error: `no option matches the correct answer "${correct.join('" / "')}" (options: ${options.map(o => `"${o}"`).join(', ')})` };
    }
    if (matches.length > 1) {
        return { error: `${matches.length} options match the correct answer "${correct[0]}"; refusing to guess` };
    }
    return { index: matches[0] };
}

/**
 * Clicks THE one visible button with the exact label. The live capture behind
 * this rule (Smart Lesson audit, 2026-10-30): three "Submit" buttons exist in
 * the DOM and exactly one is visible (the rest are display:none); "Next
 * Question" is hidden until a correct grade. Whether those buttons sit under
 * <main> was never captured, so there is no structural scoping here: any
 * ambiguity (zero or more than one VISIBLE match) is a refusal, never a guess.
 * @returns {Promise<'clicked'|'not-found'|'ambiguous'>}
 */
async function clickVisibleButton(page, text) {
    const handles = await page.$$('button');
    const visible = [];
    for (const handle of handles) {
        const hit = await handle.evaluate((el, want) => {
            const shown = !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
            return shown && (el.innerText || '').trim() === want;
        }, text).catch(() => false);
        if (hit) visible.push(handle);
        else await handle.dispose().catch(() => { });
    }
    if (visible.length !== 1) {
        for (const h of visible) await h.dispose().catch(() => { });
        return visible.length === 0 ? 'not-found' : 'ambiguous';
    }
    try {
        await visible[0].click();
    } catch (e) {
        // the button detached between the visibility read and the click (slide
        // re-rendered): not clicked, and the caller stops with an accurate report
        await visible[0].dispose().catch(() => { });
        return 'not-found';
    }
    await visible[0].dispose().catch(() => { });
    return 'clicked';
}

/**
 * Plays one multiple-choice round from a detected descriptor.
 * @param {import('puppeteer').Page} page
 * @param {object} descriptor - choice descriptor from detectQuestion
 * @param {object} opts
 * @param {boolean} opts.enter - auto mode: submit after selecting, and click
 *   "Next Question" when it appears. Semi-auto selects the option and leaves
 *   BOTH the submission and advancing to the user.
 * @param {number} opts.timeout - ms to wait for the round to resolve after submitting
 * @param {() => boolean} opts.shouldStop - user stop signal (TOGGLE)
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{status:'advanced'|'complete'|'modal'|'stopped'|'aborted', message?:string}>}
 */
async function playChoiceRound(page, descriptor, opts) {
    const { enter, timeout } = opts;
    const shouldStop = opts.shouldStop || (() => false);
    const log = opts.log || (() => { });

    if (descriptor.multi) {
        return { status: 'stopped', message: 'This is a multi-select choice question, which is not supported; stopping instead of guessing.' };
    }
    // fail closed: only an explicitly auto-marked activity may be answered
    if (descriptor.autoMarked !== true) {
        return {
            status: 'stopped',
            message: descriptor.autoMarked === false
                ? 'This activity is marked manually (self/peer/teacher), not auto-marked by EP; stopping instead of answering.'
                : 'EP did not confirm this activity is auto-marked (the marking field was missing or unreadable); stopping instead of answering.',
        };
    }

    // Match at CLICK time, not detection time: EP can reorder the options
    // between the two without the round key changing, and a stale index would
    // click the wrong answer.
    const handles = await page.$$(CHOICE_OPTION_CSS);
    const visibleHandles = [];
    const clickTimeTexts = [];
    for (const handle of handles) {
        const state = await handle.evaluate(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.shortcut-key').forEach(k => k.remove());
            return {
                visible: el.offsetParent !== null || el.getClientRects().length > 0,
                text: (clone.textContent || '').replace(/\s+/g, ' ').trim(),
            };
        }).catch(() => ({ visible: false, text: '' }));
        if (state.visible) {
            visibleHandles.push(handle);
            clickTimeTexts.push(state.text);
        } else {
            await handle.dispose().catch(() => { });
        }
    }
    const match = matchChoiceOption(descriptor.correct, clickTimeTexts);
    if (match.error) {
        for (const h of visibleHandles) await h.dispose().catch(() => { });
        return { status: 'stopped', message: `Cannot answer this choice question: ${match.error}.` };
    }
    const chosenText = clickTimeTexts[match.index];
    try {
        await visibleHandles[match.index].click();
    } catch (e) {
        // the option detached between the click-time match and the click (the
        // slide re-rendered): stop and report accurately, never click blind
        for (const h of visibleHandles) await h.dispose().catch(() => { });
        return { status: 'stopped', message: `The option for "${chosenText}" detached before it could be clicked (the slide re-rendered); stopping instead of clicking blind; restarting the run re-detects the slide.` };
    }
    for (const h of visibleHandles) await h.dispose().catch(() => { });
    log(`Selected "${chosenText}".`);

    if (!enter) {
        log('Option selected; submit it when ready (semi-auto). Nothing else is clicked in semi-auto.');
    } else {
        const submit = await clickVisibleButton(page, 'Submit');
        if (submit !== 'clicked') {
            return {
                status: 'stopped',
                message: submit === 'ambiguous'
                    ? 'More than one visible Submit button exists on this choice slide; stopping instead of guessing which grades the answer.'
                    : 'The choice slide\'s Submit button was not found after selecting an option; stopping.',
            };
        }
    }

    // Resolve the round: a modal, the task's completion controls, or the
    // question advancing. On a correct grade EP reveals "Next Question"; in
    // auto mode we click it, in semi-auto the user does and we just watch the
    // round key change afterwards.
    const deadline = enter ? Date.now() + timeout : Infinity;
    let nextClicked = false;
    while (!shouldStop() && Date.now() < deadline) {
        const state = await page.evaluate((modalCss, exitCss, contCss) => {
            const shown = (css) => {
                const el = document.querySelector(css);
                return !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
            };
            return {
                modal: document.querySelector(modalCss) !== null,
                // the completion controls exist in the DOM on every round (hidden),
                // so only a visible one means the task ended
                complete: shown(exitCss) || shown(contCss),
            };
        }, MODAL_CSS, EXIT_BUTTON_CSS, EXIT_CONTINUE_CSS).catch(() => null);
        if (state === null) return { status: 'aborted' };   // page navigated mid-round
        if (state.modal) return { status: 'modal' };
        if (state.complete) return { status: 'complete' };

        if (enter && !nextClicked) {
            const next = await clickVisibleButton(page, 'Next Question');
            if (next === 'ambiguous') {
                return { status: 'stopped', message: 'More than one visible "Next Question" button exists; stopping instead of guessing which advances the task.' };
            }
            nextClicked = next === 'clicked';
        } else {
            // slides unmount for a beat before the next one mounts (EP is an
            // SPA): a null read here is a transition, not advancement - only a
            // DIFFERENT question (or completion above) proves the round moved on
            const current = await detectQuestion(page);
            if (current !== null && current.key !== descriptor.key) return { status: 'advanced' };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return shouldStop() ? { status: 'aborted' } : { status: 'stopped', message: `The choice round did not advance within ${timeout}ms after submitting; stopping.` };
}

module.exports = { matchChoiceOption, playChoiceRound, clickVisibleButton };
