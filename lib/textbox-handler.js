const { NUMBER_BOX_CONFIG, TEXTBOX_CONFIG, readInputBoxesInPage } = require('./textbox-state');

const HANDLERS = {
    textbox: {
        state: TEXTBOX_CONFIG,
        stopped: 'Lesson textboxes stopped: changed or unsupported state; no retry.',
        filled: 'Filled exact lesson textbox answers.',
        transition: 'Lesson textboxes stopped: unsupported or changed slide; submission outcome not verified; no retry.',
        uncertain: 'Lesson textboxes stopped: inspection or input result uncertain; no retry.',
    },
    numberbox: {
        state: NUMBER_BOX_CONFIG,
        stopped: 'Lesson number boxes stopped: changed or unsupported state; no retry.',
        filled: 'Filled exact lesson number-box answers.',
        transition: 'Lesson number boxes stopped: unsupported or changed slide; submission outcome not verified; no retry.',
        uncertain: 'Lesson number boxes stopped: inspection or input result uncertain; no retry.',
    },
};

async function playInputBoxesRound(page, descriptor, opts, config) {
    const stop = opts.shouldStop || (() => false);
    const refused = () => ({ status: 'stopped', reason: 'unsafe-or-changed-state', message: config.stopped });
    let baseline;
    const handles = [];
    try {
        if (descriptor.kind !== config.state.kind || descriptor.autoMarked !== true || descriptor.boxes.some(b => b.value !== '')) return refused();
        baseline = await page.evaluateHandle(readInputBoxesInPage, null, undefined, config.state);
        if (!await baseline.evaluate((r, d) => JSON.stringify(r?.descriptor) === JSON.stringify(d), descriptor)) return refused();
        const expected = descriptor.boxes.map(() => '');
        const check = async (index, active = false) => {
            const state = await page.evaluateHandle(readInputBoxesInPage, baseline, index, config.state);
            try {
                if (!await state.evaluate((r, values, focus, kind) => r?.descriptor?.kind === kind && r.descriptor.boxes.every((b, i) => b.value === values[i])
                    && (!focus || (document.activeElement === r.target && r.target.selectionStart === r.target.value.length && r.target.selectionEnd === r.target.value.length)), expected, active, config.state.kind)) return null;
                if (active) return true; // Focus/prefix checks need no retained target handle.
                const handle = await state.getProperty('target');
                handles.push(handle);
                return handle.asElement();
            } finally { await state.dispose(); }
        };
        for (let i = 0; i < descriptor.boxes.length; i++) {
            if (stop()) return { status: 'aborted' };
            const element = await check(i);
            if (!element) return refused();
            await element.focus();
            for (const char of descriptor.boxes[i].answer) {
                if (stop()) return { status: 'aborted' };
                if (!await check(i, true)) return refused();
                if (stop()) return { status: 'aborted' };
                await element.type(char); // No Enter or replacement/retry. EP input events update cached answer.
                expected[i] += char;
                if (!await check(i, true)) return refused();
            }
        }
        if (stop()) return { status: 'aborted' };
        if (!await check(0)) return refused();
        opts.log?.(config.filled);
        if (opts.enter) {
            const final = await page.evaluateHandle(readInputBoxesInPage, baseline, 'submit', config.state);
            try {
                if (!await final.evaluate((r, kind) => r?.descriptor?.kind === kind && !!r.target, config.state.kind)) return refused();
                const button = await final.getProperty('target');
                handles.push(button);
                const element = button.asElement();
                if (!element) return refused();
                if (opts.requireSubmitApproval) {
                    if (typeof opts.approveSubmit !== 'function') return refused();
                    let approved;
                    try { approved = await opts.approveSubmit({ key: descriptor.key, boxCount: descriptor.boxes.length }); }
                    catch { return refused(); }
                    if (approved !== true) return refused();
                    if (stop()) return { status: 'aborted' };
                }
                await element.scrollIntoView();
                const point = await element.clickablePoint();
                const last = await page.evaluateHandle(readInputBoxesInPage, baseline, 'submit', config.state);
                try { if (!await last.evaluate((r, el, kind) => r?.descriptor?.kind === kind && r.target === el, element, config.state.kind)) return refused(); }
                finally { await last.dispose(); }
                if (!await element.evaluate((el, p) => {
                    const hit = document.elementFromPoint(p.x, p.y);
                    return hit === el || el.contains(hit);
                }, point)) return refused();
                if (stop()) return { status: 'aborted' };
                await page.mouse.click(point.x, point.y); // One Submit, never Next or retry.
            } finally { await final.dispose(); }
        }
        const deadline = opts.enter ? Date.now() + opts.timeout : Infinity;
        while (!stop() && Date.now() < deadline) {
            const current = await require('./detect-question').detectQuestion(page);
            const modal = await page.$('div[uib-modal-window=modal-window]');
            if (modal) { await modal.dispose(); return { status: 'modal' }; }
            if (current && typeof current.key === 'string' && current.key !== descriptor.key) return { status: 'advanced' };
            // Conservative stop, not a claim that submission failed. Do not
            // continue answering through an unrecognized slide.
            if (current?.kind === 'unsupported') return { status: 'stopped', reason: 'unsupported', message: config.transition };
            if (current === null && await page.evaluate(() => [...document.querySelectorAll('button.exit-button,button.continue-button')]
                .some(el => !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0)))) return { status: 'complete' };
            await new Promise(r => setTimeout(r, 100));
        }
        return stop() ? { status: 'aborted' } : refused();
    } catch { return { status: 'stopped', reason: 'inspection-or-dispatch-uncertain', message: config.uncertain }; }
    finally {
        for (const h of handles) await h.dispose().catch(() => {});
        if (baseline) await baseline.dispose().catch(() => {});
    }
}

async function playTextboxRound(page, descriptor, opts) {
    return playInputBoxesRound(page, descriptor, opts, HANDLERS.textbox);
}
async function playNumberBoxRound(page, descriptor, opts) {
    return playInputBoxesRound(page, descriptor, opts, HANDLERS.numberbox);
}

module.exports = { playTextboxRound, playNumberBoxRound };
