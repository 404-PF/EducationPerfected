const { readTextboxesInPage } = require('./textbox-state');
async function playTextboxRound(page, descriptor, opts) {
    const stop = opts.shouldStop || (() => false);
    const refused = () => ({ status: 'stopped', reason: 'unsafe-or-changed-state', message: 'Lesson textboxes stopped: changed or unsupported state; no retry.' });
    let baseline;
    const handles = [];
    try {
        if (descriptor.kind !== 'textbox' || descriptor.autoMarked !== true || descriptor.boxes.some(b => b.value !== '')) return refused();
        baseline = await page.evaluateHandle(readTextboxesInPage);
        if (!await baseline.evaluate((r, d) => JSON.stringify(r?.descriptor) === JSON.stringify(d), descriptor)) return refused();
        const expected = descriptor.boxes.map(() => '');
        const check = async (index, active = false) => {
            const state = await page.evaluateHandle(readTextboxesInPage, baseline, index);
            try {
                if (!await state.evaluate((r, values, focus) => r?.descriptor?.kind === 'textbox' && r.descriptor.boxes.every((b, i) => b.value === values[i])
                    && (!focus || document.activeElement === r.target), expected, active)) return null;
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
        opts.log?.('Filled exact lesson textbox answers.');
        if (opts.enter) {
            const final = await page.evaluateHandle(readTextboxesInPage, baseline, 'submit');
            try {
                if (!await final.evaluate(r => r?.descriptor?.kind === 'textbox' && !!r.target)) return refused();
                const button = await final.getProperty('target');
                handles.push(button);
                const element = button.asElement();
                if (!element) return refused();
                await element.scrollIntoView();
                const point = await element.clickablePoint();
                const last = await page.evaluateHandle(readTextboxesInPage, baseline, 'submit');
                try { if (!await last.evaluate((r, el) => r?.descriptor?.kind === 'textbox' && r.target === el, element)) return refused(); }
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
            if (current && typeof current.key === 'string' && current.key !== descriptor.key) return { status: 'advanced' };
            if (current === null && await page.evaluate(() => [...document.querySelectorAll('button.exit-button,button.continue-button')]
                .some(el => !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0)))) return { status: 'complete' };
            const modal = await page.$('div[uib-modal-window=modal-window]');
            if (modal) { await modal.dispose(); return { status: 'modal' }; }
            await new Promise(r => setTimeout(r, 100));
        }
        return stop() ? { status: 'aborted' } : refused();
    } catch { return { status: 'stopped', reason: 'inspection-or-dispatch-uncertain' }; }
    finally {
        for (const h of handles) await h.dispose().catch(() => {});
        if (baseline) await baseline.dispose().catch(() => {});
    }
}
module.exports = { playTextboxRound };
