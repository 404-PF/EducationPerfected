// Multiple-choice rounds (Smart Lessons; assessment controls fail closed), one of the question
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
 * The SA navigation bar is a sibling of the question, not its descendant.
 * EP's public live bundle (version 1.152.1, inspected 2026-10-30) binds both
 * to the same model under #rhs-container. Its replaced directive root is
 * #sa-navigation-controls. Require that model identity AND the current round
 * before returning a real handle for a trusted click. No page-wide fallback.
 * Source: https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js
 * This is static template grounding, not a live submit/advance verification.
 * @returns {Promise<'clicked'|'not-found'|'ambiguous'|'unassociated'>}
 */
async function clickVisibleButton(page, text, descriptor) {
    const handle = await page.evaluateHandle((label, key) => {
        const shown = el => el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
        const modelOf = el => {
            for (let node = el, n = 0; node && n < 8; node = node.parentElement, n++) {
                const a = window.angular && window.angular.element(node);
                // Replaced Angular directives expose their controller on the
                // isolate scope; scope() can return an inherited parent scope.
                const scopes = a ? [a.isolateScope && a.isolateScope(), a.scope && a.scope()] : [];
                for (const scope of scopes) {
                    if (scope && scope.self && scope.self.model && scope.self.model._currentQuestion) return scope.self.model;
                }
            }
            return null;
        };
        const question = [...document.querySelectorAll('.multi-choice-component[role=radiogroup]')].find(shown)
            || document.querySelector('#ep-question-container');
        const model = modelOf(question);
        const q = model && model._currentQuestion;
        if (!q || model.gameMode !== 3 || `choice:${q.contentID}:${q.questionIndex}` !== key) return 'unassociated';
        const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown)
            .filter(bar => modelOf(bar) === model);
        if (bars.length !== 1) return bars.length ? 'ambiguous' : 'unassociated';
        const candidates = [...bars[0].querySelectorAll('button')]
            .filter(b => shown(b) && !b.disabled && (b.innerText || '').trim() === label);
        if (candidates.length !== 1) return candidates.length ? 'ambiguous' : 'not-found';
        return candidates[0];
    }, text, descriptor.key).catch(() => null);
    if (!handle) return 'unassociated';
    try {
        const element = handle.asElement();
        if (!element) return await handle.jsonValue();
        await element.click();
        return 'clicked';
    } catch {
        return 'not-found';
    } finally {
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

    if (!enter) {
        log('Option selected; submit it when ready (semi-auto). Nothing else is clicked in semi-auto.');
    } else {
        if (shouldStop()) return { status: 'aborted' };
        const submit = await clickVisibleButton(page, 'Submit', descriptor);
        if (submit !== 'clicked') {
            return {
                status: 'stopped',
                message: submit === 'ambiguous'
                    ? 'More than one visible Submit button exists on this choice slide; stopping instead of guessing which grades the answer.'
                    : submit === 'unassociated'
                        ? 'The lesson navigation controls could not be associated with this question; stopping.'
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

        // A correct answer may advance immediately with no Next control.
        // Prove that transition before looking for controls on the old key;
        // clickVisibleButton still refuses every stale-key click.
        const current = await detectQuestion(page);
        if (current !== null && typeof current.key === 'string' && current.key !== descriptor.key) return { status: 'advanced' };
        if (current !== null && enter && !nextClicked) {
            const next = await clickVisibleButton(page, 'Next Question', descriptor);
            if (next === 'unassociated') return { status: 'stopped', message: 'The lesson navigation controls could not be associated with this question; stopping.' };
            if (next === 'ambiguous') {
                return { status: 'stopped', message: 'More than one visible "Next Question" button exists; stopping instead of guessing which advances the task.' };
            }
            nextClicked = next === 'clicked';
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return shouldStop() ? { status: 'aborted' } : { status: 'stopped', message: `The choice round did not advance within ${timeout}ms after submitting; stopping.` };
}

module.exports = { matchChoiceOption, playChoiceRound, clickVisibleButton };
