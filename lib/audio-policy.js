// Explicit section marking takes precedence. The extra classic-list path is
// source-grounded, not a claim that absent section marking means true.
function audioAllowanceBasis(d) {
    if (d?.kind !== 'audio') return null;
    if (d.autoMarked === true) return 'explicit-auto';
    if (d.autoMarked !== 'unknown' || d.sectionDataPresent !== false) return null;
    if (d.selfTestList === true) return 'self-test';
    if (d.classicAssignedAudio === true) return 'assigned-classic';
    return null;
}
function audioAllowed(d) {
    return audioAllowanceBasis(d) !== null;
}
function audioPolicyUnchanged(before, after, answer) {
    return Boolean(audioAllowed(before) && audioAllowed(after) && before.key === after.key
        && audioAllowanceBasis(before) === audioAllowanceBasis(after)
        && before.audioContextSignature === after.audioContextSignature
        && (answer === undefined || after.answers?.includes(answer)));
}
module.exports = { audioAllowed, audioPolicyUnchanged };
