// Multiple-choice question handler.
//
// This lives outside index.js so the smoke test can drive the same code against
// scripts/mock-ep.js instead of re-implementing the click/verify/submit sequence.
// Selectors are injected: index.js passes DIR's entries, the smoke test passes the
// mock page's equivalents.

/**
 * Normalises an option label or answer candidate for comparison: collapses
 * whitespace and ignores case.
 * @param {string} text
 * @returns {string}
 */
function normaliseOption(text) {
    return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Builds the handler for multiple-choice questions. The returned handler follows the
 * interface used by index.js's QUESTION_HANDLERS:
 *   detect()        - resolves true when the page shows a choice group with options
 *   advanced(state) - true when the submitted round cleared or removed the selection
 *   answer(candidates) - clicks the single option matching any candidate and verifies
 *                     the selection; resolves { status: 'ready'|'unmatched'|'unverified' }
 *   submit()        - clicks the submit control, or presses Enter when it is absent
 * @param {object} options
 * @param {import('puppeteer').Page} options.page
 * @param {{groupCss: string, optionCss: string, submitCss: string}} options.selectors
 * @returns {{type: string, detect: Function, advanced: Function, answer: Function, submit: Function}}
 */
function createChoiceHandler({ page, selectors }) {
    const { groupCss, optionCss, submitCss } = selectors;

    return {
        type: 'choice',

        /**
         * Resolves true when a choice group with at least one option is on screen.
         * Runs on every pass, so it reads the page in one round-trip and retains no
         * element handles.
         * @returns {Promise<boolean>}
         */
        async detect() {
            return page.evaluate((gCss, oCss) => {
                const group = document.querySelector(gCss);
                return group !== null && group.querySelectorAll(oCss).length > 0;
            }, groupCss, optionCss).catch(() => false);
        },

        /**
         * True when the round advanced: the selection was cleared or the group went
         * away. A text box emptying is meaningless for this type.
         * @param {{choice: {selected: number}|null}} state
         * @returns {boolean}
         */
        advanced(state) {
            return state.choice === null || state.choice.selected === 0;
        },

        /**
         * Clicks the option matching one of the candidate answers and verifies the
         * selection before returning. Candidates are tried together, so an absent
         * first candidate does not hide a later one that matches an option.
         * Never clicks when zero or several options match: guessing is not allowed.
         * @param {string[]} candidates
         * @returns {Promise<{status: 'ready'|'unmatched'|'unverified', answer?: string, detail?: string}>}
         */
        async answer(candidates) {
            const wanted = new Set((Array.isArray(candidates) ? candidates : [candidates])
                .map(normaliseOption)
                .filter(Boolean));
            const options = await page.$$(optionCss);
            try {
                const labels = await Promise.all(options.map(o => o.evaluate(el => el.innerText)));
                const matches = labels
                    .map((label, i) => wanted.has(normaliseOption(label)) ? i : -1)
                    .filter(i => i >= 0);
                const summary = labels.map(l => l.trim()).join(' | ');
                if (matches.length === 0) {
                    console.log(`No known answer is among the options [${summary}].`);
                    return { status: 'unmatched', detail: `options were [${summary}]` };
                }
                if (matches.length > 1) {
                    console.log(`The known answers match ${matches.length} options [${summary}]; refusing to guess.`);
                    return { status: 'unmatched', detail: `${matches.length} options matched` };
                }

                await options[matches[0]].click();
                // verify the selection took before anything is submitted
                for (let i = 0; i < 20; i++) {
                    const selected = await Promise.all(options.map(o => o.evaluate(el =>
                        el.getAttribute('aria-checked') === 'true'
                        || el.classList.contains('selected')
                        || (el.querySelector('input') ? el.querySelector('input').checked : false)
                    ).catch(() => false)));
                    if (selected[matches[0]] && selected.filter(Boolean).length === 1) {
                        return { status: 'ready', answer: labels[matches[0]].trim() };
                    }
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                return { status: 'unverified', detail: 'the selection never verified' };
            } finally {
                await Promise.all(options.map(o => o.dispose().catch(() => { })));
            }
        },

        /**
         * Submits the selected option, falling back to Enter when the submit control
         * is not rendered.
         * @returns {Promise<void>}
         */
        async submit() {
            const button = await page.$(submitCss);
            if (!button) {
                await page.keyboard.press('Enter');
                return;
            }
            try {
                await button.click();
            } finally {
                await button.dispose().catch(() => { });
            }
        },
    };
}

module.exports = { createChoiceHandler, normaliseOption };
