const assert = require('node:assert/strict');
const { createAssessmentQuestionStateFixture } = require('./assessment-question-state-fixture');

// This is a field/update matrix for an ORIGINAL offline model, not a test of
// EP's actual function or proof of server grading. Literal expected rows keep
// answer changes, user state, attempt state and persistence separate.
let sourceUpdate;
if (process.argv[2] === '--source') {
    const fs = require('node:fs');
    const crypto = require('node:crypto');
    const vm = require('node:vm');
    const bytes = fs.readFileSync(process.argv[3]);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'd6cd2c7eb1d99610fd5369acf793b75a00762646f6a8e20cb6cea396f4f47722', 'unknown source snapshot: do not evaluate');
    const source = bytes.toString('utf8');
    const prefix = 'InGameAssessmentQuestionStatesManager.prototype.updateQuestionState=';
    const suffix = ',InGameAssessmentQuestionStatesManager.prototype.getStoredUserAnswerAndStateForQuestion=';
    const start = source.indexOf(prefix);
    assert.ok(start >= 0);
    const end = source.indexOf(suffix, start);
    assert.ok(end > start);
    sourceUpdate = vm.runInNewContext('(' + source.slice(start + prefix.length, end) + ')', {
        InGameAssessmentQuestionStatesManager: { GRADE_CORRECT: 1, GRADE_INCORRECT: 0 },
    }, { timeout: 1000 });
}

const initial = {
    UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, UserState: 'stored',
    TimeTaken: 8, Seen: true, Attempted: false, FlaggedForLater: false, SequenceNumber: 4,
};
const baseline = { answer: 'new', userState: null, edited: false, correct: false, fraction: 0.25, elapsed: 0, flagged: false };
const rows = [
    ['unedited', {}, { UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, UserState: 'stored', Attempted: false }],
    ['edited incorrect', { edited: true }, { UsersAnswer: 'new', Grade: 0, ScoreFraction: 0.25, Attempted: true }],
    ['edited correct', { edited: true, correct: true, fraction: 1 }, { UsersAnswer: 'new', Grade: 1, ScoreFraction: 1, Attempted: true }],
    ['correct but unedited', { correct: true }, { UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, Attempted: true }],
    ['empty edited answer', { answer: '', edited: true }, { UsersAnswer: '', Grade: 0, ScoreFraction: 0.25, Attempted: true }],
    ['null edited answer', { answer: null, edited: true }, { UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, Attempted: true }],
    ['undefined edited answer', { answer: undefined, edited: true }, { UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, Attempted: true }],
    ['empty user state', { userState: '' }, { UsersAnswer: 'old', UserState: '', Attempted: false }],
    ['changed user state', { userState: 'updated' }, { UsersAnswer: 'old', UserState: 'updated', Attempted: false }],
    ['undefined user state', { userState: undefined }, { UserState: 'stored', Attempted: false }],
    ['flag only', { flagged: true }, { UsersAnswer: 'old', FlaggedForLater: true, Attempted: false }],
    ['elapsed only', { elapsed: 3 }, { UsersAnswer: 'old', TimeTaken: 3, Seen: true, Attempted: false }],
];
for (const [name, change, expected] of rows) {
    const fixture = createAssessmentQuestionStateFixture(initial);
    const input = { ...baseline, ...change };
    const before = { ...input };
    const result = fixture.update(input);
    const expectedState = { ...initial, TimeTaken: input.elapsed, Seen: input.elapsed > 0, FlaggedForLater: input.flagged, SequenceNumber: 5, ...expected };
    assert.deepEqual(result, expectedState, name);
    assert.deepEqual(fixture.snapshot(), { state: expectedState, writes: [expectedState] }, name);
    assert.deepEqual(input, before, `${name}: input unchanged`);
    if (sourceUpdate) {
        const state = { ...initial };
        const writes = [];
        const receiver = {
            getAttemptForContentID(id) { assert.equal(id, 17); return state; },
            assessmentPersistenceService: { storeQuestionState(values) { writes.push(...values.map(value => ({ ...value }))); } },
        };
        sourceUpdate.call(receiver, 17, input.answer, input.userState, input.edited, input.correct, input.fraction, input.elapsed, input.flagged);
        assert.deepEqual(state, expectedState, `${name}: pinned actual source`);
        assert.deepEqual(writes, [expectedState], `${name}: pinned actual persistence edge`);
    }
}
// Unedited/no-answer updates still save metadata on every call. Attempted is
// sticky; Seen is derived from the supplied elapsed value and is not sticky.
const fixture = createAssessmentQuestionStateFixture({ ...initial, Attempted: true });
fixture.update({ ...baseline, elapsed: 9 });
fixture.update({ ...baseline, answer: null, elapsed: 0, flagged: true });
const result = fixture.snapshot();
assert.equal(result.state.UsersAnswer, 'old');
assert.equal(result.state.Attempted, true);
assert.equal(result.state.Seen, false);
assert.equal(result.state.SequenceNumber, 6);
assert.equal(result.writes.length, 2);
assert.equal(result.writes[0].Seen, true);
assert.equal(result.writes[0].FlaggedForLater, false);
assert.equal(result.writes[1].FlaggedForLater, true);
assert.deepEqual(initial, { UsersAnswer: 'old', Grade: 1, ScoreFraction: 0.75, UserState: 'stored', TimeTaken: 8, Seen: true, Attempted: false, FlaggedForLater: false, SequenceNumber: 4 });
console.log('Assessment state matrix PASS:12literal update cases, sticky attempted/nonsticky seen, null/empty separation and per-update persistence. Original offline model only, not EP/server proof.');

if (sourceUpdate) console.log('Pinned source audit PASS: same12literal rows execute the hash-verified EP update method with stubbed lookup/persistence; no app/network access.');
