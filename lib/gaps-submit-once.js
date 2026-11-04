const { readGapsInPage } = require('./gaps-state');
// Own one attempt across inspection, filling and one trusted Submit click.
// Never calls an answer loop, Next, marking internals or a second input after Submit.
function createSubmitGapsOnce({ fillGapsOnce }) {
    let attempted = false;
    return async function submitGapsOnce(page, { shouldStop = () => false } = {}) {
        if (attempted) return { status: 'refused' };
        attempted = true;
        let baseline, final, button;
        try {
            if (shouldStop()) return { status: 'aborted' };
            baseline = await page.evaluateHandle(readGapsInPage);
            const initial = await baseline.evaluate(r => r?.descriptor);
            if (initial?.kind !== 'gaps' || initial.autoMarked !== true || !initial.gaps?.length
                || initial.gaps.some(g => g.filled)) return { status: 'refused' };
            if (shouldStop()) return { status: 'aborted' };
            const filled = await fillGapsOnce(page, { shouldStop });
            if (filled.status !== 'filled-only') return { status: 'stopped' };
            if (shouldStop()) return { status: 'aborted' };
            final = await page.evaluateHandle(readGapsInPage, baseline, 'submit');
            if (!await final.evaluate(r => r?.descriptor?.kind === 'gaps' && r.descriptor.autoMarked === true
                && r.descriptor.gaps.every(g => g.filled) && !r.readiness && !!r.target)) return { status: 'refused' };
            button = await final.getProperty('target');
            const element = button.asElement();
            if (!element) return { status: 'refused' };
            const last = await page.evaluateHandle(readGapsInPage, baseline, 'submit');
            try {
                if (!await last.evaluate((r, el) => r?.descriptor?.kind === 'gaps' && r.descriptor.autoMarked === true
                    && r.descriptor.gaps.every(g => g.filled) && !r.readiness && r.target === el, element)) return { status: 'refused' };
            } finally { await last.dispose(); }
            if (shouldStop()) return { status: 'aborted' };
            await element.click(); // At most once. EP may automatically advance; do nothing there.
            return { status: 'submitted-once' }; // Dispatch only, not a marking/acceptance claim.
        } catch {
            return { status: 'stopped' }; // Input may have happened. No retry.
        } finally {
            for (const handle of [button, final, baseline]) if (handle) await handle.dispose().catch(() => {});
        }
    };
}
module.exports = { createSubmitGapsOnce };
