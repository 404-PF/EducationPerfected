const { readGapsInPage } = require('./gaps-state');
const { detectQuestion } = require('./detect-question');

async function playGapsRound(page, descriptor, opts) {
    const stop = opts.shouldStop || (() => false);
    const refused = message => ({ status: 'stopped', message: 'Drag-and-drop gaps stopped: ' + message });
    let baseline;
    try {
        if (descriptor.autoMarked !== true || descriptor.representation !== 'gaps-renderer' || descriptor.gaps.some(g => g.filled)) return refused('requires explicit auto-marking and initially empty gaps.');
        baseline = await page.evaluateHandle(readGapsInPage);
        const initial = await baseline.evaluate(r => r?.descriptor);
        if (JSON.stringify(initial) !== JSON.stringify(descriptor)) return refused('question changed before selection.');
        const prefix = (d, n) => d?.kind === 'gaps' && d.autoMarked === true && d.gaps.every((g, i) => g.filled === (i < n));
        for (let i = 0; i < descriptor.gaps.length; i++) {
            if (stop()) return { status: 'aborted' };
            const before = await page.evaluateHandle(readGapsInPage, baseline, i);
            let target;
            try {
                if (!prefix(await before.evaluate(r => r?.descriptor), i)) return refused('answer or selection changed before input.');
                target = await before.getProperty('target');
                const element = target.asElement();
                if (!element) return refused('option detached.');
                // A trusted key event follows EP's own accessible interaction path.
                // focus() can trigger page listeners, so re-read after focusing too.
                await element.focus();
                const ready = await page.evaluateHandle(readGapsInPage, baseline, i);
                try {
                    if (!await ready.evaluate((r, el, n) => r?.descriptor?.kind === 'gaps' && r.descriptor.autoMarked === true
                        && r.target === el && document.activeElement === el && r.descriptor.gaps.every((g, j) => g.filled === (j < n)), element, i)) return refused('focused option or gap changed.');
                } finally { await ready.dispose(); }
                if (stop()) return { status: 'aborted' };
                await element.press('Enter'); // Once: an uncertain key must not be retried.
            } finally {
                if (target) await target.dispose().catch(() => {});
                await before.dispose().catch(() => {});
            }
            const after = await page.evaluateHandle(readGapsInPage, baseline);
            try {
                if (!prefix(await after.evaluate(r => r?.descriptor), i + 1)) return refused('trusted key did not produce the exact expected answer prefix; no retry.');
            } finally { await after.dispose(); }
        }
        const deadline = Date.now() + Math.min(Math.max(opts.timeout || 0, 0), 3000);
        let final;
        while (true) {
            if (stop()) return { status: 'aborted' };
            final = await page.evaluateHandle(readGapsInPage, baseline, opts.enter ? 'submit' : 'verify');
            if (!await final.evaluate(r => r?.readiness === 'not-ready') || Date.now() >= deadline) break;
            await final.dispose();
            await new Promise(r => setTimeout(r, 50));
        }
        let button;
        try {
            if (!prefix(await final.evaluate(r => r?.descriptor), descriptor.gaps.length)) return refused('final answers could not be verified.');
            opts.log?.('Filled exact drag-and-drop gap answers.');
            if (opts.enter) {
                button = await final.getProperty('target');
                const element = button.asElement();
                if (!element) return refused('Submit unavailable.');
                const last = await page.evaluateHandle(readGapsInPage, baseline, 'submit');
                try {
                    if (!await last.evaluate((r, el) => r?.descriptor?.kind === 'gaps' && r.descriptor.autoMarked === true
                        && !r.readiness && r.target === el, element)) return refused('answers or Submit changed before click.');
                } finally { await last.dispose(); }
                if (stop()) return { status: 'aborted' };
                await element.click(); // Submit exactly once; no retry or Next recovery.
            }
        } finally {
            if (button) await button.dispose().catch(() => {});
            await final.dispose().catch(() => {});
        }
        const end = opts.enter ? Date.now() + opts.timeout : Infinity;
        while (!stop() && Date.now() < end) {
            const modal = await page.$('div[uib-modal-window=modal-window]');
            if (modal) { await modal.dispose(); return {status:'modal'}; }
            const complete = await page.evaluate(() => [...document.querySelectorAll('button.exit-button,button.continue-button')]
                .some(el => !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0)));
            const current = await detectQuestion(page);
            if (complete && current === null) return { status: 'complete' };
            if (current && typeof current.key === 'string' && current.key !== descriptor.key) return { status: 'advanced' };
            await new Promise(r => setTimeout(r, 100));
        }
        return stop() ? { status: 'aborted' } : refused('round did not advance; no Next or submission retry.');
    } catch {
        return refused('inspection or input failed; no retry because input may have taken effect.');
    } finally {
        if (baseline) await baseline.dispose().catch(() => {});
    }
}
module.exports = { playGapsRound };
