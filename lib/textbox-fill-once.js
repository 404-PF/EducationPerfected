// One process attempt, including refusal/cancellation/uncertainty. Only the
// existing guarded textbox handler can type; Submit and the loop are disabled.
function createFillTextboxesOnce({ detectQuestion, playTextboxRound }) {
    let consumed = false;
    return async function fillTextboxesOnce(page, { shouldStop = () => false } = {}) {
        if (consumed) return { status: 'refused', reason: 'attempt-consumed' };
        consumed = true;
        let verified = false;
        try {
            if (shouldStop()) return { status: 'aborted' };
            const question = await detectQuestion(page);
            if (shouldStop()) return { status: 'aborted' };
            if (question?.kind !== 'textbox' || question.autoMarked !== true || !question.boxes?.length
                || question.boxes.some(box => box.value !== '')) return { status: 'refused', reason: 'requires-supported-empty-textboxes' };
            const result = await playTextboxRound(page, question, {
                enter: false, timeout: 0,
                shouldStop: () => verified || shouldStop(),
                log: () => { verified = true; }
            });
            if (verified && result.status === 'aborted') return { status: 'filled-only' };
            return { status: 'stopped', reason: 'fill-not-verified-input-may-be-partial' };
        } catch { return { status: 'stopped', reason: 'inspection-or-input-uncertain' }; }
    };
}
module.exports = { createFillTextboxesOnce };
