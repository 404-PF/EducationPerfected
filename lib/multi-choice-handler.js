const { readMultiChoiceInPage } = require('./multi-choice-state');

// Only trusted DOM clicks select/deselect. Every click gets a fresh complete
// object-identity/selection read; a partial result never reaches Submit.
async function playMultiChoiceSelection(page, descriptor, opts) {
    const stop = opts.shouldStop || (() => false);
    const log = opts.log || (() => {});
    const refused = message => ({ status: 'stopped', message: 'Multi-select stopped: ' + message });
    if (descriptor.representation !== 'multi-renderer' || descriptor.autoMarked !== true) return refused('no verified auto-marked renderer association.');
    let baseline;
    try {
        baseline = await page.evaluateHandle(readMultiChoiceInPage);
        const initial = await baseline.evaluate(r => r?.descriptor);
        if (JSON.stringify(initial) !== JSON.stringify(descriptor)) return refused('question changed before selection.');
        // Finite initial plan, never a retrying toggle loop. Preselected correct
        // options are left alone, preselected wrong options are deselected.
        const plan = descriptor.options.filter(o => o.selected !== descriptor.correct.includes(o.id)).map(o => o.id);
        const expectedSelected = new Set(descriptor.options.filter(o => o.selected).map(o => o.id));
        const sameSelection = d => Array.isArray(d?.options) && d.options.every(o => o.selected === expectedSelected.has(o.id));
        for (const id of plan) {
            if (stop()) return { status: 'aborted' };
            const before = await page.evaluateHandle(readMultiChoiceInPage, baseline, id);
            let target;
            try {
                const d = await before.evaluate(r => r?.descriptor);
                if (d?.kind !== 'choice' || d.autoMarked !== true || !sameSelection(d)) return refused(d?.reason || 'option association or selection changed.');
                target = await before.getProperty('target');
                const element = target.asElement();
                if (!element) return refused('option detached before click.');
                if (stop()) return { status: 'aborted' };
                await element.click();
            } finally {
                if (target) await target.dispose().catch(() => {});
                await before.dispose().catch(() => {});
            }
            const afterHandle = await page.evaluateHandle(readMultiChoiceInPage, baseline);
            const after = await afterHandle.evaluate(r => r?.descriptor);
            await afterHandle.dispose();
            if (after?.kind !== 'choice' || after.autoMarked !== true) return refused(after?.reason || 'selection could not be verified.');
            if (descriptor.correct.includes(id)) expectedSelected.add(id);
            else expectedSelected.delete(id);
            const row = after.options.find(o => o.id === id);
            if (!row || !sameSelection(after)) return refused('trusted click did not produce the expected selected state; no retry.');
        }
        if (stop()) return { status: 'aborted' };
        const final = await page.evaluateHandle(readMultiChoiceInPage, baseline, opts.enter ? 'submit' : 'verify');
        let target;
        try {
            const d = await final.evaluate(r => r?.descriptor);
            if (d?.kind !== 'choice' || d.autoMarked !== true) return refused(d?.reason || 'final exact selected set could not be verified.');
            log('Selected exact multi-select answer set.');
            if (!opts.enter) return null; // Caller waits; no Submit or Next in semi-auto.
            target = await final.getProperty('target');
            const element = target.asElement();
            if (!element) return refused('Submit detached before click.');
            if (stop()) return { status: 'aborted' };
            await element.click(); // Once only: an exception may still mean graded.
        } finally {
            if (target) await target.dispose().catch(() => {});
            await final.dispose().catch(() => {});
        }
        return null;
    } catch {
        return refused('inspection or click failed; no submission retry because a click may already have taken effect.');
    } finally {
        if (baseline) await baseline.dispose().catch(() => {});
    }
}
module.exports = { playMultiChoiceSelection };
