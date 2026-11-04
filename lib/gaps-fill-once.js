// The caller owns browser attachment, exclusive controls and owner permission.
// No launch, navigation, start loop, Submit or Next path is exposed here.
function createFillGapsOnce({ detectQuestion, playGapsRound }) {
    let attempted = false;
    return async function fillGapsOnce(page, { shouldStop = () => false, expectedDescriptor } = {}) {
        if (attempted) return { status: 'refused', reason: 'one-shot attempt already consumed' };
        attempted = true;
        let filled = false;
        const cancelled = () => shouldStop();
        try {
            if (cancelled()) return { status: 'aborted' };
            const descriptor = await detectQuestion(page);
            if (cancelled()) return { status: 'aborted' };
            if (descriptor?.kind !== 'gaps' || descriptor.autoMarked !== true
                || descriptor.representation !== 'gaps-renderer' || !descriptor.gaps?.length
                || descriptor.gaps.some(g => g.filled)) {
                return { status: 'refused', reason: 'requires supported empty auto-marked gaps' };
            }
            if (expectedDescriptor && JSON.stringify(descriptor) !== JSON.stringify(expectedDescriptor)) {
                return { status: 'refused', reason: 'inspected question changed before fill' };
            }
            // The existing handler logs only after exact final-set verification.
            // Set stop synchronously at that checkpoint, before its waiting loop.
            const result = await playGapsRound(page, descriptor, {
                enter: false,
                timeout: 0,
                shouldStop: () => filled || cancelled(),
                log: () => { filled = true; }
            });
            if (filled && result.status === 'aborted') return { status: 'filled-only' };
            return { status: result.status === 'aborted' ? 'aborted' : 'stopped', reason: 'one-shot did not verify the full set' };
        } catch {
            return { status: 'stopped', reason: 'inspection or input uncertain; no retry' };
        }
    };
}
module.exports = { createFillGapsOnce };
