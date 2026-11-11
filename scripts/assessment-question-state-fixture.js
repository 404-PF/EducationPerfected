// Original test-only model of the update edges in the pinned public source.
// Not imported by runtime code. No EP manager, getter, API or live state access.
function createAssessmentQuestionStateFixture(initial) {
    let state = { ...initial };
    const writes = [];
    return {
        update({ answer, userState, edited, correct, fraction, elapsed, flagged }) {
            const next = { ...state };
            if (answer !== null && answer !== undefined && edited) {
                next.UsersAnswer = answer;
                next.Grade = correct ? 1 : 0;
                next.ScoreFraction = fraction;
            }
            if (userState !== null && userState !== undefined) next.UserState = userState;
            next.TimeTaken = elapsed;
            next.Seen = elapsed > 0;
            next.Attempted = state.Attempted || edited || correct;
            next.FlaggedForLater = flagged;
            next.SequenceNumber++;
            state = next;
            writes.push({ ...next });
            return { ...next };
        },
        snapshot() { return { state: { ...state }, writes: writes.map(write => ({ ...write })) }; },
    };
}
module.exports = { createAssessmentQuestionStateFixture };
