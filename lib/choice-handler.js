// Multiple-choice rounds (Smart Lessons; assessment controls fail closed), one of the question
// handlers dispatched from answerQuestions (issue #33).
//
// The answer source is EP's own client-side question state: detection has
// already extracted the options and the correct answer text(s), so a round is
// "find the one option matching the shipped correct answer, click it, submit,
// advance". No dictionary, no guessing: zero or multiple matches stop the run
// and report, per the issue's no-guessing rule.
//
// Live UI checks on 2026-10-30: correct choices can advance automatically;
// incorrect choices retain the round key and reveal Next after a timed lock.
// The full automation has been exercised only against the local fixtures.

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
        const renderedOptions = options.map(o => '"' + o + '"').join(', ');
        return { error: `no option matches the correct answer "${correct.join('" / "')}" (options: ${renderedOptions})` };
    }
    if (matches.length > 1) {
        return { error: `${matches.length} options match the correct answer "${correct[0]}"; refusing to guess` };
    }
    return { index: matches[0] };
}

/**
 * The SA navigation bar is a sibling of the question, not its descendant.
 * EP's public live bundle (version 1.152.1, inspected 2026-10-30) binds both
 * to the same model under #rhs-container. Its replaced directive root is
 * #sa-navigation-controls. Require that model identity AND the current round
 * before returning a real handle for a trusted click. No page-wide fallback.
 * Source: https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js
 * This is static template grounding, not a live submit/advance verification.
 * @returns {Promise<'clicked'|'not-found'|'click-failed'|'ambiguous'|'unassociated'>}
 */
async function clickVisibleButton(page, text, descriptor) {
    const handle = await page.evaluateHandle((label, key) => {
        const shown = el => el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
        const modelOf = el => {
            for (let node = el, n = 0; node && n < 8; node = node.parentElement, n++) {
                const a = window.angular?.element(node);
                // Replaced Angular directives expose their controller on the
                // isolate scope; scope() can return an inherited parent scope.
                const scopes = a ? [a.isolateScope?.(), a.scope?.()] : [];
                for (const scope of scopes) {
                    if (scope?.self?.model?._currentQuestion) return scope.self.model;
                }
            }
            return null;
        };
        const question = [...document.querySelectorAll('.multi-choice-component[role=radiogroup]')].find(shown)
            || document.querySelector('#ep-question-container');
        const model = modelOf(question);
        const q = model?._currentQuestion;
        if (!q || model.gameMode !== 3 || `choice:${q.contentID}:${q.questionIndex}` !== key) return { status: 'unassociated' };
        const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown)
            .filter(bar => modelOf(bar) === model);
        if (bars.length !== 1) return { status: bars.length ? 'ambiguous' : 'unassociated' };
        const candidates = [...bars[0].querySelectorAll('button')]
            .filter(b => shown(b) && !b.disabled && (b.innerText || '').trim() === label);
        if (candidates.length !== 1) return { status: candidates.length ? 'ambiguous' : 'not-found' };
        return { status: 'ready', element: candidates[0] };
    }, text, descriptor.key).catch(() => null);
    if (!handle) return 'unassociated';
    let elementHandle;
    try {
        const status = await handle.evaluate(result => result.status);
        if (status !== 'ready') return status;
        elementHandle = await handle.getProperty('element');
        const element = elementHandle.asElement();
        if (!element) return 'not-found';
        await element.click();
        return 'clicked';
    } catch {
        // A trusted click can fail after dispatch. Never treat that uncertain
        // effect as an absent control eligible for an automatic retry.
        return 'click-failed';
    } finally {
        if (elementHandle) await elementHandle.dispose().catch(() => {});
        await handle.dispose().catch(() => {});
    }
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

    const selected = await selectChoiceOption(page, descriptor, shouldStop, log);
    if (selected) return selected;

    if (!enter) {
        log('Option selected; submit it when ready (semi-auto). Nothing else is clicked in semi-auto.');
    } else {
        if (shouldStop()) return { status: 'aborted' };
        const submit = await waitForSubmit(page, descriptor, shouldStop, timeout);
        if (submit === 'aborted') return { status: 'aborted' };
        if (submit !== 'clicked') {
            return {
                status: 'stopped',
                message: submitFailureMessage(submit),
            };
        }
    }

    return await waitForChoiceAdvance(page, descriptor, { enter, timeout, shouldStop });
}

// Keep option reads and disposal sequential: click-time ordering is deliberate.
async function selectChoiceOption(page, descriptor, shouldStop, log) {
    // Match at CLICK time, not detection time: EP can reorder the options
    // between the two without the round key changing, and a stale index would
    // click the wrong answer.
    const handles = await page.$$('div.multi-choice-component[role=radiogroup] ' + CHOICE_OPTION_CSS);
    const visibleHandles = [];
    const clickTimeTexts = [];
    for (const handle of handles) {
        const state = await handle.evaluate(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.shortcut-key').forEach(k => k.remove());
            return {
                visible: el.offsetParent !== null || el.getClientRects().length > 0,
                text: (clone.textContent || '')
                    .replace(/@@[0-9A-Fa-f]{6}@/g, '').replace(/@@/g, '')
                    .replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(),
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
    if (shouldStop()) {
        for (const h of visibleHandles) await h.dispose().catch(() => {});
        return { status: 'aborted' };
    }
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
    return null;
}

// Retry only a missing/not-yet-clickable Submit. Every probe retains the
// original model/mode/key checks; ambiguity and stale association stop now.
async function waitForSubmit(page, descriptor, shouldStop, timeout) {
    const deadline = Date.now() + Math.min(timeout, 3000);
    while (!shouldStop()) {
        const outcome = await clickVisibleButton(page, 'Submit', descriptor);
        if (outcome !== 'not-found') return outcome;
        if (Date.now() >= deadline) return 'not-found';
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return 'aborted';
}

function submitFailureMessage(status) {
    if (status === 'click-failed') return 'The Submit click could not be confirmed; stopping without retrying because it may already have graded the answer.';
    if (status === 'ambiguous') return 'More than one visible Submit button exists on this choice slide; stopping instead of guessing which grades the answer.';
    if (status === 'unassociated') return 'The lesson navigation controls could not be associated with this question; stopping.';
    return 'The choice slide\'s Submit button was not found after selecting an option; stopping.';
}

async function waitForChoiceAdvance(page, descriptor, { enter, timeout, shouldStop }) {
    // Resolve the round: a modal, the task's completion controls, or the
    // question advancing. Correct grading can advance immediately; an
    // explanation can instead require a keyed Next click in auto mode.
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

        const advance = await checkChoiceAdvance(page, descriptor, enter, nextClicked);
        if (advance.result) return advance.result;
        nextClicked = advance.nextClicked;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return shouldStop() ? { status: 'aborted' } : { status: 'stopped', message: `The choice round did not advance within ${timeout}ms after submitting; stopping.` };
}

async function checkChoiceAdvance(page, descriptor, enter, nextClicked) {
    // A correct answer may advance immediately with no Next control.
    // Prove that transition before looking for controls on the old key;
    // clickVisibleButton still refuses every stale-key click.
    const current = await detectQuestion(page);
    if (current !== null && typeof current.key === 'string' && current.key !== descriptor.key) return { result: { status: 'advanced' }, nextClicked };
    if (current !== null && enter && !nextClicked) {
        const next = await clickVisibleButton(page, 'Next Question', descriptor);
        if (next === 'click-failed') return { result: { status: 'stopped', message: 'The Next Question click could not be confirmed; stopping without retrying.' }, nextClicked };
        if (next === 'unassociated') return { result: { status: 'stopped', message: 'The lesson navigation controls could not be associated with this question; stopping.' }, nextClicked };
        if (next === 'ambiguous') {
            return { result: { status: 'stopped', message: 'More than one visible "Next Question" button exists; stopping instead of guessing which advances the task.' }, nextClicked };
        }
        nextClicked = next === 'clicked';
    }
    return { result: null, nextClicked };
}

module.exports = { matchChoiceOption, playChoiceRound, clickVisibleButton };
